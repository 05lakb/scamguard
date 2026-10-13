"""MuleNet prototype: explainable checks on a small, synthetic account graph.

The graph is supplied with a demo request. A bank integration must build it from
trusted account and transfer records rather than from customer input.
"""

from collections import defaultdict


def investigate_network(network):
    """Return a bounded risk score and evidence for the destination account."""
    if not network:
        return {"available": False, "score": 0, "signals": []}

    payee = network["payee_account_id"]
    flagged = set(network.get("flagged_account_ids", []))
    transfers = network.get("transfers", [])
    signals = []

    def add(name, points, reason):
        signals.append({"name": name, "points": points, "reason": reason})

    if payee in flagged:
        add("flagged_payee", 70, "The receiving account is on the supplied flagged-account list.")
    else:
        neighbours = defaultdict(set)
        for transfer in transfers:
            source, target = transfer["from_account_id"], transfer["to_account_id"]
            neighbours[source].add(target)
            neighbours[target].add(source)
        if neighbours[payee] & flagged:
            add("flagged_direct_link", 35, "The receiving account transferred money to or from a flagged account.")
        elif any(neighbours[account] & flagged for account in neighbours[payee]):
            add("flagged_two_hop_link", 15, "The receiving account is two transfer links from a flagged account.")

    recent_inbound = [transfer for transfer in transfers
                      if transfer["to_account_id"] == payee and transfer["hours_ago"] <= 24]
    senders = {transfer["from_account_id"] for transfer in recent_inbound}
    if len(senders) >= 3:
        add("many_inbound_senders", 15, "At least three different accounts paid this account in the last 24 hours.")

    inbound_amount = sum(transfer["amount"] for transfer in recent_inbound)
    # A later outgoing transfer has a smaller hours_ago value than an incoming one.
    latest_inbound = min((transfer["hours_ago"] for transfer in recent_inbound), default=None)
    outbound_amount = sum(transfer["amount"] for transfer in transfers
                          if transfer["from_account_id"] == payee and transfer["hours_ago"] <= 24
                          and latest_inbound is not None and transfer["hours_ago"] <= latest_inbound)
    if inbound_amount > 0 and outbound_amount >= inbound_amount * 0.8:
        add("rapid_onward_transfer", 25, "This account sent out at least 80% of its recent incoming value within 24 hours.")

    return {"available": True, "score": min(100, sum(signal["points"] for signal in signals)),
            "signals": signals}
