"""Creates a file of random, made-up test scenarios.

Run it with:  python3 -m redteam.factory --count 40 --seed 7
The same seed always gives the same file, so a test run can be repeated exactly.

Each scenario holds three things:
  - the inputs the site will see (a customer, a payment with 15 days of history),
  - a persona that tells the simulated customer how to behave,
  - the hidden answer, used only for scoring. The site never sees it.
"""

import argparse
import json
import random
from pathlib import Path

from redteam.attacks import INJECTIONS

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

SEGMENTS = {
    "retiree": {"amount": (40, 300), "per_month": (6, 14)},
    "young_professional": {"amount": (30, 600), "per_month": (15, 40)},
    "small_business_owner": {"amount": (200, 4000), "per_month": (20, 60)},
    "student": {"amount": (10, 120), "per_month": (8, 25)},
    "family": {"amount": (50, 900), "per_month": (15, 35)},
}

FIRST_NAMES = ["Amara", "Ben", "Carla", "Dev", "Elena", "Farid", "Grace", "Hiro", "Ines", "Jamal", "Kofi", "Lena",
               "Mateo", "Nia", "Omar", "Priya", "Quinn", "Rosa", "Sven", "Tara", "Umar", "Vera", "Wen", "Yara"]
LAST_NAMES = ["Adler", "Bianchi", "Chen", "Diaz", "Eze", "Fischer", "Garcia", "Hughes", "Ito", "Jensen", "Khan",
              "Lopez", "Mendes", "Novak", "Okafor", "Patel", "Reyes", "Silva", "Tanaka", "Walker"]
BUSINESS_A = ["Veldora", "Kestrion", "Lumaris", "Zentora", "Voxelia", "Primaro", "Brenmoor", "Quillon", "Tavara", "Norvex"]
BUSINESS_B = ["Supply", "Trade Ltd", "Services", "Lettings", "Exchange", "Partners", "Solutions", "Works"]
BILLERS = ["Bright Water Utility", "City Power Co", "Home Broadband Ltd", "Metro Transit", "Northside Gym"]

VOICES = [
    "short and a bit rushed, like a text message",
    "polite and a little formal",
    "casual, all lowercase, with a couple of small typos",
    "worried and apologetic",
    "calm and matter-of-fact",
    "chatty and friendly",
]

# How many of each kind of scenario, as a share of the total.
PLAN = [
    ("obvious_scam", 15), ("quiet_scam", 20), ("coached_victim", 15), ("contradiction", 8), ("refusal", 8),
    ("split_payments", 10), ("injection", 8), ("obvious_legit", 8), ("mixed_signal_legit", 8),
]

DIFFICULTY = {
    "obvious_scam": "easy", "obvious_legit": "easy", "refusal": "medium", "split_payments": "medium",
    "quiet_scam": "hard", "coached_victim": "hard", "contradiction": "hard", "injection": "hard",
    "mixed_signal_legit": "hard",
}

ALWAYS_HIGH = {"bank_impersonation", "remote_access"}

SCAM_FACTS = {
    "investment": [
        "A person called {contact} in an online trading group says the customer's crypto account has grown 40% and that {amount} USD must be deposited today to unlock withdrawals.",
        "A 'mentor' named {contact} on a messaging app promised steady daily returns and asked for {amount} USD to be sent to an exchange to get started.",
    ],
    "bank_impersonation": [
        "A caller said they are from the bank's fraud team and the account is under attack. They told the customer to move {amount} USD to a safe account and not to tell the branch.",
        "A man claiming to be a police officer says criminals have the card details and the customer must transfer {amount} USD to a protected account right now.",
    ],
    "romance": [
        "The customer has chatted for three months with {contact} on a dating app. They have never met or video called. {contact} now needs {amount} USD for an urgent travel visa.",
        "{contact}, an online partner, asked for {amount} USD for a hospital bill abroad and asked the customer to keep it private from their family.",
    ],
    "remote_access": [
        "A pop-up said the computer has a virus. A 'technician' called {contact} is controlling the screen remotely and says {amount} USD is needed for a protection renewal.",
        "A caller named {contact} says a refund of {amount} USD was sent by mistake and the customer must send it back while {contact} watches the screen.",
    ],
    "invoice_redirect": [
        "An email from the supplier {contact} says their bank details changed. The invoice of {amount} USD must be paid today to the new account. The customer has not phoned to check.",
        "The customer's solicitor {contact} emailed new account details for a house deposit of {amount} USD, saying completion is tomorrow.",
    ],
    "purchase": [
        "The customer found a bargain online from a seller called {contact}, who insists on a bank transfer outside the website for {amount} USD because other buyers are waiting.",
        "A landlord named {contact} asks for a {amount} USD deposit before the customer can view the flat, because they are abroad.",
    ],
    "advance_fee": [
        "The customer was told they won a prize and must pay {amount} USD in fees to {contact}'s claims office before it is released.",
        "A lawyer named {contact} says the customer inherited money and needs {amount} USD in legal fees first.",
    ],
    "family_emergency": [
        "A text from an unknown number says it is the customer's child with a new phone, in trouble, needing {amount} USD sent to a friend named {contact} today, and to keep it from the other parent.",
        "A message claims to be the customer's brother, whose card is blocked, asking for {amount} USD for a friend named {contact}. He says he cannot call.",
    ],
}

