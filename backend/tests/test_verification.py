"""Tests for verification after a hold: the AI call the customer asks for, and the typed fallback.

Twilio and Gemini are faked; nothing goes to the internet and no call is placed.
"""

import sys
from pathlib import Path
from urllib.parse import urlencode

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend import app as app_module  # noqa: E402
from backend import verification as verify  # noqa: E402
from backend.store import MemoryStore  # noqa: E402
from backend.tests.test_app import fake_asker  # noqa: E402

BROWSER = "c" * 40
OTHER = "d" * 40
PUBLIC = "https://guard.example.run.app"
TOKEN = "test-auth-token"


def reader(text, scam_types):
    """A stand-in for Gemini: the first note reads as a scam; an answer about a brother met in person reads as genuine."""
    genuine = "brother" in text.lower()
    return {
        "scam_likelihood": 5 if genuine else 90, "tactics": [] if genuine else ["authority", "secrecy"],
        "matched_typology": "none" if genuine else "bank_impersonation", "suspicious_phrases": [],
        "customer_verified_independently": genuine, "payee_relationship": "family" if genuine else "unknown",
        "met_payee_in_person": "yes" if genuine else "unknown", "contact_source": "in_person" if genuine else "phone_call",
        "secrecy": "none" if genuine else "concealment", "urgency": not genuine, "evasive": False,
        "rehearsed_or_coached": False, "contradicts_first_note": False, "claims_prior_dealings": False,
        "explanation": "Ordinary family payment." if genuine else "A caller posing as the bank told them to move money.",
        "orders_found_in_message": [],
    }


def payment(remote=False):
    return {
        "payment": {"amount": 10000, "currency": "INR", "timestamp": "2026-10-17T14:30:00", "payee_name": "Rahul",
                    "payee_type": "individual", "is_new_payee": True, "payee_account_age_days": 400, "channel": "mobile",
                    "device_known": True, "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": remote},
        "customer": {"segment": "family", "typical_amount": 2000},
        "message": "The bank said my account is unsafe, move it to a safe account and tell no one.",
    }


class FakeCalls:
    def __init__(self, fail=False):
        self.placed, self.fail = [], fail

    def __call__(self, config, to, answer_url, status_url):
        if self.fail:
            raise RuntimeError("twilio down")
        self.placed.append({"to": to, "answer_url": answer_url, "status_url": status_url})
        return "CA123"


def make(configured=True, calls=None, ai=False, monkeypatch=None):
    if monkeypatch is not None:
        monkeypatch.setattr(app_module.gemini_client, "is_configured", lambda: ai)
    store = MemoryStore()
    twilio = verify.TwilioConfig({"TWILIO_ACCOUNT_SID": "AC1", "TWILIO_AUTH_TOKEN": TOKEN,
                                  "TWILIO_FROM_NUMBER": "+15550001111", "LMG_PUBLIC_URL": PUBLIC} if configured else {})
    app = app_module.create_app(reader=reader, asker=fake_asker, store=store, twilio=twilio,
                                call_placer=calls or FakeCalls(), callback_writer=lambda prompt: (_ for _ in ()).throw(RuntimeError()))
    return TestClient(app, headers={"X-LMG-Session": BROWSER}), store


def held_case(client, remote=False):
    result = client.post("/api/assess", json=payment(remote)).json()
    assert result["action"] == "hold", result
    return result["execution"]["request_id"]


def twilio_post(client, url, params):
    """Post as Twilio would: form fields, signed with the account's token."""
    signature = verify.twilio_signature(PUBLIC + url, params, TOKEN)
    return client.post(url, content=urlencode(params), headers={"X-Twilio-Signature": signature,
                                                                  "Content-Type": "application/x-www-form-urlencoded"})


# ---------- the typed fallback ----------

def test_typed_answers_can_clear_a_hold_with_the_reasons_shown(monkeypatch):
    client, store = make(ai=True, monkeypatch=monkeypatch)
    case_id = held_case(client)
    started = client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"}).json()
    state = started["verification"]
    assert state["status"] == "awaiting_answers" and len(state["questions"]) == 2
    assert state["questions"][1] == verify.SAFETY_QUESTIONS[0]
    assert "token" not in state and "owner" not in started

    done = client.post(f"/api/cases/{case_id}/verification/answers",
                       json={"answers": ["It is my brother Rahul, I met him last week.", "No, nobody is with me."]}).json()
    outcome = done["verification"]["outcome"]
    assert done["verification"]["status"] == "done"
    assert outcome["before_action"] == "hold" and outcome["action"] == "allow"
    assert outcome["score"] < outcome["before_score"] and outcome["kept_hold"] is None
    assert outcome["reading"]["scam_likelihood"] == 5
    assert outcome["voice"]["risk_level"] in ("low", "medium", "high")
    assert done["action"] == "allow" and store.cases[case_id]["action"] == "allow"


