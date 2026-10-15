"""Create the small UI summary from the complete paired evaluation report.

Run after run_paired_eval.py, then rebuild web. No model calls.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from eval.run_paired_eval import atomic_json, summarise


def main():
    report = json.loads((ROOT / "web/src/data/pairedEvidence.json").read_text(encoding="utf-8"))
    computed = summarise(report["cases"])
    if any(report[key] != value for key, value in computed.items()):
        raise ValueError("Summary does not match case-level evidence")
    summary = {k: v for k, v in report.items() if k != "cases"}
    summary["pending_by_label"] = {
        label: sum(r["included"] and r["label"] == label and r["combined"]["action"] == "ask" for r in report["cases"])
        for label in ("scam", "legit")
    }
    summary["changed_cases"] = [
        {"id": r["id"], "label": r["label"], "rules": r["rules"]["action"], "combined": r["combined"]["action"]}
        for r in report["cases"] if r["included"] and r["rules"]["action"] != r["combined"]["action"]
    ]
    atomic_json(ROOT / "web/src/data/pairedEvidenceSummary.json", summary)
    print(f"Exported {report['run_id']}: {report['total_cases']} cases")


if __name__ == "__main__":
    main()
