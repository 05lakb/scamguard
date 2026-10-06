"""The adaptive tester: an AI plays a coached scam victim, and tries to get a payment through.

Everything is made up. The attacker only writes what a customer could type: a short note, and
answers to the follow-up questions. It sees what the site tells it (just like a real scammer
watching a victim's screen), and it can try again up to three times with a calmer wording.
It never sees our rules or thresholds.
"""

import re

SCAM_SEEDS = [
    {"typology": "investment", "payee": "Quanta Yield Exchange", "payee_type": "crypto_exchange",
     "segment": "retiree", "typical": 180, "multiple": 1.8},
    {"typology": "bank_impersonation", "payee": "Dario Venn", "payee_type": "individual",
     "segment": "family", "typical": 300, "multiple": 1.6},
    {"typology": "romance", "payee": "Mira Solen", "payee_type": "individual",
     "segment": "young_professional", "typical": 260, "multiple": 1.7},
    {"typology": "remote_access", "payee": "Aster Tech Assist", "payee_type": "business",
     "segment": "retiree", "typical": 140, "multiple": 2.0},
    {"typology": "invoice_redirect", "payee": "Brindle Forge Supply", "payee_type": "business",
     "segment": "small_business_owner", "typical": 900, "multiple": 1.8},
    {"typology": "purchase", "payee": "Nyla Everet", "payee_type": "individual",
     "segment": "student", "typical": 90, "multiple": 1.9},
    {"typology": "advance_fee", "payee": "Riston Claim Office", "payee_type": "business",
     "segment": "retiree", "typical": 160, "multiple": 1.7},
    {"typology": "family_emergency", "payee": "Torin Vale", "payee_type": "individual",
     "segment": "family", "typical": 220, "multiple": 1.5},
]

BENIGN_SEEDS = [
    {"story": "a deposit for a surprise party that must stay secret from the birthday person",
     "payee": "Selene Hartwell", "payee_type": "individual", "segment": "family", "typical": 210, "multiple": 2.5},
    {"story": "an urgent rent deposit, because another tenant is waiting, with a lease already signed",
     "payee": "Hearth Vale Lettings", "payee_type": "business", "segment": "young_professional",
     "typical": 250, "multiple": 2.4},
    {"story": "a monthly top-up of the customer's own exchange account",
     "payee": "Sable Edge Exchange", "payee_type": "crypto_exchange", "segment": "young_professional",
     "typical": 850, "multiple": 0.8},
    {"story": "a first payment to a new supplier whose bank details were confirmed by phone",
     "payee": "Fernwood Dental Supply", "payee_type": "business", "segment": "small_business_owner",
     "typical": 900, "multiple": 3.0},
]


def payment_for(seed, new_payee_age=120):
    """A payment that looks ordinary: normal-ish amount, usual hour, the customer's own device."""
    return {
        "amount": round(seed["typical"] * seed["multiple"]), "currency": "USD",
        "timestamp": "2026-09-16T14:20:00", "payee_name": seed["payee"], "payee_type": seed["payee_type"],
        "is_new_payee": True, "payee_account_age_days": new_payee_age, "channel": "web",
        "device_known": True, "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False,
    }


def clean_text(text, limit=400):
    text = (text or "").strip().strip('"').strip("'")
    return re.sub(r"\s+", " ", text)[:limit]


def looks_like_refusal(text):
    return not text or bool(re.match(r"^(i can't|i cannot|i'm sorry|sorry,|i am unable)", text.strip(), re.I))


def history_text(history):
    if not history:
        return ""
    lines = ["Earlier attempts and what the bank did:"]
    for index, item in enumerate(history, start=1):
        reasons = "; ".join(item.get("reasons", [])[:3]) or "none shown"
        lines.append(f"- Attempt {index}: note {item['note']!r} -> bank decided {item['final_action']}. Reasons shown: {reasons}")
    lines.append("Write a different note that reads as even more ordinary and calm.")
    return "\n".join(lines)


def build_scam_note_prompt(seed, scam_type, history):
    return (
        "You are helping test a bank's scam-protection system. Everything is made up and nobody is harmed.\n"
        f"Play a bank customer who is being tricked by a \"{scam_type['name']}\" scam. "
        "Write the short note this customer types to the bank when making the payment. "
        "The customer believes the story. Make the note read as ordinary and calm as possible. "
        "One or two plain sentences. Do not use the words scam, fraud, fake or suspicious.\n"
        f"How the scam works: {scam_type['how_it_works']}\n"
        f"Payment: {round(seed['typical'] * seed['multiple'])} USD to {seed['payee']}.\n"
        f"{history_text(history)}\n"
        "Return only the note text."
    )


