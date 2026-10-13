"""Tests for the web server, using a fake message reader so nothing goes to the internet.

These need the web server packages. Where they are not installed (for example on the
laptop) the tests are skipped, and they run in Cloud Shell instead.
"""

import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend import app as app_module  # noqa: E402

BODY = {
    "payment": {
        "amount": 450, "currency": "USD", "timestamp": "2026-09-10T14:30:00", "payee_name": "Test Payee",
        "payee_type": "individual", "is_new_payee": True, "payee_account_age_days": 10, "channel": "web",
        "device_known": True, "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False,
    },
    "customer": {"segment": "family", "typical_amount": 200},
    "message": "travel fee",
}


def fake_reader(text, scam_types):
    return {
        "scam_likelihood": 10, "tactics": [], "matched_typology": "none", "suspicious_phrases": [],
        "customer_verified_independently": False, "payee_relationship": "unknown",
        "met_payee_in_person": "unknown", "contact_source": "unknown", "secrecy": "none", "urgency": False,
        "evasive": False, "rehearsed_or_coached": False, "contradicts_first_note": False,
        "explanation": "Looks ordinary.", "orders_found_in_message": [],
    }


def fake_asker(message, payment):
    return ["Who is this for?", "How do you know them?"]


def make_client(reader=fake_reader):
    return TestClient(app_module.create_app(reader=reader, asker=fake_asker))


def test_health_check_answers():
    assert make_client().get("/api/health").json() == {"ok": True}


def test_a_thin_note_on_an_unusual_payment_gets_questions():
    result = make_client().post("/api/assess", json=BODY).json()
    assert result["action"] == "ask"
    assert len(result["questions"]) == 2


def test_the_second_round_uses_the_answer():
    client = make_client()
    first = client.post("/api/assess", json=BODY).json()
    second = client.post("/api/assess", json={**BODY, "questions": first["questions"],
                                              "answer": "It is my sister, I called her."}).json()
    assert second["round"] == 2
    assert second["action"] != "ask"


def test_bad_input_is_refused():
    bad = {**BODY, "payment": {**BODY["payment"], "amount": -5}}
    assert make_client().post("/api/assess", json=bad).status_code == 422
    unknown_type = {**BODY, "customer": {"segment": "astronaut", "typical_amount": 100}}
    assert make_client().post("/api/assess", json=unknown_type).status_code == 422
    too_long = {**BODY, "message": "x" * 5000}
    assert make_client().post("/api/assess", json=too_long).status_code in (413, 422)


def test_mulenet_evidence_is_validated_and_changes_the_recommendation():
    network = {"payee_account_id": "payee", "flagged_account_ids": ["payee"], "transfers": []}
    body = {**BODY, "message": None, "network": network}
    result = make_client().post("/api/assess", json=body).json()
    assert result["action"] == "hold"
    assert result["audit"]["network_score"] == 70
    oversized = {**network, "transfers": [{"from_account_id": "a", "to_account_id": "payee",
                                               "amount": 1, "hours_ago": 1}] * 101}
    assert make_client().post("/api/assess", json={**body, "network": oversized}).status_code == 422


def test_a_visitor_who_sends_too_much_is_slowed_down():
    client = make_client()
    codes = [client.post("/api/assess", json=BODY).status_code for _ in range(app_module.PER_VISITOR_PER_MINUTE + 3)]
    assert 429 in codes


def test_if_the_reader_breaks_the_payment_details_still_get_a_decision():
    def broken(text, scam_types):
        raise RuntimeError("Gemini is down")

    result = make_client(reader=broken).post("/api/assess", json=BODY).json()
    assert result["degraded"] is True
    assert result["action"] in ("allow", "warn", "hold")
    assert "Gemini" not in result["notice"]


def test_security_headers_are_present():
    headers = make_client().get("/api/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in headers["content-security-policy"]