GENUINE_FACTS = [
    ("surprise party", "The customer is paying {amount} USD to {contact}, who is organising a surprise party for the customer's sister. They know {contact} well and want to keep it secret from the sister."),
    ("urgent rent", "The customer signed a lease yesterday after viewing the flat twice, and must pay a rent deposit of {amount} USD to {contact} today because another tenant is waiting."),
    ("own crypto", "The customer tops up their own long-standing exchange account with {amount} USD, as they do every month."),
    ("verified supplier", "The customer pays {amount} USD to a new supplier {contact} after phoning the supplier on the number from their signed contract to confirm the bank details."),
    ("car deposit", "The customer test drove and inspected a used car last Saturday and pays a deposit of {amount} USD to the seller {contact}, who gave paperwork."),
    ("family loan", "The customer lends {amount} USD to their brother {contact} for course fees and spoke with him by phone this morning."),
]


def person(rng):
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def business(rng):
    return f"{rng.choice(BUSINESS_A)} {rng.choice(BUSINESS_B)}"


def counts_for(total):
    """Turn the plan percentages into whole numbers that add up to the total."""
    weight = sum(share for _, share in PLAN)
    raw = [(name, total * share / weight) for name, share in PLAN]
    counts = {name: int(value) for name, value in raw}
    leftover = total - sum(counts.values())
    for name, value in sorted(raw, key=lambda item: item[1] - int(item[1]), reverse=True)[:leftover]:
        counts[name] += 1
    return counts


def make_customer(rng):
    segment = rng.choice(list(SEGMENTS))
    spec = SEGMENTS[segment]
    typical = rng.randint(*spec["amount"])
    per_month = rng.randint(*spec["per_month"])
    return {"segment": segment, "typical_amount": typical, "typical_spend_15d": max(typical, round(typical * per_month / 2))}


def base_payment(rng, customer, amount, payee_name, payee_type, new_payee, account_age):
    typical_spend = customer["typical_spend_15d"]
    hour = rng.randint(9, 20)
    return {
        "amount": max(20, int(amount)), "currency": "USD",
        "timestamp": f"2026-09-{rng.randint(10, 28):02d}T{hour:02d}:{rng.randint(0, 59):02d}:00",
        "payee_name": payee_name, "payee_type": payee_type, "is_new_payee": new_payee,
        "payee_account_age_days": account_age, "channel": rng.choice(["mobile", "web"]),
        "device_known": True, "payments_last_24h": 0, "on_live_call": False, "remote_access_tool_running": False,
        "payments_last_15d": rng.randint(2, 12),
        "spend_last_15d": round(typical_spend * rng.uniform(0.4, 1.1)),
        "payee_count_15d": 0, "payee_total_15d": 0,
    }