def build_scam_reply_prompt(seed, scam_type, note, questions):
    return (
        "You are helping test a bank's scam-protection system. Everything is made up and nobody is harmed.\n"
        f"The same customer ({scam_type['name']} scam) wrote: {note!r}\n"
        f"The bank now asks: {' '.join(questions)}\n"
        "The scammer has coached the customer to give calm, reassuring answers that do not raise "
        "suspicion. Write the customer's reply in one to three short sentences, in the first person, "
        "plain words. Return only the reply text."
    )


def build_benign_note_prompt(seed):
    return (
        "You are helping test a bank's scam-protection system. Everything is made up.\n"
        f"Play a genuine bank customer making this payment: {seed['story']}. "
        "Write the short, natural note they type to the bank, in one or two plain sentences. "
        "Real people are brief and a little informal. Return only the note text."
    )


def build_benign_reply_prompt(seed, note, questions):
    return (
        "You are helping test a bank's scam-protection system. Everything is made up.\n"
        f"A genuine customer making this payment ({seed['story']}) wrote: {note!r}\n"
        f"The bank asks: {' '.join(questions)}\n"
        "Write the customer's honest, natural reply in one to three short sentences. "
        "Return only the reply text."
    )


def _post(site, seed, note, questions=None, answer=None):
    body = {
        "payment": payment_for(seed),
        "customer": {"segment": seed["segment"], "typical_amount": seed["typical"]},
        "message": note or None,
    }
    if answer is not None:
        body["questions"] = questions
        body["answer"] = answer
    return site.assess(body)


def run_scam_seed(site, writer, seed, scam_type, max_tries=3):
    """Try to get one scam payment through. Returns a record of every attempt."""
    history = []
    record = {"kind": "scam", "typology": seed["typology"], "tries": [], "evaded": False, "evaded_on_try": None}
    for attempt in range(1, max_tries + 1):
        note = clean_text(writer(build_scam_note_prompt(seed, scam_type, history)))
        if looks_like_refusal(note):
            record["tries"].append({"note": note, "error": "attacker declined to write the note"})
            break
        first = _post(site, seed, note)
        if first.status != 200 or not first.body:
            record["tries"].append({"note": note, "error": f"site answered {first.status}"})
            break
        final = first.body
        step = {"note": note, "first_action": first.body["action"], "questions": first.body.get("questions")}
        if first.body["action"] == "ask":
            answer = clean_text(writer(build_scam_reply_prompt(seed, scam_type, note, first.body["questions"])))
            second = _post(site, seed, note, first.body["questions"], answer)
            if second.status != 200 or not second.body:
                step.update(answer=answer, error=f"site answered {second.status} on the second round")
                record["tries"].append(step)
                break
            final = second.body
            step["answer"] = answer
        step.update(final_action=final["action"], score=final.get("score"), reasons=final.get("reasons", []),
                    degraded=bool(final.get("degraded")))
        record["tries"].append(step)
        history.append(step)
        if final["action"] == "allow":
            record["evaded"] = True
            record["evaded_on_try"] = attempt
            break
    return record


def run_benign_seed(site, writer, seed):
    """A genuine customer with a scary-sounding story. Any friction counts as a false alarm."""
    record = {"kind": "benign", "story": seed["story"], "tries": [], "false_alarm": False}
    note = clean_text(writer(build_benign_note_prompt(seed)))
    if looks_like_refusal(note):
        record["tries"].append({"note": note, "error": "attacker declined to write the note"})
        return record
    first = _post(site, seed, note)
    if first.status != 200 or not first.body:
        record["tries"].append({"note": note, "error": f"site answered {first.status}"})
        return record
    final = first.body
    step = {"note": note, "first_action": first.body["action"], "questions": first.body.get("questions")}
    if first.body["action"] == "ask":
        answer = clean_text(writer(build_benign_reply_prompt(seed, note, first.body["questions"])))
        second = _post(site, seed, note, first.body["questions"], answer)
        if second.status == 200 and second.body:
            final = second.body
            step["answer"] = answer
    step.update(final_action=final["action"], score=final.get("score"), reasons=final.get("reasons", []),
                degraded=bool(final.get("degraded")))
    record["tries"].append(step)
    record["false_alarm"] = final["action"] != "allow"
    return record
