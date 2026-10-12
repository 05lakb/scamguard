"""Final step: combine the checks and decide allow, warn or hold.

The decision only recommends an action. It cannot move or stop money by itself.
Every decision comes with plain reasons and a record of exactly what was used,
so a bank analyst can review it later.
"""

from backend.risk.behaviour import check_behaviour
from backend.risk.corroboration import claims_history_only, payee_unexplained

# At or above these scores, the action gets stricter.
WARN_AT = 40
HOLD_AT = 70

# How much weight the message reading gets (a likelihood of 100 adds 70 points).
MESSAGE_WEIGHT = 0.7
# After we asked, a new payee that nothing backs up adds this many points.
UNCORROBORATED_AFTER_ASKING = 20
# A customer who says they already know a payee we have never seen them pay adds this many points.
CLAIMED_HISTORY_MISMATCH = 15
# A risky-looking link in the message adds this many points.
LINK_RISK_POINTS = 25
# A customer who clearly checked things on their own, with a calm message, earns a discount.
VERIFIED_DISCOUNT = 25
CALM_BELOW = 30


# Relationships that are normal for a genuine payment.
ORDINARY_RELATIONSHIPS = {"landlord", "contractor", "supplier", "family", "friend"}
RISKY_CONTACT_SOURCES = {"dating_app", "social_media", "messaging_app"}


def story_adjustments(reading):
    """Points added or removed based on what the customer's story reveals.

    Reassuring facts only count when the story is not rehearsed, evasive or contradictory.
    Returns (points, reasons). Points can be negative.
    """
    points = 0
    reasons = []
    meets = lambda key, default=None: reading.get(key, default)  # older readings may lack these fields

    suspicious_story = meets("evasive") or meets("rehearsed_or_coached") or meets("contradicts_first_note")

    if meets("evasive"):
        points += 10
        reasons.append("The customer avoided answering our questions.")
    if meets("rehearsed_or_coached"):
        points += 10
        reasons.append("The answer sounds rehearsed, as if someone told the customer what to say.")
    if meets("contradicts_first_note"):
        points += 15
        reasons.append("The answer does not match the first note.")
    if meets("secrecy") == "concealment":
        points += 10
        reasons.append("The customer was told to keep this payment secret.")
    if meets("contact_source") in RISKY_CONTACT_SOURCES and meets("met_payee_in_person") == "no":
        points += 10
        reasons.append("The payee was met online and never in person.")

    if not suspicious_story and reading["scam_likelihood"] < 40:
        reduction = 0
        if meets("met_payee_in_person") == "yes" and meets("payee_relationship") in ORDINARY_RELATIONSHIPS:
            reduction += 20
        if meets("contact_source") in ("in_person", "referral") and meets("payee_relationship") in ORDINARY_RELATIONSHIPS:
            reduction += 10
        if reduction:
            points -= min(reduction, 30)
            reasons.append("The customer knows or has met the payee in an ordinary way, which lowers the risk.")
    return points, reasons


def action_for(score):
    if score >= HOLD_AT:
        return "hold"
    if score >= WARN_AT:
        return "warn"
    return "allow"


def decide(payment, customer, reading=None, scam_types=None, asked=False):
    """Return the decision for one payment.

    `reading` is the message reading (or None if the customer wrote nothing).
    `asked` is True on the second round, after the customer has answered our questions.
    """
    behaviour = check_behaviour(payment, customer)
    reasons = [item["reason"] for item in sorted(behaviour["signals"], key=lambda s: -s["points"])[:3]]

    message_points = 0
    discount = 0
    forced_hold = False

    if reading:
        new_payee = any(signal["name"] == "new_payee" for signal in behaviour["signals"])
        claims_only = new_payee and claims_history_only(reading)  # a claim of history, with no record to match
        message_points = round(reading["scam_likelihood"] * MESSAGE_WEIGHT)
        if reading["scam_likelihood"] >= 50:
            reasons.insert(0, reading["explanation"])
        if reading["customer_verified_independently"] and reading["scam_likelihood"] < CALM_BELOW and not claims_only:
            discount = VERIFIED_DISCOUNT
            reasons.append("The customer says they checked this on their own, which lowers the risk.")

        extra_points, extra_reasons = story_adjustments(reading)
        message_points += extra_points
        reasons.extend(extra_reasons)

        if claims_only:
            message_points += CLAIMED_HISTORY_MISMATCH
            reasons.append("The customer describes past dealings with this payee, but we have no record of ever paying them.")
        if asked and new_payee and payee_unexplained(reading):
            message_points += UNCORROBORATED_AFTER_ASKING
            reasons.append("We asked, but nothing backs up who the payee is.")
        risky_links = reading.get("suspicious_links_found") or []  # older readings may lack this field
        if risky_links:
            message_points += LINK_RISK_POINTS
            reasons.insert(0, f"The message contains a link that looks risky: {risky_links[0]['why']}.")
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
