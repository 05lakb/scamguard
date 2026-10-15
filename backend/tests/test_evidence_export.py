import json
from copy import deepcopy
from pathlib import Path

import pytest

from eval.export_evidence import evaluate
from eval.metrics import summarise

ROOT = Path(__file__).resolve().parents[2]


def fixtures():
    return (json.loads((ROOT / "data/scenarios.json").read_text(encoding="utf-8")),
            json.loads((ROOT / "data/customers.json").read_text(encoding="utf-8")))


def test_report_matches_existing_evaluator_and_case_records():
    scenarios, customers = fixtures()
    report = evaluate(scenarios, customers)
    pairs = [(case, row["action"]) for case, row in zip(scenarios, report["cases"])]
    existing = summarise(pairs, {c["id"]: c for c in customers})
    for new, old in [("scams_flagged", "scams_caught"),
                     ("genuine_friction", "normal_payments_with_any_friction"),
                     ("expected_matches", "overall_correct")]:
        metric = report["metrics"][new]
        assert round(metric["numerator"] / metric["denominator"], 3) == existing[old]
    assert report["included_cases"] == existing["cases"]
    assert report["metrics"]["expected_matches"]["numerator"] == sum(r["matches_expected"] for r in report["cases"] if r["included"])


def test_low_confidence_and_empty_groups_are_not_counted_as_success():
    scenarios, customers = fixtures()
    cases = deepcopy(scenarios[:2])
    for case in cases:
        case["ground_truth_confidence"] = "low"
    report = evaluate(cases, customers)
    assert report["excluded_cases"] == 2
    assert report["included_cases"] == 0
    assert all(m == {"numerator": 0, "denominator": 0, "percent": None} for m in report["metrics"].values())
    assert len(report["cases"]) == 2


def test_duplicate_cases_are_rejected():
    scenarios, customers = fixtures()
    with pytest.raises(ValueError, match="Duplicate case IDs"):
        evaluate([scenarios[0], scenarios[0]], customers)
