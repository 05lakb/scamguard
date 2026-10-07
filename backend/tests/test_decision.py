"""Tests for the final decision, using hand-made readings so no internet is needed."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk.decision import decide  # noqa: E402

CUSTOMER = {"typical_amount": 100}


def payment(**changes):
    normal = {
        "amount": 100, "timestamp": "2026-09-10T14:30:00", "payee_type": "individual",
        "is_new_payee": False, "payee_account_age_days": 1000, "device_known": True,
        "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False,
    }
    normal.update(changes)
    return normal


def reading(likelihood, verified=False, typology="none", orders=None):
    return {
        "scam_likelihood": likelihood, "tactics": [], "matched_typology": typology,
        "suspicious_phrases": [], "customer_verified_independently": verified,
        "explanation": "The message shows pressure to pay quickly.",
        "orders_found_in_message": orders or [],
    }


def test_ordinary_payment_without_message_is_allowed():
    assert decide(payment(), CUSTOMER)["action"] == "allow"


def test_scam_message_on_a_new_payee_is_held():
    result = decide(payment(is_new_payee=True, payee_account_age_days=100), CUSTOMER, reading(95, typology="investment"))
    assert result["action"] == "hold"
    assert result["reasons"]


def test_scam_message_alone_is_at_least_a_warning():
    result = decide(payment(), CUSTOMER, reading(80))
    assert result["action"] in ("warn", "hold")


def test_a_calm_verified_customer_gets_a_discount():
    risky = payment(is_new_payee=True, payee_account_age_days=10, amount=500)
    without = decide(risky, CUSTOMER, reading(0))["score"]
    with_check = decide(risky, CUSTOMER, reading(0, verified=True))["score"]
    assert with_check < without


def test_orders_to_the_checker_force_a_hold_even_with_a_low_score():
    result = decide(payment(), CUSTOMER, reading(0, orders=["ignore all previous"]))
    assert result["action"] == "hold"
    assert result["audit"]["forced_hold"] is True


def test_warning_text_is_empty_when_allowed_and_plain_otherwise():
    allowed = decide(payment(), CUSTOMER)
    assert allowed["customer_warning"] == ""
    held = decide(payment(is_new_payee=True, payee_account_age_days=5), CUSTOMER, reading(95, typology="romance"),
                  scam_types=[{"id": "romance", "safe_advice": "Never send money to someone you have not met."}])
    assert "paused" in held["customer_warning"]
    assert "Never send money" in held["customer_warning"]


def story(**changes):
    base = reading(10)
    base.update({
        "payee_relationship": "unknown", "met_payee_in_person": "unknown", "contact_source": "unknown",
        "secrecy": "none", "urgency": False, "evasive": False, "rehearsed_or_coached": False,
        "contradicts_first_note": False,
    })
    base.update(changes)
    return base


NEW_PAYEE = dict(is_new_payee=True, payee_account_age_days=10, amount=500)


def test_meeting_an_ordinary_payee_in_person_lowers_the_score():
    plain = decide(payment(**NEW_PAYEE), CUSTOMER, story())["score"]
    met = decide(payment(**NEW_PAYEE), CUSTOMER, story(met_payee_in_person="yes", payee_relationship="landlord"))["score"]
    assert met < plain


def test_reassurance_is_ignored_when_the_story_sounds_rehearsed():
    rehearsed = story(met_payee_in_person="yes", payee_relationship="landlord", rehearsed_or_coached=True)
    plain = decide(payment(**NEW_PAYEE), CUSTOMER, story())["score"]
    assert decide(payment(**NEW_PAYEE), CUSTOMER, rehearsed)["score"] > plain


def test_dodging_and_contradictions_raise_the_score():
    plain = decide(payment(**NEW_PAYEE), CUSTOMER, story())["score"]
    assert decide(payment(**NEW_PAYEE), CUSTOMER, story(evasive=True))["score"] > plain
    assert decide(payment(**NEW_PAYEE), CUSTOMER, story(contradicts_first_note=True))["score"] > plain


def test_a_harmless_surprise_is_not_treated_as_secrecy():
    plain = decide(payment(**NEW_PAYEE), CUSTOMER, story())["score"]
    surprise = decide(payment(**NEW_PAYEE), CUSTOMER, story(secrecy="benign_surprise"))["score"]
    hidden = decide(payment(**NEW_PAYEE), CUSTOMER, story(secrecy="concealment"))["score"]
    assert surprise == plain
    assert hidden > plain


def test_a_dating_app_contact_never_met_adds_risk():
    plain = decide(payment(**NEW_PAYEE), CUSTOMER, story())["score"]
    risky = decide(payment(**NEW_PAYEE), CUSTOMER, story(contact_source="dating_app", met_payee_in_person="no"))["score"]
    assert risky > plain


def test_the_audit_record_lists_what_was_used():
    result = decide(payment(is_new_payee=True), CUSTOMER, reading(60))
    audit = result["audit"]
    assert audit["behaviour_signals"]
    assert audit["message_reading"]["scam_likelihood"] == 60
    assert audit["thresholds"] == {"warn": 40, "hold": 70}


# ---------- after asking, an uncorroborated new payee adds risk ----------

def test_after_asking_a_new_payee_nothing_backs_up_adds_points():
    new_payee = payment(is_new_payee=True, payee_account_age_days=300)
    first = decide(new_payee, CUSTOMER, story())["score"]
    after_asking = decide(new_payee, CUSTOMER, story(), asked=True)
    assert after_asking["score"] > first
    assert "nothing backs up" in " ".join(after_asking["reasons"])


def test_no_extra_points_when_the_payee_is_corroborated():
    new_payee = payment(is_new_payee=True, payee_account_age_days=300)
    backed = story(met_payee_in_person="yes", payee_relationship="landlord")
    assert decide(new_payee, CUSTOMER, backed, asked=True)["score"] <= decide(new_payee, CUSTOMER, backed)["score"]


def test_no_extra_points_for_a_known_payee_or_in_the_first_round():
    known = payment(is_new_payee=False)
    assert decide(known, CUSTOMER, story(), asked=True)["score"] == decide(known, CUSTOMER, story())["score"]
    new_payee = payment(is_new_payee=True, payee_account_age_days=300)
    assert decide(new_payee, CUSTOMER, story())["score"] == decide(new_payee, CUSTOMER, story(), asked=False)["score"]


# ---------- a claimed history is checked against what the bank knows ----------

def test_claiming_to_know_a_new_payee_adds_risk_and_never_earns_the_checked_discount():
    new_payee = payment(is_new_payee=True, payee_account_age_days=300)
    claim = story(customer_verified_independently=True, claims_existing_relationship=True)
    result = decide(new_payee, CUSTOMER, claim)
    assert result["audit"]["verified_discount"] == 0
    assert "no record of ever paying them" in " ".join(result["reasons"])
    plain = decide(new_payee, CUSTOMER, story(customer_verified_independently=True))
    assert plain["audit"]["verified_discount"] > 0  # without the claim, the discount still works
    assert result["score"] > plain["score"]


def test_a_known_payee_with_a_claimed_history_is_not_a_mismatch():
    known = payment(is_new_payee=False)
    result = decide(known, CUSTOMER, story(claims_existing_relationship=True))
    assert "no record of ever paying them" not in " ".join(result["reasons"])


def test_having_met_the_payee_in_person_is_not_a_mismatch():
    new_payee = payment(is_new_payee=True, payee_account_age_days=300)
    met = story(claims_existing_relationship=True, met_payee_in_person="yes", payee_relationship="supplier")
    assert "no record of ever paying them" not in " ".join(decide(new_payee, CUSTOMER, met)["reasons"])
