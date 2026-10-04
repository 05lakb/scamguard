"""Runs the whole flow, including the follow-up question, on a test set that has replies.

Run it with:  python eval/run_flow_eval.py "data/some_file.json" [--label stress]
Round 1: the note is judged. If the system asks questions, the test supplies the
customer's prepared reply (customer_reply_if_asked) and the system decides again.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "eval"))

from backend.risk.evidence import load_scam_types  # noqa: E402
from backend.service import assess  # noqa: E402
from metrics import summarise  # noqa: E402

PAUSE_SECONDS = 4


def load(path):
    raw = Path(path).read_text(encoding="utf-8-sig").strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
    customers, cases = {}, []
    for item in json.loads(raw):
        cid = "K-" + item["id"]
        customers[cid] = {"id": cid, "segment": item["customer_profile"]["segment"],
                          "typical_amount": item["customer_profile"]["typical_amount"]}
        expected = item["expected_action"]
        case = {
            "id": item["id"], "customer_id": cid, "payment": item["payment"],
            "customer_evidence": item["customer_evidence"], "reply": item.get("customer_reply_if_asked"),
            "label": item["label"], "typology": item["typology"],
            "severity": "high" if item["label"] == "scam" else "none",
            "expected_action": expected,
            "acceptable_actions": ["warn", "hold"] if expected == "warn" else [expected],
            "has_injection": bool(item.get("has_injection")), "why": item.get("why", ""),
        }
        for hidden in ("difficulty", "case_category", "ground_truth_confidence"):
            if hidden in item:
                case[hidden] = item[hidden]
        cases.append(case)
    return customers, cases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--label", default="flow")
    args = parser.parse_args()

    customers, cases = load(ROOT / args.path)
    scam_types = load_scam_types()

    results, details = [], {}
    asked = 0
    for case in cases:
        customer = customers[case["customer_id"]]
        first = assess(case["payment"], customer, case["customer_evidence"], scam_types=scam_types)
        final = first
        if first["action"] == "ask":
            asked += 1
            final = assess(case["payment"], customer, case["customer_evidence"], questions=first["questions"],
                           answer=case["reply"] or "I would rather not say.", scam_types=scam_types)
            time.sleep(PAUSE_SECONDS)
        details[case["id"]] = {"first": first["action"], "final": final["action"], "score": final["score"]}
        results.append((case, final["action"]))

    summary = summarise(results, customers)
    summary["asked_a_question"] = f"{asked}/{len(cases)}"
    print(json.dumps(summary, indent=2))

    print("\nCases where the final decision differs from the expected one:")
    for case, action in results:
        if action not in case["acceptable_actions"]:
            d = details[case["id"]]
            print(f"  {case['id']} {case['label']:5} expected={case['expected_action']:5} first={d['first']:5} final={action:5} "
                  f"note={case['customer_evidence']!r}")

    out = ROOT / "eval" / "output"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{args.label}_eval.json").write_text(json.dumps({"summary": summary, "details": details}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
