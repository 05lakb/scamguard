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


def test_the_audit_record_lists_what_was_used():
    result = decide(payment(is_new_payee=True), CUSTOMER, reading(60))
    audit = result["audit"]
    assert audit["behaviour_signals"]
    assert audit["message_reading"]["scam_likelihood"] == 60
    assert audit["thresholds"] == {"warn": 40, "hold": 70}
