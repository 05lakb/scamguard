from eval.run_paired_eval import latency, request_for, summarise, validate_cases
import pytest


def row(label, action, expected="hold", included=True):
    return {"label": label, "included": included, "acceptable_actions": [expected],
            "rules": {"action": "allow"}, "combined": {"action": action}}


def test_questions_are_pending_not_caught_and_failures_remain_in_denominator():
    report = summarise([row("scam", "hold"), row("scam", "ask"), row("scam", "error"),
                        row("legit", "ask", "allow"), row("legit", "error", "allow"),
                        row("scam", "hold", included=False)])
    assert report["combined"]["scams_flagged"] == {"numerator": 1, "denominator": 3, "percent": 33.3}
    assert report["combined"]["genuine_friction"]["numerator"] == 1
    assert report["combined"]["expected_matches"]["denominator"] == 5
    assert report["errors"] == 2
    assert report["excluded_cases"] == 1


def test_ground_truth_never_enters_request():
    case = {"payment": {}, "customer_profile": {}, "customer_evidence": "hello",
            "label": "scam", "why": "hidden", "expected_action": "hold", "typology": "hidden"}
    assert request_for(case) == {"payment": {}, "customer": {}, "message": "hello"}


def test_empty_groups_and_nearest_rank_latency():
    assert summarise([])["combined"]["scams_flagged"]["percent"] is None
    assert latency([])["p95_ms"] is None
    assert latency(list(range(1, 21))) == {"n": 20, "median_ms": 10, "p95_ms": 19, "max_ms": 20}


def test_rejects_duplicates_before_calling_model():
    with pytest.raises(ValueError, match="duplicate"):
        validate_cases([{"id": "x"}, {"id": "x"}])