def test_some_holds_cannot_be_talked_away(monkeypatch):
    client, _ = make(ai=True, monkeypatch=monkeypatch)
    case_id = held_case(client, remote=True)
    client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"})
    done = client.post(f"/api/cases/{case_id}/verification/answers",
                       json={"answers": ["My brother Rahul, met him in person.", "No one."]}).json()
    outcome = done["verification"]["outcome"]
    assert outcome["action"] == "hold" and "remote-control app" in outcome["kept_hold"]
    assert done["action"] == "hold"


def test_without_gemini_the_hold_stands_and_says_why(monkeypatch):
    client, _ = make(ai=False, monkeypatch=monkeypatch)
    case_id = held_case(client)
    client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"})
    outcome = client.post(f"/api/cases/{case_id}/verification/answers", json={"answers": ["my brother", "no"]}).json()["verification"]["outcome"]
    assert outcome["degraded"] is True and outcome["action"] == "hold"
    assert outcome["score"] >= outcome["before_score"]
    assert outcome["reasons"][0].startswith("The answers could not be read")


def test_verification_is_private_and_guarded(monkeypatch):
    client, _ = make(monkeypatch=monkeypatch)
    case_id = held_case(client)
    other = {"X-LMG-Session": OTHER}
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"}, headers=other).status_code == 404
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"}, headers={"X-LMG-Session": ""}).status_code == 401
    assert client.get(f"/api/cases/{case_id}", headers=other).status_code == 404
    assert client.post(f"/api/cases/{case_id}/verification/answers", json={"answers": ["x"]}).status_code == 409
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"}).status_code == 200
    assert client.post(f"/api/cases/{case_id}/verification/answers", json={"answers": ["a", "b", "c"]}).status_code == 422
    assert client.post(f"/api/cases/{case_id}/verification/answers", json={"answers": ["x" * 501]}).status_code == 422


def test_an_allowed_payment_needs_no_verification(monkeypatch):
    client, _ = make(monkeypatch=monkeypatch)
    body = payment()
    body["payment"].update(is_new_payee=False, amount=1500)
    body["message"] = "Paying my brother Rahul for groceries, met him yesterday."
    result = client.post("/api/assess", json=body).json()
    assert result["action"] == "allow"
    assert client.post(f"/api/cases/{result['execution']['request_id']}/verification", json={"mode": "typed"}).status_code == 409


# ---------- the phone call ----------

def test_phone_call_asks_two_questions_and_rechecks(monkeypatch):
    calls = FakeCalls()
    client, store = make(calls=calls, ai=True, monkeypatch=monkeypatch)
    case_id = held_case(client)
    started = client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": "+91 98123 45678"})
    assert started.status_code == 200
    state = started.json()["verification"]
    assert state["status"] == "calling" and state["phone"] == "•••• 5678" and "token" not in state
    assert calls.placed[0]["to"] == "+919812345678"
    assert "+91" not in str(store.cases[case_id]["verification"])  # only the last four digits are kept
    voice_url = calls.placed[0]["answer_url"].replace(PUBLIC, "")
    query = voice_url.split("?", 1)[1].rsplit("&step", 1)[0]

    assert twilio_post(client, f"/api/twilio/status?{query}", {"CallStatus": "ringing"}).status_code == 204
    assert store.cases[case_id]["verification"]["status"] == "ringing"

    greeting = twilio_post(client, voice_url, {"CallSid": "CA123"})
    assert greeting.status_code == 200 and "<Gather" in greeting.text and "fraud desk" in greeting.text
    assert "PIN, password or a one-time code" in greeting.text
    assert store.cases[case_id]["verification"]["status"] == "in_call"

    second = twilio_post(client, f"/api/twilio/answer?{query}&step=0", {"SpeechResult": "It is my brother Rahul, I met him."})
    assert verify.SAFETY_QUESTIONS[0].split(",")[0] in second.text
    goodbye = twilio_post(client, f"/api/twilio/answer?{query}&step=1", {"SpeechResult": "No, nobody is with me."})
    assert "<Hangup/>" in goodbye.text
    final = client.get(f"/api/cases/{case_id}").json()
    assert final["verification"]["status"] == "done"
    assert final["verification"]["answers"] == ["It is my brother Rahul, I met him.", "No, nobody is with me."]
    assert final["verification"]["outcome"]["action"] == "allow"


