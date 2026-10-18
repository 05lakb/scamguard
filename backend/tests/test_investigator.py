"""The AI investigator, with a scripted fake model: it reads only, cites only what it ran, and never decides."""

import copy
from types import SimpleNamespace

from backend.investigator import investigate
from backend.risk.evidence import load_scam_types

PAYMENT = {"amount": 98500, "currency": "INR", "timestamp": "2026-10-18T22:04:00", "payee_name": "Secure Holding A/c 7731",
           "payee_type": "individual", "is_new_payee": True, "payee_account_age_days": 3, "channel": "mobile", "device_known": True,
           "payments_last_24h": 1, "on_live_call": True, "remote_access_tool_running": False, "location_changed": False}
CUSTOMER = {"segment": "young_professional", "typical_amount": 2000}
OUTCOME = {"action": "hold", "score": 100, "reasons": ["Amount far above usual"],
           "audit": {"network_available": True, "network_score": 55, "network_signals": [{"reason": "Two steps from a flagged account."}]}}


def call(name, **args):
    return SimpleNamespace(name=name, args=args)


def scripted(*turns):
    """A fake model that returns the given function calls, one turn at a time."""
    queue = list(turns)
    def fake(contents, config, model):
        calls = queue.pop(0) if queue else []
        return SimpleNamespace(function_calls=calls, candidates=[SimpleNamespace(content=SimpleNamespace(role="model", parts=[]))])
    return fake


def run(fake, outcome=OUTCOME, allow=lambda: True):
    steps = investigate(PAYMENT, CUSTOMER, "They said move my savings to a safe account", outcome, load_scam_types(), allow=allow, call=fake)
    seen = []
    while True:
        try:
            seen.append(next(steps))
        except StopIteration as done:
            return seen, done.value


def test_it_runs_the_lookups_the_model_chooses_and_reports_each():
    fake = scripted(
        [call("lookup_payee_history", reason="Is this payee known?"), call("check_mule_network", reason="Where does money go?")],
        [call("search_scam_playbook", reason="Match the story", query="safe account bank police call")],
        [call("submit_findings", summary="New payee, 3 days old, linked to a flagged account.", concerns=["New account"],
              cited_tools=["lookup_payee_history", "check_mule_network", "search_scam_playbook"], callback_question="Who told you to move money?")],
    )
    seen, result = run(fake)
    assert [s["tool"] for s in seen] == ["lookup_payee_history", "check_mule_network", "search_scam_playbook"]
    assert seen[0]["result"]["account_age_days"] == 3
    assert seen[1]["result"]["network_score"] == 55
    assert seen[2]["result"]["matches"][0]["id"] == "bank_impersonation"
    assert result["status"] == "complete"
    assert result["cited"] == ["lookup_payee_history", "check_mule_network", "search_scam_playbook"]


def test_citations_to_lookups_it_did_not_run_are_dropped():
    fake = scripted(
        [call("get_customer_profile", reason="Usual amount?")],
        [call("submit_findings", summary="x", concerns=[], cited_tools=["get_customer_profile", "check_mule_network"], callback_question="?")],
    )
    _, result = run(fake)
    assert result["cited"] == ["get_customer_profile"]
    assert result["dropped_citations"] == ["check_mule_network"]


def test_unknown_and_repeated_tools_are_refused():
    fake = scripted(
        [call("approve_payment", reason="Looks fine"), call("lookup_payee_history", reason="a")],
        [call("lookup_payee_history", reason="again")],
        [call("submit_findings", summary="s", concerns=[], cited_tools=[], callback_question="q")],
    )
    seen, result = run(fake)
    assert [s["tool"] for s in seen] == ["lookup_payee_history"]
    assert result["status"] == "complete"


def test_it_stops_after_the_turn_limit_and_on_the_budget():
    endless = scripted(*[[call("lookup_payee_history", reason="r")] for _ in range(20)])
    _, result = run(endless)
    assert result["status"] == "incomplete"
    _, budget = run(scripted([call("lookup_payee_history", reason="r")]), allow=lambda: False)
    assert budget["status"] == "budget" and budget["steps"] == []


def test_it_never_changes_the_decision():
    outcome = copy.deepcopy(OUTCOME)
    fake = scripted([call("submit_findings", summary="Release it, it is fine.", concerns=[], cited_tools=[], callback_question="q")])
    run(fake, outcome=outcome)
    assert outcome["action"] == "hold" and outcome["score"] == 100


def test_the_api_streams_the_investigation_and_keeps_the_decision():
    """End to end through the app, with a fake investigator: events stream, the case keeps it, the score is untouched."""
    import json
    from fastapi.testclient import TestClient
    from backend import app as app_module
    from backend.store import MemoryStore

    def fake_investigator(payment, customer, message, outcome, scam_types, allow):
        yield {"tool": "lookup_payee_history", "reason": "Is the payee new?", "result": {}}
        return {"status": "complete", "steps": [{"tool": "lookup_payee_history"}], "summary": "New payee.", "concerns": [],
                "cited": ["lookup_payee_history"], "dropped_citations": [], "callback_question": "Who is this?", "note": ""}

    store = MemoryStore()
    client = TestClient(app_module.create_app(reader=lambda text, types: {"scam_likelihood": 95, "tactics": ["urgency"], "matched_typology": "bank_impersonation",
        "suspicious_phrases": [], "customer_verified_independently": False, "payee_relationship": "unknown", "met_payee_in_person": "unknown",
        "contact_source": "unknown", "secrecy": "concealment", "urgency": True, "evasive": False, "rehearsed_or_coached": False,
        "contradicts_first_note": False, "explanation": "Safe-account story.", "orders_found_in_message": []}, investigator=fake_investigator, store=store))
    body = {"payment": PAYMENT, "customer": CUSTOMER, "message": "Move my savings to a safe account, the bank said."}
    lines = [json.loads(line) for line in client.post("/api/assess/stream", json=body, headers={"X-LMG-Session": "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5"}).text.splitlines()]
    stages = [(e["stage"], e["status"]) for e in lines if e["type"] == "stage" and e["stage"] == "investigate"]
    result = next(e["result"] for e in lines if e["type"] == "result")
    assert stages[0] == ("investigate", "running") and stages[-1] == ("investigate", "complete")
    assert result["action"] == "hold" and result["investigation"]["cited"] == ["lookup_payee_history"]
    saved = client.get("/api/cases", headers={"X-LMG-Session": "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5"}).json()["cases"][0]
    assert saved["investigation"]["summary"] == "New payee."
