"""Runs the behaviour check alone on all 200 test cases and prints the scores.

Run it with:  python eval/run_behaviour_eval.py
This makes no outside calls, so it is instant and free.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval"))

from backend.risk.behaviour import check_behaviour  # noqa: E402
from metrics import summarise  # noqa: E402


def main():
    customers = json.loads((ROOT / "data" / "customers.json").read_text(encoding="utf-8"))
    scenarios = json.loads((ROOT / "data" / "scenarios.json").read_text(encoding="utf-8"))
    by_id = {customer["id"]: customer for customer in customers}

    results = []
    for case in scenarios:
        outcome = check_behaviour(case["payment"], by_id[case["customer_id"]])
        results.append((case, outcome["suggestion"]))

    print(json.dumps(summarise(results, by_id), indent=2))


if __name__ == "__main__":
    main()
