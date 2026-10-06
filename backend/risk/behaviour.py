"""First safety check: does the payment itself look unusual for this customer?

It adds up warning points. Each point has a plain reason, so we can always
explain why a payment was flagged. It never calls any outside service.
"""

# How much bigger than usual a payment can be before it looks odd, by customer type.
AMOUNT_SLACK = {"small_business_owner": 2.0}

# Score at or above these numbers decides what the behaviour check alone suggests.
WARN_AT = 40
HOLD_AT = 70


def _add(signals, name, points, reason):
    signals.append({"name": name, "points": points, "reason": reason})


def check_behaviour(payment, customer):
    """Look at one payment and return a score from 0 to 100 plus the reasons."""
    signals = []

    if payment["is_new_payee"]:
        _add(signals, "new_payee", 15, "Money is going to someone the customer has not paid before.")
    if payment["is_new_payee"] and payment["payee_account_age_days"] < 30:
        _add(signals, "very_new_account", 15,
             f"The receiving account is only {payment['payee_account_age_days']} days old.")

    # Business owners' payments naturally swing a lot, so the same jump counts for less.
    slack = AMOUNT_SLACK.get(customer.get("segment"), 1.0)
    usual = max(customer["typical_amount"], 1) * slack
    ratio = payment["amount"] / usual
    if ratio >= 10:
        _add(signals, "amount_far_above_usual", 30, f"The amount is about {ratio:.0f} times what this customer usually pays.")
    elif ratio >= 5:
        _add(signals, "amount_well_above_usual", 20, f"The amount is about {ratio:.0f} times what this customer usually pays.")
    elif ratio >= 3:
        _add(signals, "amount_above_usual", 10, f"The amount is about {ratio:.0f} times what this customer usually pays.")

    hour = int(payment["timestamp"][11:13])
    if 1 <= hour <= 5:
        _add(signals, "odd_hour", 10, "The payment was made in the middle of the night.")

    if payment["on_live_call"]:
        _add(signals, "on_live_call", 25, "The customer was on a phone call while making the payment.")
    if payment["remote_access_tool_running"]:
        _add(signals, "remote_access", 35, "A remote-control tool was running, so someone else may be guiding or controlling the screen.")
    if not payment["device_known"]:
        _add(signals, "unknown_device", 10, "The payment came from a device we have not seen before.")
    if payment["payments_last_24h"] >= 2:
        _add(signals, "many_recent_payments", 10, "Several payments were made in the last 24 hours.")
    if payment["payee_type"] == "crypto_exchange":
        _add(signals, "crypto_payee", 10, "The money is going to a crypto exchange.")

    # What the customer has done over the last 15 days. Missing history simply adds nothing.
    spend = payment.get("spend_last_15d")
    if spend is not None:
        typical_spend = (customer.get("typical_spend_15d") or customer["typical_amount"] * 8) * slack
        ratio_15 = (spend + payment["amount"]) / max(typical_spend, 1)
        if ratio_15 >= 5:
            _add(signals, "heavy_spend_15d", 30,
                 f"About {ratio_15:.0f} times the usual 15-day spending has gone out, counting this payment.")
        elif ratio_15 >= 3:
            _add(signals, "heavy_spend_15d", 20,
                 f"About {ratio_15:.0f} times the usual 15-day spending has gone out, counting this payment.")
        elif ratio_15 >= 2:
            _add(signals, "heavy_spend_15d", 10,
                 f"About {ratio_15:.0f} times the usual 15-day spending has gone out, counting this payment.")

    repeats = payment.get("payee_count_15d") or 0
    if payment["is_new_payee"] and repeats >= 4:
        _add(signals, "repeat_payments_new_payee", 25,
             f"This would be payment number {repeats + 1} in 15 days to a payee that is still new.")
    elif payment["is_new_payee"] and repeats >= 2:
        _add(signals, "repeat_payments_new_payee", 15,
             f"This would be payment number {repeats + 1} in 15 days to a payee that is still new.")

    payee_total = payment.get("payee_total_15d")
    if payee_total is not None and (payee_total + payment["amount"]) / usual >= 8:
        _add(signals, "large_total_to_payee", 15,
             "The total sent to this one payee in 15 days is very large for this customer.")

    score = min(100, sum(item["points"] for item in signals))
    return {"score": score, "signals": signals, "suggestion": suggest(score)}


def suggest(score):
    """Turn a score into allow, warn or hold."""
    if score >= HOLD_AT:
        return "hold"
    if score >= WARN_AT:
        return "warn"
    return "allow"
