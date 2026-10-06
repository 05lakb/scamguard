"""Runs the testing agent against your own deployed site. Run it in Cloud Shell, not on a laptop.

Example (in Cloud Shell, from the repo folder):
  export USE_VERTEX=1 GOOGLE_CLOUD_PROJECT=your-project-id VERTEX_LOCATION=global LMG_DISK_CACHE=0
  python3 -m redteam.run --url https://your-service-xxxx.run.app --suite fixed --dry-run
  python3 -m redteam.run --url https://your-service-xxxx.run.app --suite fixed
  python3 -m redteam.run --url https://your-service-xxxx.run.app --suite adaptive --seeds 4

It refuses to test any address that does not end in .run.app, and it stops by itself when
one of its limits (requests, minutes, or its own Gemini calls) is reached.
"""

import argparse
import json
import sys
from pathlib import Path

from backend import gemini_client
from backend.risk.evidence import load_scam_types
from redteam import attacks
from redteam.attacker import BENIGN_SEEDS, SCAM_SEEDS, run_benign_seed, run_scam_seed
from redteam.budget import Budget, BudgetExceeded
from redteam.report import judge, render_markdown, render_transcript, summarise
from redteam.site_client import SiteClient

OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def plan(suite, seeds, pace):
    """Worst-case size of a run, worked out before anything is sent."""
    requests = attacker_calls = server_calls = 0
    if suite in ("fixed", "all"):
        fixed = (len(attacks.injection_attacks()) + len(attacks.validation_attacks()) + len(attacks.FALSE_ALARM_CASES) * 2
                 + len(attacks.split_payment_sequence()) + 1 + attacks.RATE_LIMIT_BURST)
        requests += fixed
        server_calls += 70
    if suite in ("adaptive", "all"):
        benign = max(1, seeds // 2)
        requests += seeds * 6 + benign * 2
        attacker_calls += seeds * 6 + benign * 2
        server_calls += seeds * 9 + benign * 3
    minutes = (requests * pace) / 60
    return {"requests": requests, "attacker_calls": attacker_calls, "server_calls": server_calls, "minutes": round(minutes, 1)}


def run_fixed(site, results, extras):
    """Run every fixed attack. Results are added to the lists as they come, so a stop keeps them."""
    leaked_keys = set()

    for attack in attacks.injection_attacks() + attacks.validation_attacks():
        if attack.raw is not None:
            reply = site.post_raw(attack.raw, attack.content_type)
        else:
            reply = site.assess(attack.payload)
        passed = judge(attack.expect, reply)
        body = reply.body or {}
        if reply.status == 200:
            leaked_keys.update(key for key in ("score", "audit", "reasons") if key in body)
            if leaked_keys:
                extras["leaks"] = ("Every answer includes: " + ", ".join(sorted(leaked_keys)) +
                                   ". This helps the demo explain itself, but a real bank would only send the action and a "
                                   "warning to the customer's screen, because an attacker can use scores and reasons to tune attempts.")
        results.append({"id": attack.id, "group": attack.group, "description": attack.description,
                        "status": reply.status, "action": body.get("action"), "passed": passed})
        print(f"  {attack.group:10} {attack.id:28} status={reply.status} action={body.get('action')} passed={passed}")

    # Genuine payments that sound scary.
    for name, note, payment in attacks.FALSE_ALARM_CASES:
        reply = site.assess({"payment": payment, "customer": attacks.CUSTOMER, "message": note or None})
        body = reply.body or {}
        if body.get("action") == "ask":  # one honest reply, so questions alone do not count as a failure
            reply = site.assess({"payment": payment, "customer": attacks.CUSTOMER, "message": note or None,
                                 "questions": body.get("questions"),
                                 "answer": "It is genuine. I know the person and have checked."})
            body = reply.body or {}
        results.append({"id": f"genuine_{name}", "group": "genuine", "description": f"Genuine payment: {name}",
                        "status": reply.status, "action": body.get("action"), "passed": judge("allow", reply)})
        print(f"  genuine    {name:28} status={reply.status} action={body.get('action')}")

    # The same payee, paid again and again.
    actions = extras.setdefault("split_actions", [])
    for step in attacks.split_payment_sequence():
        reply = site.assess(step)
        actions.append((reply.body or {}).get("action", f"http{reply.status}"))
    results.append({"id": "split_payments", "group": "split", "description": "Eight payments to one payee in a day",
                    "status": 200, "action": actions[-1], "passed": actions[-1] != "allow"})
    print(f"  split      actions: {actions}")

    # The speed-limit probe goes last, because it uses up the visitor's allowance.
    fast = SiteClient(site.base, pace_seconds=0.2, budget=site.budget)
    codes = []
    body = {"payment": attacks.calm_payment(), "customer": attacks.CUSTOMER, "message": None}
    try:
        for _ in range(attacks.RATE_LIMIT_BURST):
            codes.append(fast.assess(body, retry_on_limit=False).status)
    finally:
        if codes:
            extras["rate_limit"] = (f"{len(codes)} quick requests gave {codes.count(200)} accepted, {codes.count(429)} slowed down, "
                                    f"{sum(1 for c in codes if c >= 500)} server errors.")
            results.append({"id": "rate_limit", "group": "speed_limit", "description": "Burst of quick requests",
                            "status": 429 if 429 in codes else 200, "action": None,
                            "passed": 429 in codes and not any(c >= 500 for c in codes)})


def run_adaptive(site, seeds, records, budget):
    def writer(prompt):
        budget.check_model_call()
        return gemini_client.ask(prompt, model=gemini_client.SMART_MODEL)

    types = {item["id"]: item for item in load_scam_types()}
    for seed in SCAM_SEEDS[:seeds]:
        record = run_scam_seed(site, writer, seed, types[seed["typology"]])
        records.append(record)
        outcome = f"got through on try {record['evaded_on_try']}" if record["evaded"] else "stopped"
        print(f"  scam {seed['typology']:20} {outcome}")
    for seed in BENIGN_SEEDS[:max(1, seeds // 2)]:
        record = run_benign_seed(site, writer, seed)
        records.append(record)
        print(f"  genuine {seed['story'][:40]:42} {'friction' if record['false_alarm'] else 'allowed'}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--allow-host", default=None, help="one extra host name you own, if not *.run.app")
    parser.add_argument("--suite", choices=["fixed", "adaptive", "all"], default="all")
    parser.add_argument("--seeds", type=int, default=8, help="how many scam seeds for the adaptive attacker (max 8)")
    parser.add_argument("--pace", type=float, default=6.0, help="seconds between requests")
    parser.add_argument("--max-requests", type=int, default=150, help="hard cap on requests to the site")
    parser.add_argument("--max-minutes", type=float, default=25, help="hard cap on running time")
    parser.add_argument("--max-model-calls", type=int, default=80, help="hard cap on the tester's own Gemini calls")
    parser.add_argument("--dry-run", action="store_true", help="show the plan and stop")
    parser.add_argument("--yes", action="store_true", help="start without asking for confirmation")
    args = parser.parse_args()

    seeds = max(1, min(args.seeds, len(SCAM_SEEDS)))
    worst = plan(args.suite, seeds, args.pace)
    print("Plan (worst case):")
    print(f"  requests to the site:        up to {worst['requests']}   (cap {args.max_requests})")
    print(f"  tester Gemini calls:         up to {worst['attacker_calls']}   (cap {args.max_model_calls})")
    print(f"  Gemini calls inside the site: up to about {worst['server_calls']}")
    print(f"  time:                        about {worst['minutes']} minutes   (cap {args.max_minutes})")
    if args.dry_run:
        print("Dry run only. Nothing was sent.")
        return

    budget = Budget(args.max_requests, args.max_minutes, args.max_model_calls)
    site = SiteClient(args.url, allow_host=args.allow_host, pace_seconds=args.pace, budget=budget)
    if not args.yes:
        input("Press Enter to start, or Ctrl+C to cancel. ")

    health = site.health()
    if health.status != 200:
        print(f"The site did not answer its health check (status {health.status}). Stopping.")
        sys.exit(1)

    notes = [f"Tested {site.base}"]
    fixed, extras, adaptive = [], {}, []
    try:
        if args.suite in ("fixed", "all"):
            print("Fixed attacks:")
            run_fixed(site, fixed, extras)
        if args.suite in ("adaptive", "all"):
            print("Adaptive attacker:")
            run_adaptive(site, seeds, adaptive, budget)
    except BudgetExceeded as stop:
        notes.append(f"The run stopped early because {stop}. The results below are partial.")
        print(f"\nSTOPPED EARLY: {stop}")
    except KeyboardInterrupt:
        notes.append("The run was cancelled by hand. The results below are partial.")

    notes.append(f"Used: {budget.used()}")
    summary = summarise(fixed, adaptive, notes)
    report = render_markdown(summary, adaptive, fixed, extras)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "report.md").write_text(report, encoding="utf-8")
    (OUTPUT_DIR / "transcript.md").write_text(render_transcript(adaptive, fixed), encoding="utf-8")
    (OUTPUT_DIR / "results.json").write_text(json.dumps({"summary": summary, "adaptive": adaptive, "fixed": fixed}, indent=2), encoding="utf-8")
    print("\n" + report)
    print(f"Used: {budget.used()}. Saved in redteam/output/: report.md (summary) and transcript.md (every exchange).")


if __name__ == "__main__":
    main()
