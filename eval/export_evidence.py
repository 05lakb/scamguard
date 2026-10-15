"""Export a reproducible, offline payment-rules benchmark for the Evidence tab.

Run from the repository: .venv/Scripts/python.exe eval/export_evidence.py
No model calls, credentials, or customer messages are included in the report.
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.risk.behaviour import check_behaviour


def evaluate(scenarios, customers):
    by_id = {customer["id"]: customer for customer in customers}
    if len(by_id) != len(customers):
        raise ValueError("Duplicate customer IDs")
    if len({case["id"] for case in scenarios}) != len(scenarios):
        raise ValueError("Duplicate case IDs")
    records = []
    for case in scenarios:
        if case["label"] not in ("scam", "legit"):
            raise ValueError("Unknown case label")
        outcome = check_behaviour(case["payment"], by_id[case["customer_id"]])
        records.append({
            "id": case["id"], "label": case["label"],
            "included": case.get("ground_truth_confidence") != "low",
            "action": outcome["suggestion"], "score": outcome["score"],
            "acceptable_actions": case["acceptable_actions"],
            "matches_expected": outcome["suggestion"] in case["acceptable_actions"],
        })
    included = [r for r in records if r["included"]]
    scams = [r for r in included if r["label"] == "scam"]
    genuine = [r for r in included if r["label"] == "legit"]
    def metric(rows, predicate):
        numerator = sum(bool(predicate(row)) for row in rows)
        denominator = len(rows)
        return {"numerator": numerator, "denominator": denominator,
                "percent": round(100 * numerator / denominator, 1) if denominator else None}
    return {
        "total_cases": len(records), "included_cases": len(included),
        "excluded_cases": len(records) - len(included),
        "metrics": {
            "scams_flagged": metric(scams, lambda r: r["action"] in ("warn", "hold")),
            "genuine_friction": metric(genuine, lambda r: r["action"] != "allow"),
            "expected_matches": metric(included, lambda r: r["matches_expected"]),
        },
        "cases": records,
    }


def main():
    files = ["data/scenarios.json", "data/customers.json",
             "backend/risk/behaviour.py", "eval/export_evidence.py"]
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": "Synthetic payment-rules baseline only; no Gemini, MuleNet or full-system assessment.",
        "command": ".venv/Scripts/python.exe eval/export_evidence.py",
        "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in files},
        **evaluate(json.loads((ROOT / files[0]).read_text(encoding="utf-8")),
                   json.loads((ROOT / files[1]).read_text(encoding="utf-8"))),
    }
    target = ROOT / "web/src/data/verifiedEvidence.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "cases"}, indent=2))


if __name__ == "__main__":
    main()
