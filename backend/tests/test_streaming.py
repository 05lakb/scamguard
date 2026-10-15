import json

from fastapi.testclient import TestClient

from backend import app as app_module
from backend.service import assess_steps
from backend.tests.test_app import BODY, fake_reader, fake_asker


def test_stage_events_precede_model_work():
    calls = []
    def reader(*args):
        calls.append("called")
        return fake_reader(*args)
    steps = assess_steps(BODY["payment"], BODY["customer"], BODY["message"], reader=reader, asker=fake_asker)
    events = []
    for event in steps:
        events.append(event)
        if event["stage"] == "message" and event["status"] == "running":
            break
    assert not calls
    assert any(e["stage"] == "behaviour" and e["status"] == "complete" for e in events)
    assert next(steps)["status"] == "complete"
    assert calls == ["called"]
    steps.close()


def test_stream_matches_json_and_preserves_request_identity():
    client = TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker))
    response = client.post("/api/assess/stream", json=BODY)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-accel-buffering"] == "no"
    events = [json.loads(line) for line in response.text.splitlines()]
    result = events[-1]["result"]
    ordinary = client.post("/api/assess", json=BODY).json()
    assert {k: v for k, v in result.items() if k != "execution"} == {k: v for k, v in ordinary.items() if k != "execution"}
    assert all(e["request_id"] == result["execution"]["request_id"] for e in events)
    times = [e["elapsed_ms"] for e in events if e["type"] == "stage"]
    assert times == sorted(times)
    assert any(e.get("stage") == "clarify" and e["status"] == "complete" for e in events)
    second = client.post("/api/assess/stream", json={**BODY, "questions": result["questions"], "answer": "It is my sister."})
    assert json.loads(second.text.splitlines()[-1])["result"]["round"] == 2


def test_stream_reports_failure_without_leaking_provider_error():
    def broken(*args):
        raise RuntimeError("SECRET provider details")
    client = TestClient(app_module.create_app(reader=broken, asker=fake_asker))
    response = client.post("/api/assess/stream", json={**BODY, "network": {"payee_account_id": "p", "flagged_account_ids": ["p"], "transfers": []}})
    assert "SECRET" not in response.text
    events = [json.loads(line) for line in response.text.splitlines()]
    assert any(e.get("stage") == "message" and e["status"] == "failed" for e in events)
    assert events[-1]["result"]["degraded"]
    assert events[-1]["result"]["audit"]["network_score"] == 70


def test_stream_shares_validation_and_rate_limit(monkeypatch):
    monkeypatch.setattr(app_module, "PER_VISITOR_PER_MINUTE", 1)
    client = TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker))
    assert client.post("/api/assess/stream", json={**BODY, "message": "x" * 2001}).status_code == 422
    assert client.post("/api/assess", json=BODY).status_code == 200
    assert client.post("/api/assess/stream", json=BODY).status_code == 429
