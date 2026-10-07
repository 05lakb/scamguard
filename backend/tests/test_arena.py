"""Tests for the live red-team run. They use fake helpers, so nothing goes to the internet."""

import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend import app as app_module  # noqa: E402
from backend import arena  # noqa: E402


def fake_reader(text, scam_types):
    return {
        "scam_likelihood": 10, "tactics": [], "matched_typology": "none", "suspicious_phrases": [],
        "customer_verified_independently": False, "payee_relationship": "unknown", "met_payee_in_person": "unknown",
        "contact_source": "unknown", "secrecy": "none", "urgency": False, "evasive": False,
        "rehearsed_or_coached": False, "contradicts_first_note": False, "explanation": "Looks ordinary.",
        "orders_found_in_message": [],
    }


def fake_asker(message, payment):
    return ["Who is this for?", "How do you know them?"]


def fake_writer(prompt):
    return "a short made-up note"


def client():
    return TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker, arena_writer=fake_writer))


def events_of(response):
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


# ---------- choosing scenarios ----------

def test_a_short_run_is_a_balanced_mix_with_scams_and_genuine_customers():
    chosen = arena.pick_scenarios(8, seed=5)
    assert len(chosen) == 8
    labels = {item["label"] for item in chosen}
    assert labels == {"scam", "legit"}
    assert sum(1 for item in chosen if item["category"] == "coached_victim") <= 1


def test_the_same_seed_picks_the_same_scenarios_and_other_seeds_differ():
    assert [s["id"] for s in arena.pick_scenarios(6, 3)] == [s["id"] for s in arena.pick_scenarios(6, 3)]
    assert [s["id"] for s in arena.pick_scenarios(6, 3)] != [s["id"] for s in arena.pick_scenarios(6, 4)]


# ---------- the stream ----------

def test_the_stream_sends_start_working_results_and_a_summary_in_order():
    response = client().post("/api/arena", json={"count": 4})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = events_of(response)
    kinds = [event["type"] for event in events]
    assert kinds[0] == "start" and kinds[-1] == "done"
    assert kinds.count("scenario") == 4 and kinds.count("working") == 4
    assert events[0]["total"] == 4


def test_results_show_the_decision_but_never_the_persona_or_prompts():
    events = events_of(client().post("/api/arena", json={"count": 3}))
    record = next(event["record"] for event in events if event["type"] == "scenario")
    for key in ("category", "label", "final_action", "reasons", "amount", "payee"):
        assert key in record
    text = json.dumps(events)
    for hidden in ("persona", "facts", "voice", "prompt", "You are role-playing"):
        assert hidden not in text


def test_the_summary_counts_add_up():
    events = events_of(client().post("/api/arena", json={"count": 5}))
    summary = events[-1]["summary"]
    assert summary["overall_correct"][1] == 5 - summary["errors"] - summary["unreliable"]


def test_a_scenario_that_breaks_does_not_end_the_run(monkeypatch):
    calls = {"n": 0}
    real_play = arena.customer_agent.play

    def flaky(site, writer, scenario, rng=None):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return real_play(site, writer, scenario, rng)

    monkeypatch.setattr(arena.customer_agent, "play", flaky)
    events = events_of(client().post("/api/arena", json={"count": 3}))
    scenarios = [event["record"] for event in events if event["type"] == "scenario"]
    assert len(scenarios) == 3
    assert any(record.get("error") for record in scenarios)
    assert "boom" not in json.dumps(events)  # internal details never reach the visitor


# ---------- the limits ----------

def test_a_visitor_cannot_start_runs_back_to_back():
    c = client()
    assert c.post("/api/arena", json={"count": 3}).status_code == 200
    second = c.post("/api/arena", json={"count": 3})
    assert second.status_code == 429
    assert "wait" in second.json()["detail"].lower()


def test_the_run_can_be_switched_off(monkeypatch):
    monkeypatch.setattr(app_module, "ARENA_ENABLED", False)
    assert client().post("/api/arena", json={"count": 3}).status_code == 403


def test_the_size_of_a_run_is_limited():
    c = client()
    assert c.post("/api/arena", json={"count": 100}).status_code == 422
    assert c.post("/api/arena", json={"count": 1}).status_code == 422


def test_when_every_slot_is_busy_a_new_run_is_turned_away(monkeypatch):
    monkeypatch.setattr(app_module, "ARENA_AT_ONCE", 0)  # no free slots at all
    response = client().post("/api/arena", json={"count": 3})
    assert response.status_code == 429
    assert "already going" in response.json()["detail"]


def test_a_finished_run_gives_its_slot_back(monkeypatch):
    monkeypatch.setattr(app_module, "ARENA_AT_ONCE", 1)
    monkeypatch.setattr(app_module, "ARENA_PER_VISITOR_PER_HOUR", 50)
    c = TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker, arena_writer=fake_writer))
    assert c.post("/api/arena", json={"count": 3}).status_code == 200  # the stream is read to the end
    # The visitor limit would stop an instant repeat, so check the slot through a second fresh app instead.
    c2 = TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker, arena_writer=fake_writer))
    assert c2.post("/api/arena", json={"count": 3}).status_code == 200