def test_twilio_requests_must_be_signed_and_match_the_call(monkeypatch):
    calls = FakeCalls()
    client, store = make(calls=calls, monkeypatch=monkeypatch)
    case_id = held_case(client)
    client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": "+919812345678"})
    voice_url = calls.placed[0]["answer_url"].replace(PUBLIC, "")
    assert client.post(voice_url, content="CallSid=CA1", headers={"X-Twilio-Signature": "forged"}).status_code == 403
    assert twilio_post(client, voice_url.replace("&t=", "&t=x"), {"CallSid": "CA1"}).status_code == 403
    assert twilio_post(client, voice_url.replace(case_id, "abcdef123456"), {"CallSid": "CA1"}).status_code == 403
    assert store.cases[case_id]["verification"]["status"] == "calling"


def test_a_missed_call_is_reported(monkeypatch):
    calls = FakeCalls()
    client, store = make(calls=calls, monkeypatch=monkeypatch)
    case_id = held_case(client)
    client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": "+919812345678"})
    query = calls.placed[0]["status_url"].split("?", 1)[1]
    twilio_post(client, f"/api/twilio/status?{query}", {"CallStatus": "no-answer"})
    assert client.get(f"/api/cases/{case_id}").json()["verification"]["status"] == "no_answer"
    # The customer can then type the answers instead.
    done = client.post(f"/api/cases/{case_id}/verification/answers", json={"answers": ["my brother", "no"]}).json()
    assert done["verification"]["mode"] == "typed" and done["verification"]["status"] == "done"


def test_phone_calls_need_setup_a_valid_number_and_a_working_line(monkeypatch):
    client, _ = make(configured=False, monkeypatch=monkeypatch)
    case_id = held_case(client)
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": "+919812345678"}).status_code == 503
    client, _ = make(monkeypatch=monkeypatch)
    case_id = held_case(client)
    for bad in ("9812345678", "+0123", "+91 98abc45678", ""):
        assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": bad}).status_code == 422
    client, _ = make(calls=FakeCalls(fail=True), monkeypatch=monkeypatch)
    case_id = held_case(client)
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": "+919812345678"}).status_code == 502


def test_only_one_verification_at_a_time(monkeypatch):
    client, _ = make(monkeypatch=monkeypatch)
    case_id = held_case(client)
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "phone", "phone": "+919812345678"}).status_code == 200
    assert client.post(f"/api/cases/{case_id}/verification", json={"mode": "typed"}).status_code == 409


# ---------- the helpers ----------

def test_signature_and_twiml_helpers():
    params = {"CallSid": "CA1", "SpeechResult": "hello"}
    signature = verify.twilio_signature("https://a.example/x?y=1", params, "tok")
    assert verify.valid_signature("https://a.example/x?y=1", params, "tok", signature)
    assert not verify.valid_signature("https://a.example/x?y=2", params, "tok", signature)
    assert not verify.valid_signature("https://a.example/x?y=1", params, "tok", "")
    xml = verify.twiml_question("Who is <Rahul> & why?", "https://a.example/answer?case=1&t=2")
    assert "&lt;Rahul&gt; &amp; why?" in xml and "case=1&amp;t=2" in xml
    assert verify.answer_text(["Q1", "Q2"], ["", " "]) == ""
    assert verify.answer_text(["Q1", "Q2"], ["yes"]) == "Question: Q1 Answer: yes Question: Q2 Answer: (no answer)"
    assert verify.choose_questions(verify.SAFETY_QUESTIONS) == [verify.GENERAL_QUESTIONS[0], verify.SAFETY_QUESTIONS[0]]
    assert verify.hard_hold_reason({"forced_hold": True}).startswith("The note tried")
    assert verify.hard_hold_reason({"network_signals": [{"name": "flagged_payee"}]}).startswith("The receiving account")
    assert verify.hard_hold_reason({}) is None
    assert not verify.TwilioConfig({"TWILIO_ACCOUNT_SID": "a", "TWILIO_AUTH_TOKEN": "b", "TWILIO_FROM_NUMBER": "c",
                                    "LMG_PUBLIC_URL": "http://insecure"}).configured
