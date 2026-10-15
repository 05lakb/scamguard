"""Compare payment rules with the actual first-round API on identical synthetic cases.

Run: .venv/Scripts/python.exe eval/run_paired_eval.py --live
Makes fresh paid Gemini calls; does not change the running server or its caches.
Labels stay in the evaluator. This existing dataset is NOT an independent holdout.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def request_for(case):
    """Allowlist inputs; expected actions, labels and rationales never reach the API."""
    return {"payment": case["payment"], "customer": case["customer_profile"],
            "message": case.get("customer_evidence"),
            **({"network": case["network"]} if case.get("network") else {})}


def validate_cases(cases):
    from backend.app import AssessIn
    if not cases or len({c["id"] for c in cases}) != len(cases):
        raise ValueError("Empty dataset or duplicate case IDs")
    for case in cases:
        if case["label"] not in ("scam", "legit"):
            raise ValueError("Unknown label")
        accepted = case.get("acceptable_actions", [case["expected_action"]])
        if not accepted or any(a not in ("allow", "warn", "hold", "ask") for a in accepted):
            raise ValueError("Invalid expected actions")
        AssessIn.model_validate(request_for(case))


def rate(rows, predicate):
    hits = sum(bool(predicate(r)) for r in rows)
    return {"numerator": hits, "denominator": len(rows),
            "percent": round(100 * hits / len(rows), 1) if rows else None}


def metrics(records, arm):
    rows = [r for r in records if r["included"]]
    scams = [r for r in rows if r["label"] == "scam"]
    genuine = [r for r in rows if r["label"] == "legit"]
    return {
        "scams_flagged": rate(scams, lambda r: r[arm]["action"] in ("warn", "hold")),
        "genuine_friction": rate(genuine, lambda r: r[arm]["action"] in ("warn", "hold", "ask")),
        "expected_matches": rate(rows, lambda r: r[arm]["action"] in r["acceptable_actions"]),
        "questions": rate(rows, lambda r: r[arm]["action"] == "ask"),
        "no_decision": rate(rows, lambda r: r[arm]["action"] == "error"),
    }


def latency(values):
    values = sorted(values)
    return {"n": len(values), "median_ms": round(statistics.median(values)) if values else None,
            "p95_ms": values[math.ceil(.95 * len(values)) - 1] if values else None,
            "max_ms": max(values) if values else None}


def summarise(records):
    included = [r for r in records if r["included"]]
    outputs = [r["combined"] for r in records]
    return {
        "total_cases": len(records), "included_cases": len(included),
        "excluded_cases": len(records) - len(included),
        "rules": metrics(records, "rules"), "combined": metrics(records, "combined"),
        "execution_modes": dict(Counter(r.get("execution", {}).get("message_mode", "error") for r in outputs)),
        "fallbacks": sum(bool(r.get("execution", {}).get("fallback_reason")) for r in outputs),
        "errors": sum(r["action"] == "error" for r in outputs),
        "backend_latency": latency([r["execution"]["duration_ms"] for r in outputs if r.get("execution")]),
        "fresh_backend_latency": latency([r["execution"]["duration_ms"] for r in outputs
                                          if r.get("execution", {}).get("message_mode") == "gemini_live"]),
        "changed_actions": sum(r["rules"]["action"] != r["combined"]["action"] for r in included),
    }


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Required acknowledgement of external model calls")
    parser.add_argument("--data", default="data/blind_test_v1.json")
    parser.add_argument("--interval-seconds", type=float, default=15, help="Minimum spacing between case starts (0-60 seconds)")
    args = parser.parse_args()
    if not args.live:
        parser.error("Use --live to run fresh Gemini calls on synthetic inputs.")
    if not 0 <= args.interval_seconds <= 60:
        parser.error("--interval-seconds must be between 0 and 60")
    # Isolated evaluator process only. A 50-case run must not hit the public visitor limit.
    os.environ["LMG_DISK_CACHE"] = "0"
    os.environ["LMG_RATE_PER_MINUTE"] = "600"
    os.environ["LMG_RATE_PER_HOUR"] = "600"
    from fastapi.testclient import TestClient
    from backend import app as app_module, gemini_client
    from backend.risk import evidence, clarify
    from backend.risk.behaviour import check_behaviour
    logging.disable(logging.CRITICAL)  # Never publish provider bodies or credentials.
    dataset = ROOT / args.data
    cases = json.loads(dataset.read_text(encoding="utf-8-sig"))
    validate_cases(cases)  # Fail before paying for any model calls.
    started = datetime.now(timezone.utc)
    run_id = started.strftime("paired-%Y%m%dT%H%M%SZ")
    run_dir = ROOT / "eval/output" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    names = [args.data, "data/typologies.json", "backend/app.py", "backend/service.py",
             "backend/gemini_client.py", "backend/risk/behaviour.py", "backend/risk/decision.py",
             "backend/risk/evidence.py", "backend/risk/clarify.py", "backend/risk/network.py", "backend/risk/corroboration.py",
             "eval/run_paired_eval.py"]
    fingerprints = {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in names}
    records = []
    last_start = None
    with TestClient(app_module.create_app()) as client:
        for case in cases:
            if last_start is not None:
                time.sleep(max(0, args.interval_seconds - (time.perf_counter() - last_start)))
            last_start = time.perf_counter()
            evidence._memory_cache.clear()
            clarify._memory_questions.clear()
            payload = request_for(case)
            rules = check_behaviour(payload["payment"], payload["customer"])
            begin = time.perf_counter()
            try:
                response = client.post("/api/assess/stream", json=payload)
                response.raise_for_status()
                events = [json.loads(line) for line in response.text.splitlines() if line]
                finals = [e for e in events if e["type"] == "result"]
                if len(finals) != 1:
                    raise ValueError("Missing or duplicated result")
                combined = finals[0]["result"]
                if any(e.get("request_id") != combined["execution"]["request_id"] for e in events):
                    raise ValueError("Request IDs differ")
                if combined["execution"]["message_mode"] in ("gemini_cached", "injected_reader"):
                    raise ValueError("Expected a fresh production reader")
            except Exception:
                combined = {"action": "error", "error": "assessment_failed"}
                events = []
            record = {
                "id": case["id"], "label": case["label"],
                "included": case.get("ground_truth_confidence") != "low",
                "acceptable_actions": case.get("acceptable_actions", [case["expected_action"]]),
                "input": payload, "rules": {"action": rules["suggestion"], "score": rules["score"]},
                "combined": combined, "events": events,
                "wall_duration_ms": round((time.perf_counter() - begin) * 1000),
            }
            records.append(record)
            # Preserve failed cases too; no cherry-picking or automatic retry of failures.
            with (run_dir / "cases.jsonl").open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(f"{len(records)}/{len(cases)} {case['id']}: rules={rules['suggestion']} combined={combined['action']} mode={combined.get('execution', {}).get('message_mode', 'error')}", flush=True)
    if fingerprints != {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in names}:
        raise RuntimeError("Sources changed during evaluation; partial run retained but not published")
    report = {
        "schema_version": 1, "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "started_at": started.isoformat(timespec="seconds"),
        "dataset": args.data, "model": gemini_client.FAST_MODEL,
        "provider": "Vertex AI" if gemini_client.USE_VERTEX else "Gemini Developer API",
        "prompt_version": evidence.PROMPT_VERSION,
        "minimum_case_interval_seconds": args.interval_seconds,
        "scope": "Paired first-round development benchmark on existing synthetic cases. Not an independent holdout or a real-world accuracy estimate.",
        "method": "Same inputs for both arms. Payment rules versus complete first-round API (Gemini, message safeguards and decision rules). No network supplied in the default dataset. No labels, expected actions or rationales sent to the API. No answers fabricated for follow-up questions. Fresh model calls; caches isolated and cleared per case. All failures retained. No tuning during this run.",
        "latency_scope": "Backend assessment time, including follow-up generation where used. Serial in-process FastAPI requests with real external Gemini calls. Excludes browser, internet delivery to the app and Cloud Run cold starts; not a load test.",
        "metric_definitions": {"scams_flagged": "Scams receiving warn or hold; ask is pending, not counted as caught.",
                               "genuine_friction": "Genuine payments receiving warn, hold or ask. API errors reported separately.",
                               "expected_matches": "Actions in the dataset's acceptable actions. Pending ask and API errors count as nonmatches unless ask was explicitly expected."},
        "command": f".venv/Scripts/python.exe eval/run_paired_eval.py --live --data {args.data} --interval-seconds {args.interval_seconds:g}",
        "source_sha256": fingerprints, **summarise(records), "cases": records,
    }
    atomic_json(run_dir / "report.json", report)
    atomic_json(ROOT / "web/src/data/pairedEvidence.json", report)
    print(json.dumps({k: v for k, v in report.items() if k not in ("cases", "source_sha256")}, indent=2))


if __name__ == "__main__":
    main()
