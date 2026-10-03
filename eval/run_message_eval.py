"""Runs the message reader on a small batch of test cases that have a message.

Run it with:  python eval/run_message_eval.py --batch 0 --size 20
Cases alternate between scam and normal so every batch is balanced.
Answers are saved, so running the same batch again costs nothing.
"""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.risk.evidence import load_scam_types, read_message  # noqa: E402

PAUSE_SECONDS = 5  # a short rest between calls keeps us under the free-tier speed limit
FLAG_AT = 50  # a likelihood at or above this counts as "looks like a scam"


def balanced_cases():
    scenarios = json.loads((ROOT / "data" / "scenarios.json").read_text(encoding="utf-8"))
    with_message = [case for case in scenarios if case["customer_evidence"]]
    scams = [case for case in with_message if case["label"] == "scam"]
    legit = [case for case in with_message if case["label"] == "legit"]
    mixed = []
    for index in range(max(len(scams), len(legit))):
        if index < len(scams):
            mixed.append(scams[index])
        if index < len(legit):
            mixed.append(legit[index])
    return mixed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=0)
    parser.add_argument("--size", type=int, default=20)
    args = parser.parse_args()

    cases = balanced_cases()[args.batch * args.size:(args.batch + 1) * args.size]
    scam_types = load_scam_types()

    rows = []
    for case in cases:
        reading = read_message(case["customer_evidence"], scam_types)
        flagged = reading["scam_likelihood"] >= FLAG_AT
        right = flagged == (case["label"] == "scam")
        rows.append((case, reading, flagged, right))
        extra = " [trick text]" if case["has_injection"] else ""
        print(f"{case['id']} {case['label']:5} likelihood={reading['scam_likelihood']:3} "
              f"type={reading['matched_typology']:<18} {'ok ' if right else 'MISS'}{extra}")
        if not reading["from_cache"]:
            time.sleep(PAUSE_SECONDS)

    scams = [row for row in rows if row[0]["label"] == "scam"]
    legit = [row for row in rows if row[0]["label"] == "legit"]
    caught = sum(1 for row in scams if row[2])
    false_alarms = sum(1 for row in legit if row[2])
    right_type = sum(1 for row in scams if row[1]["matched_typology"] == row[0]["typology"])
    tricky = [row for row in scams if row[0]["has_injection"]]
    print()
    print(f"Batch {args.batch}: {len(rows)} cases")
    print(f"  scam messages flagged:    {caught}/{len(scams)}")
    print(f"  scam type named right:    {right_type}/{len(scams)}")
    print(f"  normal messages flagged:  {false_alarms}/{len(legit)}")
    if tricky:
        print(f"  trick-text scams flagged: {sum(1 for row in tricky if row[2])}/{len(tricky)}")


if __name__ == "__main__":
    main()
