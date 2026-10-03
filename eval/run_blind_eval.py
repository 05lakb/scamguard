"""Runs the full safety check on a blind test set written by someone else.

Run it with:  python eval/run_blind_eval.py "data/randomdummy data.txt"
"Blind" means we did not see these cases while building or tuning the checks,
so the score is a fairer guide than our own benchmark. Run it once and report it.
"""

import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval"))

from backend.risk.decision import decide  # noqa: E402
from backend.risk.evidence import load_scam_types, read_message  # noqa: E402
from metrics import summarise  # noqa: E402

PAUSE_SECONDS = 5


def load_cases(path):
    """Read the file and turn each entry into the shape our checks expect."""
    raw = Path(path).read_text(encoding="utf-8-sig").strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
    items = json.loads(raw)

    customers = {}
    cases = []
    for item in items:
        customer_id = "K-" + item["id"]
        customers[customer_id] = {
            "id": customer_id,
            "segment": item["customer_profile"]["segment"],
            "typical_amount": item["customer_profile"]["typical_amount"],
        }
        is_scam = item["label"] == "scam"
        cases.append({
            "id": item["id"],
            "customer_id": customer_id,
            "payment": item["payment"],
            "customer_evidence": item["customer_evidence"],
            "label": item["label"],
            "typology": item["typology"],
            "severity": "high" if is_scam else "none",
            "expected_action": item["expected_action"],
            "acceptable_actions": [item["expected_action"]],
            "has_injection": bool(item.get("has_injection")),
            "why": item["why"],
        })
    return customers, cases


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "data/randomdummy data.txt"
    customers, cases = load_cases(ROOT / path)
    scam_types = load_scam_types()

    results = []
    decisions = {}
    for case in cases:
        reading = None
        if case["customer_evidence"]:
            reading = read_message(case["customer_evidence"], scam_types)
            if not reading["from_cache"]:
                time.sleep(PAUSE_SECONDS)
        outcome = decide(case["payment"], customers[case["customer_id"]], reading, scam_types)
        decisions[case["id"]] = outcome
        results.append((case, outcome["action"]))

    summary = summarise(results, customers)
    print(json.dumps(summary, indent=2))

    print("\nCases where the decision differs from the expected one:")
    for case, action in results:
        if action != case["expected_action"]:
            score = decisions[case["id"]]["score"]
            print(f"  {case['id']} {case['label']:5} expected={case['expected_action']:5} got={action:5} score={score:3}  {case['why']}")

    out = ROOT / "eval" / "output"
    out.mkdir(parents=True, exist_ok=True)
    (out / "blind_eval.json").write_text(json.dumps({"summary": summary, "decisions": decisions}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
