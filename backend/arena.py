"""The live red-team run that visitors can watch on the website.

A simulated customer plays made-up scenarios against the guard, inside our own service. The guard
never sees the answer key. Each result is sent to the page the moment it is decided.
"""

import random
from collections import namedtuple

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


def pick_scenarios(count, seed):
    """Choose a balanced handful from a freshly made pool."""
    pool = factory.build(90, seed)["scenarios"]
    by_kind = {kind: [item for item in pool if item["category"] == kind] for kind in KIND_ORDER}
    chosen = []
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
    return shown


def stream_run(count, seed, writer, reader, asker, scam_types):
    """Yield one event at a time: the start, a notice before each scenario, each result, then the summary."""
    scenarios = pick_scenarios(count, seed)
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
