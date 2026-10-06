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


def test_an_ambiguous_thin_note_gets_a_question_even_if_the_score_is_high():
    # A secret-sounding note plus a few warning signs would be a hold, but we ask first.
    risky = payment(on_live_call=True)
    result = assess(risky, CUSTOMER, "gift keep it secret", reader=fake_reader(likelihood=75),
                    asker=fake_asker, scam_types=[])
    assert result["action"] == "ask"


def test_a_clearly_alarming_message_is_not_questioned():
    result = assess(payment(), CUSTOMER, "he said dont miss the chance", reader=fake_reader(likelihood=95),
                    asker=fake_asker, scam_types=[])
    assert result["action"] in ("warn", "hold")


def test_a_very_alarming_payment_is_not_questioned():
    wild = payment(amount=9000, on_live_call=True, remote_access_tool_running=True)
    result = assess(wild, CUSTOMER, "ok", reader=fake_reader(likelihood=20), asker=fake_asker, scam_types=[])
    assert result["action"] == "hold"


def test_declining_to_answer_counts_as_an_answer_and_never_loops():
    first = run("travel fee")
    second = run("travel fee", questions=first["questions"], answer="   ", reader=fake_reader(likelihood=50))
    assert second["round"] == 2
    assert second["action"] != "ask"


# ---------- asking when a new payee is still unexplained ----------

def calm_new_payee():
    return payment(amount=200, payee_account_age_days=300, device_known=True)


def explained_reader(text, scam_types):
    reading = fake_reader(5)(text, scam_types)
    reading.update(payee_relationship="landlord", met_payee_in_person="yes", contact_source="in_person")
    return reading


def test_an_unexplained_new_payee_gets_a_question_even_when_the_payment_looks_calm():
    long_bland_note = "Please process this payment as soon as you can, thank you very much for your help today."
    result = assess(calm_new_payee(), CUSTOMER, long_bland_note, reader=fake_reader(5), asker=fake_asker, scam_types=[])
    assert result["action"] == "ask"


def test_a_new_payee_the_customer_has_explained_is_not_questioned():
    note = "Rent deposit for the flat I viewed on Saturday. I met the landlord and signed the lease."
    result = assess(calm_new_payee(), CUSTOMER, note, reader=explained_reader, asker=fake_asker, scam_types=[])
    assert result["action"] != "ask"


def test_a_known_payee_is_never_questioned_just_for_being_unexplained():
    known = payment(amount=190, is_new_payee=False, payee_account_age_days=3000)
    result = assess(known, CUSTOMER, "ok", reader=fake_reader(5), asker=fake_asker, scam_types=[])
    assert result["action"] == "allow"