def make_scenario(rng, category, typologies, index, seed):
    customer = make_customer(rng)
    typical = customer["typical_amount"]
    label = "legit" if category in ("obvious_legit", "mixed_signal_legit") else "scam"
    typology = None
    persona = {"role": "genuine" if label == "legit" else "victim", "voice": rng.choice(VOICES), "coached": False,
               "refuses": False, "contradicts": False, "injection": None, "writes_note": True}

    contact = person(rng)
    if label == "scam":
        typology = rng.choice(typologies)["id"]
        payee_type = {"investment": "crypto_exchange", "remote_access": "business", "invoice_redirect": "business",
                      "advance_fee": "business"}.get(typology, "individual")
        payee_name = business(rng) if payee_type != "individual" else contact
    else:
        payee_type, payee_name = "individual", contact

    if category == "obvious_scam":
        amount = typical * rng.uniform(5, 18)
        payment = base_payment(rng, customer, amount, payee_name, payee_type, True, rng.randint(0, 20))
        if typology == "bank_impersonation":
            payment["on_live_call"] = True
        if typology == "remote_access":
            payment["remote_access_tool_running"] = True
            payment["on_live_call"] = True
        payment["device_known"] = rng.random() > 0.3
    elif category in ("quiet_scam", "coached_victim", "injection"):
        amount = typical * rng.uniform(0.9, 2.2 if category != "coached_victim" else 3.2)
        payment = base_payment(rng, customer, amount, payee_name, payee_type, True, rng.randint(60, 500))
        persona["coached"] = category == "coached_victim"
        if category == "injection":
            persona["injection"] = rng.choice(list(INJECTIONS.values()))
    elif category == "contradiction":
        amount = typical * rng.uniform(2.5, 4.5)
        payment = base_payment(rng, customer, amount, payee_name, payee_type, True, rng.randint(30, 200))
        persona["contradicts"] = True
    elif category == "refusal":
        amount = typical * rng.uniform(3.2, 6)
        payment = base_payment(rng, customer, amount, payee_name, payee_type, True, rng.randint(5, 60))
        persona["refuses"] = True
    elif category == "split_payments":
        amount = typical * rng.uniform(1.8, 2.6)
        payment = base_payment(rng, customer, amount, payee_name, payee_type, True, rng.randint(30, 90))
        earlier = rng.randint(3, 7)
        payment["payee_count_15d"] = earlier
        payment["payee_total_15d"] = round(earlier * amount)
        payment["payments_last_15d"] = earlier + rng.randint(0, 3)
        payment["spend_last_15d"] = round(earlier * amount + customer["typical_spend_15d"] * 0.5)
        payment["payments_last_24h"] = min(earlier, rng.randint(2, 5))
    elif category == "obvious_legit":
        amount = typical * rng.uniform(0.5, 1.4)
        payee_name = rng.choice(BILLERS)
        payment = base_payment(rng, customer, amount, payee_name, "business", False, rng.randint(1000, 4000))
        persona["writes_note"] = rng.random() < 0.4
    else:  # mixed_signal_legit
        amount = typical * rng.uniform(2.2, 6)
        payment = base_payment(rng, customer, amount, payee_name, payee_type, True, rng.randint(300, 2000))
        payment["on_live_call"] = rng.random() < 0.3
        payment["device_known"] = rng.random() > 0.25

    if category == "obvious_legit":
        facts = f"The customer pays their regular {payee_name} bill, as every month."
        story = "regular bill"
    elif label == "legit":
        story, template = rng.choice(GENUINE_FACTS)
        facts = template.format(contact=contact, amount=payment["amount"])
        if story == "own crypto":
            payment["payee_type"], payment["payee_name"] = "crypto_exchange", business(rng).replace("Supply", "Exchange")
    else:
        facts = rng.choice(SCAM_FACTS[typology]).format(contact=contact, amount=payment["amount"])
        story = typology
    persona["facts"] = facts

    high = typology in ALWAYS_HIGH or (category == "obvious_scam" and payment["amount"] > typical * 6)
    if label == "legit":
        expected = ["allow"] if category == "obvious_legit" else ["allow", "warn"]
    else:
        expected = ["hold"] if (category == "obvious_scam" and high) else ["warn", "hold"]

    return {
        "id": f"S{seed}-{index:03d}", "label": label, "category": category, "difficulty": DIFFICULTY[category],
        "typology": typology, "story": story, "customer": customer, "payment": payment, "persona": persona,
        "expected_actions": expected,
    }


def build(count, seed):
    rng = random.Random(seed)
    typologies = json.loads((ROOT / "data" / "typologies.json").read_text(encoding="utf-8"))
    scenarios = []
    for category, how_many in counts_for(count).items():
        for _ in range(how_many):
            scenarios.append((category,))
    rng.shuffle(scenarios)
    result = [make_scenario(rng, category, typologies, index, seed) for index, (category,) in enumerate(scenarios, start=1)]
    return {"meta": {"seed": seed, "count": count, "note": "All made up. The hidden answers are for scoring only."},
            "scenarios": result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()
    data = build(args.count, args.seed)
    out = Path(args.out) if args.out else OUTPUT_DIR / f"scenarios_seed{args.seed}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    counts = {}
    for item in data["scenarios"]:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    print(f"Wrote {len(data['scenarios'])} scenarios to {out}")
    for name, number in counts.items():
        print(f"  {name:20} {number}")


if __name__ == "__main__":
    main()
