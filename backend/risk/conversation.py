"""Voice AI: read a call transcript or chat and spot social-engineering patterns.

Two readers, and the response always says which one ran:
  - "gemini": the same structured message reader the payment check uses,
  - "rules":  a transparent phrase matcher used when Gemini is not configured,
              is busy, or the cost guard has paused it.

The transcript is untrusted. Nothing in it is ever followed as an instruction.
"""

import re

# Each pattern group: (tactic id, label shown to the analyst, points, regular expressions).
PATTERNS = [
    ("credential_request", "Asks for an OTP, PIN, CVV or password", 35, [
        r"\b(otp|one[- ]time (password|code)|pin|cvv|password|passcode|verification code)\b",
    ]),
    ("authority", "Claims to be a bank, police or government official", 20, [
        r"\b(from|calling from|this is) (your |the )?(bank|rbi|reserve bank|police|cyber ?cell|customs|income tax|tax department|trai|fedex|courier)\b",
        r"\b(bank|security|fraud|kyc) (department|team|officer|executive)\b",
        r"\b(officer|inspector|cbi|ed officer)\b",
    ]),
    ("fear", "Threatens blocking, arrest or penalties", 20, [
        r"\b(will be|is being|has been|get) (blocked|suspended|frozen|closed|deactivated|arrested|seized)\b",
        r"\b(arrest|warrant|legal action|penalty|fine|case (has been )?registered|digital arrest)\b",
    ]),
    ("urgency", "Creates time pressure", 15, [
        r"\b(immediately|right now|urgent(ly)?|within (the )?(next )?\d+ (minutes|hours)|today itself|before (tonight|midnight|the end of the day)|last chance|expires? (today|tonight))\b",
    ]),
    ("secrecy", "Tells the victim to keep it secret", 15, [
        r"\b(don'?t|do not|never) (tell|inform|share (this )?with) (anyone|anybody|your (family|bank|branch|wife|husband|son|daughter))\b",
        r"\b(keep (this|it) (secret|confidential|between us))\b",
    ]),
    ("remote_control", "Asks to install a remote-access or screen-share app", 30, [
        r"\b(anydesk|teamviewer|quick ?support|rustdesk|screen ?share|remote access|alpemix)\b",
    ]),
    ("off_platform_payment", "Directs money to a 'safe' account, UPI, gift card or crypto", 20, [
        r"\b(safe account|secure account|holding account|transfer (the )?(money|amount|funds) to)\b",
        r"\b(gift ?cards?|bitcoin|usdt|crypto wallet|upi (id|pin))\b",
        r"\b(scan (this|the) qr|collect request|approve the request)\b",
    ]),
    ("guaranteed_returns", "Promises guaranteed or unrealistic returns", 20, [
        r"\b(guaranteed (return|profit)s?|double your money|\d{2,3}% (return|profit)s?|risk[- ]free (investment|profit))\b",
    ]),
    ("fee_to_receive_money", "Asks for a fee to release a prize, refund or loan", 20, [
        r"\b(processing|release|registration|clearance|customs) (fee|charge)\b",
        r"\b(you (have )?won|lottery|prize money|refund of rs|cashback of)\b",
    ]),
]

VERDICTS = [(70, "high"), (40, "medium"), (0, "low")]


def _level(score):
    for floor, name in VERDICTS:
        if score >= floor:
            return name
    return "low"


def _sentence_around(text, index):
    """The sentence that contains position `index`, trimmed to a readable length."""
    start = max(text.rfind(mark, 0, index) for mark in ".!?\n") + 1
    ends = [pos for pos in (text.find(mark, index) for mark in ".!?\n") if pos != -1]
    end = min(ends) + 1 if ends else len(text)
    return text[start:end].strip()[:160]


def rule_reading(text):
    """Match known social-engineering phrases. Returns the fields the screen needs."""
    lowered = text.lower()
    indicators = []
    phrases = []
    for tactic, label, points, patterns in PATTERNS:
        for pattern in patterns:
            match = re.search(pattern, lowered)
            if match:
                indicators.append({"tactic": tactic, "label": label, "points": points})
                snippet = _sentence_around(text, match.start())
                if snippet not in phrases:
                    phrases.append(snippet)
                break
    # Combinations are stronger than single phrases: a caller who claims authority AND asks for
    # a code is the classic vishing script.
    tactics = {item["tactic"] for item in indicators}
    score = sum(item["points"] for item in indicators)
    if {"authority", "credential_request"} <= tactics:
        score += 15
    if {"fear", "urgency"} <= tactics:
        score += 10
    score = min(100, score)
    if not indicators:
        explanation = "No known social-engineering phrases were found in this text."
    else:
        names = ", ".join(item["label"].lower() for item in indicators[:3])
        explanation = f"The text matches known scam-call patterns: {names}."
    return {
        "scam_likelihood": score,
        "tactics": sorted(tactics) or ["none"],
        "indicators": indicators,
        "suspicious_phrases": phrases[:4],
        "explanation": explanation,
    }


def analyse(text, reader=None, scam_types=None):
    """Read one transcript. Uses `reader` (Gemini) when given and working, else the rules."""
    text = text.strip()
    rules = rule_reading(text)
    source = "rules"
    notice = None
    reading = None
    if reader is not None:
        try:
            reading = reader(text, scam_types or [])
            source = "gemini"
        except Exception:  # never show internal details; fall back to the transparent rules
            notice = "The AI reader is unavailable right now, so this result uses phrase rules only."
    if reading is not None:
        likelihood = int(reading.get("scam_likelihood", 0))
        result = {
            "scam_likelihood": likelihood,
            "tactics": reading.get("tactics") or ["none"],
            "indicators": rules["indicators"],
            "suspicious_phrases": (reading.get("suspicious_phrases") or [])[:4] or rules["suspicious_phrases"],
            "explanation": reading.get("explanation") or rules["explanation"],
            "matched_typology": reading.get("matched_typology", "none"),
            "orders_found_in_message": reading.get("orders_found_in_message", []),
        }
    else:
        result = {**rules, "matched_typology": "none", "orders_found_in_message": []}
    result["risk_level"] = _level(result["scam_likelihood"])
    result["recommendation"] = {
        "high": "End the call. Do not share any code or move money. Call the bank on the number printed on your card.",
        "medium": "Pause. Verify the caller independently before acting on anything they ask.",
        "low": "No strong scam pattern found. Stay alert if the caller asks for codes or money.",
    }[result["risk_level"]]
    result["source"] = source
    if notice:
        result["notice"] = notice
    return result
