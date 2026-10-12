"""Tests for a visitor's own scenario. They use fake helpers, so nothing goes to the internet."""

import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend import app as app_module  # noqa: E402
from backend import arena  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_arena import events_of, fake_asker, fake_reader, fake_writer  # noqa: E402

STORY = "A caller says my account is under attack and tells me to move money to a safe account today."


def body(**changes):
    values = {
        "story": STORY, "role": "victim", "coached": False,
        "customer": {"segment": "retiree", "typical_amount": 100},
        "amount": 900, "payee_name": "Alex Morgan", "payee_type": "individual", "is_new_payee": True,
        "payee_account_age_days": 5, "device_known": True, "payments_last_24h": 0,
        "on_live_call": True, "remote_access_tool_running": False,
    }
    values.update(changes)
    return values


def client(**kwargs):
    return TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker, arena_writer=fake_writer, **kwargs))


# ---------- building the scenario ----------

def test_a_tricked_customer_becomes_a_scam_case_and_a_genuine_one_a_legit_case():
    customer = {"segment": "retiree", "typical_amount": 100}
    tricked = arena.custom_scenario(STORY, "victim", False, customer, {"amount": 900})
    genuine = arena.custom_scenario(STORY, "genuine", True, customer, {"amount": 900})
    assert tricked["label"] == "scam" and tricked["expected_actions"] == ["warn", "hold"]
    assert genuine["label"] == "legit" and genuine["expected_actions"] == ["allow", "warn"]
    assert tricked["persona"]["facts"] == STORY and tricked["persona"]["role"] == "victim"
    assert genuine["persona"]["coached"] is False  # a genuine customer is never coached


def test_the_payment_gets_a_daytime_timestamp_so_the_hour_never_changes_the_result():
    scenario = arena.custom_scenario(STORY, "victim", False, {"segment": "retiree", "typical_amount": 100}, {"amount": 5})
    assert scenario["payment"]["timestamp"].endswith("T14:30:00")
    assert scenario["payment"]["currency"] == "USD"


# ---------- the endpoint ----------

def test_a_valid_scenario_streams_start_working_result_and_summary():
    response = client().post("/api/custom", json=body())
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = events_of(response)
    assert [event["type"] for event in events] == ["start", "working", "scenario", "done"]
    record = events[2]["record"]
    assert record["category"] == "custom" and record["final_action"] in ("allow", "warn", "hold")
    assert record["amount"] == 900 and record["payee"] == "Alex Morgan"


def test_the_visitors_story_is_never_sent_back_in_the_result():
    events = events_of(client().post("/api/custom", json=body()))
    record = events[2]["record"]
    assert "persona" not in record and "facts" not in record
    assert STORY not in json.dumps(events)  # only the note the simulated customer wrote comes back


def test_bad_input_is_refused_before_anything_runs():
    app_client = client()
    assert app_client.post("/api/custom", json=body(story="too short")).status_code == 422
    assert app_client.post("/api/custom", json=body(amount=0)).status_code == 422
    assert app_client.post("/api/custom", json=body(amount=5_000_000)).status_code == 422
    assert app_client.post("/api/custom", json=body(role="somebody")).status_code == 422
    assert app_client.post("/api/custom", json=body(payee_name="")).status_code == 422
    assert app_client.post("/api/custom", json=body(story="x" * 401)).status_code == 422


def test_emails_and_card_numbers_are_refused_with_a_friendly_message():
    app_client = client()
    for text in (STORY + " Write to me at someone@example.com", STORY + " card 4111 1111 1111 1111"):
        response = app_client.post("/api/custom", json=body(story=text))
        assert response.status_code == 422
        assert "made up" in response.json()["detail"]
    response = app_client.post("/api/custom", json=body(payee_name="a.b@example.com"))
    assert response.status_code == 422


def test_a_second_scenario_within_a_minute_is_turned_away():
    app_client = client()
    assert app_client.post("/api/custom", json=body()).status_code == 200
    second = app_client.post("/api/custom", json=body())
    assert second.status_code == 429 and "minute" in second.json()["detail"]


def test_switching_the_live_run_off_also_switches_off_own_scenarios(monkeypatch):
    monkeypatch.setattr(app_module, "ARENA_ENABLED", False)
    assert client().post("/api/custom", json=body()).status_code == 403


def test_a_large_request_is_refused():
    response = client().post("/api/custom", content=json.dumps(body(story="x" * 30_000)),
                             headers={"content-type": "application/json"})
    assert response.status_code == 413
