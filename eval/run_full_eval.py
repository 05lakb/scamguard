"""Runs the whole safety check (behaviour + message reading + decision) on all 200 cases.

Run it with:  python eval/run_full_eval.py [--data scenarios_hard.json]
Messages already read are taken from the saved answers, so this only calls
Gemini for messages it has not seen before.
"""

import argparse
import json
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="scenarios_hard.json")
    args = parser.parse_args()

    customers = json.loads((ROOT / "data" / "customers.json").read_text(encoding="utf-8"))
    scenarios = json.loads((ROOT / "data" / args.data).read_text(encoding="utf-8"))
    by_id = {customer["id"]: customer for customer in customers}
    scam_types = load_scam_types()

    results = []
    decisions = {}
    for case in scenarios:
        reading = None
        if case["customer_evidence"]:
            reading = read_message(case["customer_evidence"], scam_types)
            if not reading["from_cache"]:
                time.sleep(PAUSE_SECONDS)
        outcome = decide(case["payment"], by_id[case["customer_id"]], reading, scam_types)
        decisions[case["id"]] = outcome
        results.append((case, outcome["action"]))

    summary = summarise(results, by_id)
    print(json.dumps(summary, indent=2))

    # Cases worth a closer look.
    missed = [c["id"] for c, a in results if c["label"] == "scam" and a == "allow"]
    under = [c["id"] for c, a in results if c["label"] == "scam" and c["expected_action"] == "hold" and a == "warn"]
    wrongly_held = [c["id"] for c, a in results if c["label"] == "legit" and a == "hold"]
    print("\nScams let through:", missed or "none")
    print("High-danger scams only warned (not held):", under or "none")
    print("Normal payments wrongly held:", wrongly_held or "none")

    out = ROOT / "eval" / "output"
    out.mkdir(parents=True, exist_ok=True)
    (out / "full_eval.json").write_text(json.dumps({"summary": summary, "decisions": decisions}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
