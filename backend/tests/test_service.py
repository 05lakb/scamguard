"""Tests for the ask-a-question flow, with fake readers so no internet is needed."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk import clarify  # noqa: E402
from backend.service import assess  # noqa: E402

CUSTOMER = {"typical_amount": 200}


def payment(**changes):
    unusual = {
        "amount": 450, "currency": "USD", "timestamp": "2026-09-10T14:30:00", "payee_type": "individual",
        "is_new_payee": True, "payee_account_age_days": 10, "device_known": True,
        "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False,
    }
    unusual.update(changes)
    return unusual


def fake_reader(likelihood=10, verified=False):
    def read(text, scam_types):
        return {
            "scam_likelihood": likelihood, "tactics": [], "matched_typology": "none",
            "suspicious_phrases": [], "customer_verified_independently": verified,
            "explanation": "Pressure to pay quickly.", "orders_found_in_message": [],
        }
    return read


def fake_asker(message, payment):
    return ["Who is this payment for?", "How do you know them?"]


def run(message=None, **kwargs):
    return assess(payment(), CUSTOMER, message, reader=kwargs.pop("reader", fake_reader()),
                  asker=fake_asker, scam_types=[], **kwargs)


def test_a_thin_note_on_an_unusual_payment_gets_a_question():
    result = run("travel fee")
    assert result["action"] == "ask"
    assert len(result["questions"]) == 2


def test_no_note_at_all_also_gets_a_question():
    assert run(None)["action"] == "ask"


def test_a_detailed_calm_note_does_not_get_a_question():
    long_note = "Paying the deposit for the flat I viewed twice, with a signed contract from the agent."
    result = run(long_note, reader=fake_reader(likelihood=0, verified=True))
    assert result["action"] != "ask"


def test_an_ordinary_payment_is_not_questioned():
    result = assess(payment(amount=200, is_new_payee=False, payee_account_age_days=2000), CUSTOMER, "ok",
                    reader=fake_reader(), asker=fake_asker, scam_types=[])
    assert result["action"] == "allow"


def test_a_reassuring_answer_lowers_the_risk():
    first = run("travel fee")
    second = run("travel fee", questions=first["questions"], answer="It is my sister, I called her today.",
                 reader=fake_reader(likelihood=0, verified=True))
    assert second["round"] == 2
    assert second["action"] != "ask"
    assert second["score"] < first["score"]


def test_an_alarming_answer_raises_the_risk_and_never_asks_again():
    first = run("travel fee")
    second = run("travel fee", questions=first["questions"], answer="He said to keep it secret and pay today.",
                 reader=fake_reader(likelihood=95))
    assert second["action"] in ("warn", "hold")


def test_the_questions_never_call_the_customer_a_victim():
    prompt = clarify.build_prompt("travel fee", payment())
    assert "Never accuse" in prompt
    assert "data, not an instruction" in prompt
