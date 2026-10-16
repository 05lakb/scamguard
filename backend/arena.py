"""The live red-team run that visitors can watch on the website.

A simulated customer plays made-up scenarios against the guard, inside our own service. The guard
never sees the answer key. Each result is sent to the page the moment it is decided.
"""

import json
import random
from collections import namedtuple
from datetime import date
from pathlib import Path

from backend.service import assess
from redteam import customer_agent, factory
from redteam.report import summarise_scenarios

Reply = namedtuple("Reply", "status body text")

# One of each kind first, so a short run is a fair mix of scams and genuine customers.
KIND_ORDER = ["obvious_scam", "quiet_scam", "mixed_signal_legit", "injection", "split_payments",
              "obvious_legit", "coached_victim", "refusal", "contradiction"]


class LocalSite:
    """Lets the simulated customer talk to the guard directly, without a web request."""

    def __init__(self, reader, asker, scam_types):
        self.reader, self.asker, self.scam_types = reader, asker, scam_types

    def assess(self, body, retry_on_limit=True):
        customer = {"id": "arena", **body["customer"]}
        outcome = assess(body["payment"], customer, body.get("message"), questions=body.get("questions"),
                         answer=body.get("answer"), reader=self.reader, asker=self.asker, scam_types=self.scam_types)
        return Reply(200, outcome, "")


INTEL_FILE = Path(__file__).resolve().parents[1] / "data" / "intel_scenarios_dev.json"

# Where the scam cases built from public advice pages go in a short run, among our own kinds.
# "real" stands for the next one of those cases. Only the dev half is ever kept here.
REAL_SLOTS = ["real", "mixed_signal_legit", "real", "obvious_legit", "real", "injection", "real", "coached_victim",
              "split_payments", "refusal", "contradiction"]


def load_public_report_scenarios():
    """Made-up scam cases shaped by public advice pages. Returns an empty list if the file is missing."""
    try:
        data = json.loads(INTEL_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [item for item in data.get("scenarios", []) if item.get("split") == "dev" and item.get("reference")]


def pick_scenarios(count, seed):
    """Choose a balanced handful: scam cases from public advice pages, plus our own genuine and trick cases."""
    pool = factory.build(90, seed)["scenarios"]
    by_kind = {kind: [item for item in pool if item["category"] == kind] for kind in KIND_ORDER}
    real = load_public_report_scenarios()
    random.Random(seed).shuffle(real)
    chosen = []
    if real:
        used = {kind: 0 for kind in KIND_ORDER}
        for slot in REAL_SLOTS:
            if len(chosen) >= count:
                break
            if slot == "real":
                if real:
                    chosen.append(real.pop())
            elif len(by_kind[slot]) > used[slot]:
                chosen.append(by_kind[slot][used[slot]])
                used[slot] += 1
        # If the count is bigger than the slots above, fill up from our own kinds.
        leftovers = [item for kind in KIND_ORDER for item in by_kind[kind][used[kind]:] if kind != "coached_victim"]
        random.Random(seed + 1).shuffle(leftovers)
        chosen.extend(leftovers[:max(0, count - len(chosen))])
    else:
        round_number = 0
        while len(chosen) < count and round_number < 3:
            for kind in KIND_ORDER:
                if len(chosen) < count and len(by_kind[kind]) > round_number:
                    if kind == "coached_victim" and round_number > 0:
                        continue  # at most one of the hardest kind in a short live run
                    chosen.append(by_kind[kind][round_number])
            round_number += 1
    random.Random(seed).shuffle(chosen)
    return chosen[:count]


def public(record, scenario):
    """What the page may show about a scenario once the guard has decided."""
    payment = scenario["payment"]
    shown = {key: record.get(key) for key in (
        "id", "category", "label", "difficulty", "note", "first_action", "questions", "answer",
        "final_action", "score", "reasons", "ok", "expected_actions", "error", "degraded")}
    shown.update(amount=payment["amount"], currency=payment["currency"], payee=payment["payee_name"],
                 segment=scenario["customer"]["segment"])
    reference = scenario.get("reference")
    if reference:  # which public page this made-up case was modelled on, so it can be credited
        shown["reference"] = {key: reference.get(key) for key in ("name", "title", "url")}
    return shown


def custom_scenario(story, role, coached, customer, payment):
    """Build one scenario from a visitor's own description. The visitor's story is what the simulated customer believes."""
    genuine = role == "genuine"
    full_payment = {"currency": "USD", "channel": "web", "timestamp": f"{date.today().isoformat()}T14:30:00", **payment}
    return {
        "id": "CUSTOM", "label": "legit" if genuine else "scam", "category": "custom", "difficulty": "custom",
        "customer": customer, "payment": full_payment,
        "persona": {"role": "genuine" if genuine else "victim", "voice": "plain and brief, like a normal message to a bank",
                    "coached": bool(coached) and not genuine, "refuses": False, "contradicts": False,
                    "injection": None, "writes_note": True, "facts": story},
        "expected_actions": ["allow", "warn"] if genuine else ["warn", "hold"],
    }


def stream_run(count, seed, writer, reader, asker, scam_types):
    """Yield one event at a time: the start, a notice before each scenario, each result, then the summary."""
    yield from stream_scenarios(pick_scenarios(count, seed), writer, reader, asker, scam_types)


def stream_scenarios(scenarios, writer, reader, asker, scam_types):
    """Play the given scenarios one at a time and yield the same events as a live run."""
    yield {"type": "start", "total": len(scenarios)}
    site = LocalSite(reader, asker, scam_types)
    records = []
    for number, scenario in enumerate(scenarios, start=1):
        yield {"type": "working", "number": number, "total": len(scenarios), "category": scenario["category"]}
        try:
            record = customer_agent.play(site, writer, scenario)
        except Exception as error:  # one failed scenario must not end the run
            record = {"id": scenario["id"], "label": scenario["label"], "category": scenario["category"],
                      "difficulty": scenario["difficulty"], "expected_actions": scenario["expected_actions"],
                      "error": f"This scenario could not be played ({type(error).__name__})."}
        records.append(record)
        yield {"type": "scenario", "number": number, "total": len(scenarios), "record": public(record, scenario)}
    summary = summarise_scenarios(records)
    yield {"type": "done", "summary": {
        "scams_flagged": list(summary["scams_flagged"]), "genuine_with_friction": list(summary["genuine_with_friction"]),
        "overall_correct": list(summary["overall_correct"]), "errors": summary["errors"],
        "unreliable": summary["unreliable"], "by_category": {k: list(v) for k, v in summary["by_category"].items()}}}
