"""Runtime regressions: cache safety, bounded model calls and honest failure evidence."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from httpx import ReadTimeout

from backend import app as app_module, gemini_client
from backend.tests.test_app import BODY, fake_asker, fake_reader


@pytest.fixture
def static_client(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<h1>Last Mile Guard</h1>", encoding="utf-8")
    (tmp_path / "assets" / "index-aB34_678.js").write_text("export {};", encoding="utf-8")
    (tmp_path / "assets" / "unversioned.js").write_text("export {};", encoding="utf-8")
    monkeypatch.setattr(app_module, "WEB_DIST", tmp_path)
    return TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker))


def test_only_existing_versioned_assets_are_immutable(static_client):
    asset = static_client.get("/assets/index-aB34_678.js")
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    unchanged = static_client.get("/assets/index-aB34_678.js", headers={"If-None-Match": asset.headers["etag"]})
    assert unchanged.status_code == 304
    assert unchanged.headers["cache-control"] == asset.headers["cache-control"]
    for path in ("/", "/index.html", "/assets/unversioned.js", "/assets/missing-aB34_678.js"):
        assert static_client.get(path).headers["cache-control"] == "no-cache"
    assert static_client.get("/api/health").headers["cache-control"] == "no-store"


def test_oversized_requests_keep_security_and_no_store_headers(static_client):
    response = static_client.post("/api/assess", content="x" * (app_module.MAX_BODY_BYTES + 1))
    assert response.status_code == 413
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


@pytest.mark.parametrize("code,category", [(401, "authentication"), (403, "authentication"),
                                          (429, "quota"), (404, "model_unavailable"),
                                          (504, "timeout"), (500, "unavailable")])
def test_model_failures_keep_network_evidence_without_leaking_errors(code, category):
    class ProviderFailure(Exception):
        pass

    failure = ProviderFailure("private credential and provider response must not be returned")
    failure.code = code

    def broken_reader(*args):
        raise failure

    client = TestClient(app_module.create_app(reader=broken_reader, asker=fake_asker))
    response = client.post("/api/assess", json={**BODY, "network": {
        "payee_account_id": "test-payee", "flagged_account_ids": ["test-payee"], "transfers": [],
    }})
    data = response.json()
    assert data["execution"]["fallback_reason"] == category
    assert data["degraded"] is True
    assert data["audit"]["network_available"] is True
    assert data["audit"]["network_score"] == 70
    assert "account links" in data["notice"]
    assert "private credential" not in response.text


def test_model_budget_allows_rule_only_payments_but_blocks_followup_model_calls(monkeypatch):
    monkeypatch.setattr(app_module, "GEMINI_CALLS_PER_HOUR", 0)
    client = TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker))
    ordinary = {**BODY, "message": None, "payment": {
        **BODY["payment"], "is_new_payee": False, "payee_account_age_days": 500, "amount": 100,
    }}
    data = client.post("/api/assess", json=ordinary).json()
    assert data["execution"]["message_mode"] == "not_requested"
    assert not data.get("degraded")
    limited = client.post("/api/assess", json=BODY).json()
    assert limited["execution"]["fallback_reason"] == "budget"
    # An unusual payment without a note would generate questions using Gemini.
    followup = client.post("/api/assess", json={**BODY, "message": None}).json()
    assert followup["execution"]["fallback_reason"] == "budget"


def test_model_client_has_a_timeout_and_no_hidden_sdk_retries(monkeypatch):
    factory = Mock()
    monkeypatch.setattr(gemini_client.genai, "Client", factory)
    monkeypatch.setattr(gemini_client, "_client", None)
    monkeypatch.setattr(gemini_client, "USE_VERTEX", False)
    monkeypatch.setenv("GEMINI_API_KEY", "fake-test-key")
    gemini_client.get_client()
    options = factory.call_args.kwargs["http_options"]
    assert 1000 <= options.timeout <= 60000
    assert options.retry_options.attempts == 1


@pytest.mark.parametrize("structured", [False, True])
def test_default_model_call_does_not_sleep_or_retry_after_timeout(monkeypatch, structured):
    generate = Mock(side_effect=ReadTimeout("test timeout"))
    monkeypatch.setattr(gemini_client, "_client", SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    sleep = Mock()
    monkeypatch.setattr(gemini_client.time, "sleep", sleep)
    with pytest.raises(ReadTimeout):
        if structured:
            from backend.risk.clarify import FollowUp
            gemini_client.ask_structured("Synthetic test", FollowUp)
        else:
            gemini_client.ask("Synthetic test")
    assert generate.call_count == 1
    sleep.assert_not_called()
    assert gemini_client.failure_reason(ReadTimeout("test")) == "timeout"


def test_missing_key_is_reported_as_configuration(monkeypatch):
    monkeypatch.setattr(gemini_client, "_client", None)
    monkeypatch.setattr(gemini_client, "USE_VERTEX", False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(gemini_client.ConfigurationError) as raised:
        gemini_client.get_client()
    assert gemini_client.failure_reason(raised.value) == "configuration"
