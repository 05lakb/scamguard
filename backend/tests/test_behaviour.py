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


def test_business_owners_get_more_room_on_big_payments():
    big = payment(amount=700)
    ordinary = check_behaviour(big, {"typical_amount": 100, "segment": "family"})["score"]
    business = check_behaviour(big, {"typical_amount": 100, "segment": "small_business_owner"})["score"]
    assert business < ordinary


# ---------- the last 15 days ----------

def names(result):
    return {item["name"] for item in result["signals"]}


def test_missing_history_changes_nothing():
    plain = check_behaviour(payment(), CUSTOMER)["score"]
    with_none = check_behaviour(payment(spend_last_15d=None, payee_count_15d=None, payee_total_15d=None), CUSTOMER)["score"]
    assert plain == with_none


def test_heavy_spending_over_15_days_adds_points():
    calm = check_behaviour(payment(spend_last_15d=100), CUSTOMER)
    heavy = check_behaviour(payment(spend_last_15d=4000), CUSTOMER)
    assert "heavy_spend_15d" not in names(calm)
    assert "heavy_spend_15d" in names(heavy)
    assert heavy["score"] > calm["score"]


def test_repeat_payments_to_a_new_payee_add_points():
    first = check_behaviour(payment(is_new_payee=True, payee_count_15d=0), CUSTOMER)
    fifth = check_behaviour(payment(is_new_payee=True, payee_count_15d=4), CUSTOMER)
    assert "repeat_payments_new_payee" not in names(first)
    assert "repeat_payments_new_payee" in names(fifth)


def test_a_known_payee_paid_often_is_not_flagged_as_a_repeat():
    result = check_behaviour(payment(is_new_payee=False, payee_count_15d=6), CUSTOMER)
    assert "repeat_payments_new_payee" not in names(result)


def test_eight_payments_to_one_new_payee_end_in_a_hold():
    # The same pattern the testing agent uses: 450 each time, to a payee first paid in this period.
    last = payment(amount=450, is_new_payee=True, payee_account_age_days=45, payments_last_24h=7,
                   payments_last_15d=7, spend_last_15d=3150, payee_count_15d=7, payee_total_15d=3150)
    assert check_behaviour(last, {"typical_amount": 200, "segment": "family"})["suggestion"] == "hold"


def test_unusual_location_adds_a_reason():
    result = check_behaviour(payment(location_changed=True), CUSTOMER)
    names = [signal["name"] for signal in result["signals"]]
    assert names == ["location_change"]
    assert result["score"] == 10


def test_location_is_optional():
    assert check_behaviour(payment(), CUSTOMER)["score"] == 0
