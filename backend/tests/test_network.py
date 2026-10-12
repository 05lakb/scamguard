"""MuleNet graph evidence and its effect on the existing recommendation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.risk.decision import decide  # noqa: E402
from backend.risk.network import investigate_network  # noqa: E402


def transfer(source, target, amount=100, hours_ago=1):
    return {"from_account_id": source, "to_account_id": target,
            "amount": amount, "hours_ago": hours_ago}


def calm_payment():
    return {"amount": 100, "timestamp": "2026-09-10T14:30:00", "payee_type": "individual",
            "is_new_payee": False, "payee_account_age_days": 365, "device_known": True,
            "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False}


def test_no_network_is_explicitly_unavailable():
    assert investigate_network(None) == {"available": False, "score": 0, "signals": []}


def test_direct_flagged_payee_recommends_review_without_a_message():
    network = {"payee_account_id": "payee", "flagged_account_ids": ["payee"], "transfers": []}
    result = decide(calm_payment(), {"typical_amount": 100}, network=network)
    assert result["action"] == "hold"
    assert result["audit"]["network_score"] == 70
    assert result["audit"]["network_available"] is True


def test_reassuring_message_cannot_clear_a_flagged_payee():
    network = {"payee_account_id": "payee", "flagged_account_ids": ["payee"], "transfers": []}
    reading = {"scam_likelihood": 0, "customer_verified_independently": True,
               "matched_typology": "none", "orders_found_in_message": []}
    result = decide(calm_payment(), {"typical_amount": 100}, reading=reading, network=network)
    assert result["action"] == "hold"
    assert result["score"] >= 70


def test_linked_account_and_rapid_flow_add_distinct_explainable_signals():
    network = {"payee_account_id": "payee", "flagged_account_ids": ["flagged"],
               "transfers": [transfer("a", "payee"), transfer("b", "payee"),
                             transfer("c", "payee"), transfer("payee", "flagged", 250)]}
    result = investigate_network(network)
    assert result["score"] == 75
    assert {signal["name"] for signal in result["signals"]} == {
        "flagged_direct_link", "many_inbound_senders", "rapid_onward_transfer"}


def test_two_hop_link_is_weaker_and_old_transfers_do_not_count_as_velocity():
    network = {"payee_account_id": "payee", "flagged_account_ids": ["flagged"],
               "transfers": [transfer("payee", "middle", hours_ago=48),
                             transfer("middle", "flagged", hours_ago=48)]}
    result = investigate_network(network)
    assert result["score"] == 15
    assert result["signals"][0]["name"] == "flagged_two_hop_link"


def test_outgoing_before_incoming_is_not_onward_movement():
    network = {"payee_account_id": "payee", "flagged_account_ids": [],
               "transfers": [transfer("a", "payee", hours_ago=1),
                             transfer("payee", "b", hours_ago=2)]}
    assert investigate_network(network)["score"] == 0
