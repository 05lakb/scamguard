"""The simulated customer: an AI that plays the persona in a scenario, in its own natural words.

It only ever sees its own persona and what the bank asks it. It never sees the bank's rules.
The site never sees the scenario's label or persona. It only gets what a real customer's
screen would send: the payment, the customer profile, the note, and later the answer.
"""

import random
import re

REFUSALS = [
    "I'd rather not say.",
    "Why do you need to know that? It's my money.",
    "That's private. Just let the payment through please.",
    "I don't want to go into it, it's personal.",
]


def clean_text(text, limit=500):
    text = (text or "").strip().strip('"').strip("'")
    return re.sub(r"\s+", " ", text)[:limit]


def looks_like_refusal(text):
    return not text or bool(re.match(r"^(i can't|i cannot|i'm sorry|sorry,|i am unable)", text.strip(), re.I))


def build_note_prompt(scenario):
    persona = scenario["persona"]
    p = scenario["payment"]
    belief = (
        "You believe this story completely and it does not occur to you that it could be a scam. "
        "Never use the words scam, fraud, fake or suspicious."
        if persona["role"] == "victim" else "You are a genuine customer with a genuine reason."
    )
    coached = (" The person asking for the money has told you what to say: keep the note calm and brief and "
               "do not mention anything unusual." if persona["coached"] else "")
    return (
        "You are role-playing a bank customer in a made-up test of a bank's scam-protection system. Nobody is harmed.\n"
        f"Who you are: a {scenario['customer']['segment'].replace('_', ' ')}.\n"
        f"The true situation: {persona['facts']}\n"
        f"{belief}{coached}\n"
        f"You are paying {p['amount']} USD to {p['payee_name']}.\n"
        f"Write the short note you type to the bank with this payment. Style: {persona['voice']}. "
        "One or two sentences in plain words. Do not mention any rules or systems. Return only the note text."
    )


def build_reply_prompt(scenario, note, questions):
    persona = scenario["persona"]
    parts = [
        "You are role-playing a bank customer in a made-up test of a bank's scam-protection system. Nobody is harmed.",
        f"The true situation: {persona['facts']}",
        f"Your first note to the bank was: {note!r}",
        f"The bank now asks you: {' '.join(questions)}",
    ]
    if persona["role"] == "genuine":
        parts.append("You are genuine. Answer honestly and clearly, including any checks you made.")
    elif persona["coached"]:
        parts.append("The person asking for the money has coached you to give calm, reassuring answers, and "
                     "not to reveal details such as how you met or who is guiding you. You believe them.")
    elif persona["contradicts"]:
        parts.append("Make your answer clearly conflict with your first note on one key fact, such as who the money "
                     "is for or why you are paying, as if you are making it up on the spot.")
    else:
        parts.append("You believe the story. Answer honestly according to the true situation, including details "
                     "such as how you know the person.")
    parts.append(f"Style: {persona['voice']}. Reply in one to three short sentences. Return only the reply text.")
    return "\n".join(parts)


def request_for(scenario, note=None, questions=None, answer=None):
    """Exactly what the site gets. No labels, no persona, no hidden answers."""
    body = {"payment": scenario["payment"], "customer": scenario["customer"], "message": note or None}
    if answer is not None:
        body["questions"] = questions
        body["answer"] = answer
    return body


def play(site, writer, scenario, rng=None):
    """Run one scenario. Returns a record of what was said and decided."""
    rng = rng or random.Random(scenario["id"])
    persona = scenario["persona"]
    record = {"id": scenario["id"], "label": scenario["label"], "category": scenario["category"],
              "difficulty": scenario["difficulty"], "typology": scenario.get("typology"),
              "expected_actions": scenario["expected_actions"]}

    note = None
    if persona["writes_note"]:
        note = clean_text(writer(build_note_prompt(scenario)))
        if looks_like_refusal(note):
            record["error"] = "the simulated customer declined to write the note"
            return record
    if persona["injection"]:
        note = f"{note or ''} {persona['injection']}".strip()
    record["note"] = note

    first = site.assess(request_for(scenario, note))
    if first.status != 200 or not first.body:
        record["error"] = f"site answered {first.status}"
        return record
    final = first.body
    record["first_action"] = first.body["action"]

    if first.body["action"] == "ask":
        questions = first.body["questions"]
        record["questions"] = questions
        if persona["refuses"]:
            answer = rng.choice(REFUSALS)
        else:
            answer = clean_text(writer(build_reply_prompt(scenario, note, questions)))
            if looks_like_refusal(answer):
                answer = "I'd rather not say."
        record["answer"] = answer
        second = site.assess(request_for(scenario, note, questions, answer))
        if second.status != 200 or not second.body:
            record["error"] = f"site answered {second.status} on the second round"
            return record
        final = second.body

    record.update(final_action=final["action"], score=final.get("score"), reasons=final.get("reasons", []),
                  degraded=bool(final.get("degraded")))
    record["ok"] = None if record["degraded"] else final["action"] in scenario["expected_actions"]
    return record
