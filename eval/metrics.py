"""Turns a list of decisions into simple, readable scores.

Each result is a pair: the test case, and the action we chose (allow, warn or hold).
"""

from collections import defaultdict


def _rate(part, whole):
    return round(part / whole, 3) if whole else None


def summarise(results, customers_by_id):
    scams = [(case, action) for case, action in results if case["label"] == "scam"]
    legit = [(case, action) for case, action in results if case["label"] == "legit"]

    caught = sum(1 for _, action in scams if action in ("warn", "hold"))
    high = [(case, action) for case, action in scams if case["severity"] == "high"]
    held_high = sum(1 for _, action in high if action == "hold")

    any_friction = sum(1 for _, action in legit if action != "allow")
    bad_friction = sum(1 for case, action in legit if action not in case["acceptable_actions"])
    wrongly_held = sum(1 for _, action in legit if action == "hold")

    correct = sum(1 for case, action in results if action in case["acceptable_actions"])

    by_type = defaultdict(lambda: [0, 0])
    for case, action in scams:
        by_type[case["typology"]][1] += 1
        by_type[case["typology"]][0] += action in ("warn", "hold")

    by_segment = defaultdict(lambda: [0, 0])
    for case, action in legit:
        segment = customers_by_id[case["customer_id"]]["segment"]
        by_segment[segment][1] += 1
        by_segment[segment][0] += action != "allow"

    silent = [(case, action) for case, action in scams if not case["customer_evidence"]]
    tricky = [(case, action) for case, action in scams if case["has_injection"]]

    return {
        "cases": len(results),
        "scams_caught": _rate(caught, len(scams)),
        "high_danger_scams_held": _rate(held_high, len(high)),
        "scams_caught_without_any_message": _rate(sum(1 for _, a in silent if a != "allow"), len(silent)),
        "scams_caught_with_trick_text": _rate(sum(1 for _, a in tricky if a != "allow"), len(tricky)),
        "normal_payments_with_any_friction": _rate(any_friction, len(legit)),
        "normal_payments_wrongly_handled": _rate(bad_friction, len(legit)),
        "normal_payments_wrongly_held": _rate(wrongly_held, len(legit)),
        "overall_correct": _rate(correct, len(results)),
        "caught_by_scam_type": {name: _rate(hit, total) for name, (hit, total) in sorted(by_type.items())},
        "friction_by_customer_type": {name: _rate(hit, total) for name, (hit, total) in sorted(by_segment.items())},
    }
