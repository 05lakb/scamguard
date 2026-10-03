"""Final step: combine the checks and decide allow, warn or hold.

The decision only recommends an action. It cannot move or stop money by itself.
Every decision comes with plain reasons and a record of exactly what was used,
so a bank analyst can review it later.
"""

from backend.risk.behaviour import check_behaviour

# At or above these scores, the action gets stricter.
WARN_AT = 40
HOLD_AT = 70

# How much weight the message reading gets (a likelihood of 100 adds 70 points).
MESSAGE_WEIGHT = 0.7
# A customer who clearly checked things on their own, with a calm message, earns a discount.
VERIFIED_DISCOUNT = 25
CALM_BELOW = 30


def action_for(score):
    if score >= HOLD_AT:
        return "hold"
    if score >= WARN_AT:
        return "warn"
    return "allow"


def decide(payment, customer, reading=None, scam_types=None):
    """Return the decision for one payment.

    `reading` is the message reading (or None if the customer wrote nothing).
    """
    behaviour = check_behaviour(payment, customer)
    reasons = [item["reason"] for item in sorted(behaviour["signals"], key=lambda s: -s["points"])[:3]]

    message_points = 0
    discount = 0
    forced_hold = False

    if reading:
        message_points = round(reading["scam_likelihood"] * MESSAGE_WEIGHT)
        if reading["scam_likelihood"] >= 50:
            reasons.insert(0, reading["explanation"])
        if reading["customer_verified_independently"] and reading["scam_likelihood"] < CALM_BELOW:
            discount = VERIFIED_DISCOUNT
            reasons.append("The customer says they checked this on their own, which lowers the risk.")
        if reading["orders_found_in_message"]:
            # A real customer does not write orders to a safety checker, so a person must look.
            forced_hold = True
            reasons.insert(0, "The message tried to give orders to the safety check, which is a manipulation attempt.")

    score = max(0, min(100, behaviour["score"] + message_points - discount))
    action = "hold" if forced_hold else action_for(score)

    matched = reading["matched_typology"] if reading else "none"
    return {
        "action": action,
        "score": score,
        "reasons": reasons[:4],
        "customer_warning": warning_text(action, matched, scam_types or []),
        "audit": {
            "behaviour_score": behaviour["score"],
            "behaviour_signals": behaviour["signals"],
            "message_points": message_points,
            "verified_discount": discount,
            "message_reading": reading,
            "forced_hold": forced_hold,
            "thresholds": {"warn": WARN_AT, "hold": HOLD_AT},
        },
    }


def warning_text(action, matched_typology, scam_types):
    """Write a short note for the customer in everyday words."""
    if action == "allow":
        return ""
    advice = next((item["safe_advice"] for item in scam_types if item["id"] == matched_typology), None)
    if action == "hold":
        start = "We have paused this payment so a specialist can check it with you. This is to protect your money."
    else:
        start = "Please stop for a moment before sending this payment. It has some signs that match known scams."
    return f"{start} {advice}" if advice else start
