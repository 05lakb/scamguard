"""Checks the behaviour score on a few hand-made payments."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk.behaviour import check_behaviour  # noqa: E402

CUSTOMER = {"typical_amount": 100}


def payment(**changes):
    normal = {
        "amount": 100, "timestamp": "2026-09-10T14:30:00", "payee_type": "business",
        "is_new_payee": False, "payee_account_age_days": 1000, "device_known": True,
        "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False,
    }
    normal.update(changes)
    return normal


def test_an_ordinary_payment_is_allowed():
    result = check_behaviour(payment(), CUSTOMER)
    assert result["score"] == 0
    assert result["suggestion"] == "allow"


def test_remote_control_tool_plus_big_amount_is_held():
    result = check_behaviour(
        payment(amount=2000, remote_access_tool_running=True, on_live_call=True, is_new_payee=True, payee_account_age_days=3),
        CUSTOMER,
    )
    assert result["suggestion"] == "hold"


def test_every_point_comes_with_a_reason():
    result = check_behaviour(payment(amount=1500, is_new_payee=True, payee_account_age_days=2), CUSTOMER)
    assert result["signals"]
    assert all(item["reason"] for item in result["signals"])


def test_the_score_never_goes_above_100():
    result = check_behaviour(
        payment(amount=100000, is_new_payee=True, payee_account_age_days=0, on_live_call=True,
                remote_access_tool_running=True, device_known=False, payments_last_24h=5,
                payee_type="crypto_exchange", timestamp="2026-09-10T03:00:00"),
        CUSTOMER,
    )
    assert result["score"] == 100


def test_night_payment_adds_a_warning_point():
    day = check_behaviour(payment(), CUSTOMER)["score"]
    night = check_behaviour(payment(timestamp="2026-09-10T03:15:00"), CUSTOMER)["score"]
    assert night > day
