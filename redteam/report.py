"""Turns the raw test results into a plain-language report."""

from collections import defaultdict


def judge(expect, reply):
    """Decide if the site behaved well. Returns True, False, or None if the test is not reliable."""
    body = reply.body or {}
    if expect == "reject_4xx":
        return 400 <= reply.status < 500
    if expect == "no_crash":
        return reply.status < 500
    if reply.status != 200:
        return False
    if body.get("degraded"):
        return None  # the message reader was off, so the result says nothing about the trick
    if expect == "not_allow":
        return body.get("action") != "allow"
    if expect == "allow":
        return body.get("action") == "allow"
    return None


def summarise(deterministic, adaptive, notes):
    """Boil everything down to a small dictionary of numbers and findings."""
    summary = {"notes": list(notes)}

    groups = defaultdict(lambda: {"passed": 0, "failed": 0, "unreliable": 0, "failures": []})
    for item in deterministic:
        bucket = groups[item["group"]]
        if item["passed"] is True:
            bucket["passed"] += 1
        elif item["passed"] is False:
            bucket["failed"] += 1
            bucket["failures"].append(f"{item['id']}: {item['description']} (status {item['status']}, action {item.get('action')})")
        else:
            bucket["unreliable"] += 1
    summary["fixed_attacks"] = dict(groups)

    scam = [r for r in adaptive if r["kind"] == "scam" and r["tries"] and "error" not in r["tries"][0]]
    if scam:
        first_try = sum(1 for r in scam if r["evaded_on_try"] == 1)
        any_try = sum(1 for r in scam if r["evaded"])
        by_type = {r["typology"]: ("evaded on try %s" % r["evaded_on_try"]) if r["evaded"] else "stopped" for r in scam}
        summary["scam_attempts"] = {
            "seeds": len(scam), "got_through_first_try": first_try, "got_through_within_three_tries": any_try,
            "by_scam_type": by_type,
        }
    benign = [r for r in adaptive if r["kind"] == "benign" and r["tries"] and "error" not in r["tries"][0]]
    if benign:
        alarms = sum(1 for r in benign if r["false_alarm"])
        summary["genuine_customers"] = {
            "seeds": len(benign), "given_friction": alarms,
            "friction_cases": [r["story"] for r in benign if r["false_alarm"]],
        }
    degraded = sum(1 for r in adaptive for t in r["tries"] if t.get("degraded"))
    if degraded:
        summary["notes"].append(f"{degraded} attempts were answered without the message reader (cost guard or outage), so they are not reliable.")
    return summary


def render_markdown(summary, adaptive, deterministic, extras):
    lines = ["# Last Mile Guard: red-team report", "", "All data is made up. Results are for fixing our own system.", ""]
    for note in summary["notes"]:
        lines.append(f"> {note}")
    lines.append("")

    lines.append("## Fixed attacks")
    for group, bucket in summary["fixed_attacks"].items():
        lines.append(f"- **{group}**: {bucket['passed']} passed, {bucket['failed']} failed, {bucket['unreliable']} unreliable")
        for failure in bucket["failures"]:
            lines.append(f"  - FAILED: {failure}")

    if extras.get("split_actions"):
        lines += ["", "## Same payee paid again and again", f"Actions on payments 1 to {len(extras['split_actions'])}: {', '.join(extras['split_actions'])}"]
    if extras.get("rate_limit"):
        lines += ["", "## Speed limit", f"{extras['rate_limit']}"]
    if extras.get("leaks"):
        lines += ["", "## Information the site reveals", extras["leaks"]]

    if "scam_attempts" in summary:
        s = summary["scam_attempts"]
        lines += ["", "## Coached scam victims (adaptive attacker)",
                  f"- {s['got_through_first_try']} of {s['seeds']} got through on the first try",
                  f"- {s['got_through_within_three_tries']} of {s['seeds']} got through within three tries"]
        for kind, outcome in s["by_scam_type"].items():
            lines.append(f"  - {kind}: {outcome}")
    if "genuine_customers" in summary:
        g = summary["genuine_customers"]
        lines += ["", "## Genuine customers with scary-sounding stories",
                  f"- {g['given_friction']} of {g['seeds']} were given friction (warning, question or hold)"]
        for story in g["friction_cases"]:
            lines.append(f"  - {story}")

    wins = [r for r in adaptive if r["kind"] == "scam" and r["evaded"]]
    if wins:
        lines += ["", "## How the attacker got through"]
        for r in wins:
            step = r["tries"][-1]
            lines.append(f"### {r['typology']} (try {r['evaded_on_try']})")
            lines.append(f"- Note: {step['note']}")
            if step.get("questions"):
                lines.append(f"- Bank asked: {' / '.join(step['questions'])}")
                lines.append(f"- Reply: {step.get('answer')}")
            lines.append(f"- Score {step.get('score')}, reasons shown: {'; '.join(step.get('reasons', [])) or 'none'}")
    return "\n".join(lines) + "\n"


def render_transcript(adaptive, fixed):
    """A readable record of every exchange, so we can see exactly where the checks went wrong."""
    lines = ["# Last Mile Guard: red-team transcript", "", "All data is made up.", "", "## Fixed attacks", "",
             "| id | group | status | action | passed |", "|---|---|---|---|---|"]
    for item in fixed:
        lines.append(f"| {item['id']} | {item['group']} | {item['status']} | {item.get('action')} | {item['passed']} |")

    lines += ["", "## Adaptive conversations"]
    for record in adaptive:
        title = record.get("typology") or record.get("story")
        outcome = ("got through" if record.get("evaded") else "stopped") if record["kind"] == "scam" else (
            "given friction" if record.get("false_alarm") else "allowed")
        lines += ["", f"### {record['kind']}: {title} ({outcome})"]
        for number, step in enumerate(record["tries"], start=1):
            lines.append(f"**Try {number}**")
            lines.append(f"- Note: {step.get('note')}")
            if step.get("error"):
                lines.append(f"- Problem: {step['error']}")
                continue
            lines.append(f"- First decision: {step.get('first_action')}")
            if step.get("questions"):
                lines.append(f"- Bank asked: {' / '.join(step['questions'])}")
                lines.append(f"- Reply: {step.get('answer')}")
            lines.append(f"- Final decision: {step.get('final_action')} (score {step.get('score')})")
            lines.append(f"- Reasons shown: {'; '.join(step.get('reasons', [])) or 'none'}")
    return "\n".join(lines) + "\n"


def summarise_scenarios(records):
    """Score the scenario runs against their hidden answers."""
    judged = [r for r in records if r.get("ok") is not None]
    errors = [r for r in records if r.get("error")]
    unreliable = [r for r in records if "ok" in r and r["ok"] is None]

    def rate(items):
        return (sum(1 for r in items if r["ok"]), len(items))

    scams = [r for r in judged if r["label"] == "scam"]
    legit = [r for r in judged if r["label"] == "legit"]
    summary = {
        "scenarios_run": len(records), "scored": len(judged), "errors": len(errors), "unreliable": len(unreliable),
        "scams_flagged": (sum(1 for r in scams if r["final_action"] in ("warn", "hold")), len(scams)),
        "genuine_with_friction": (sum(1 for r in legit if r["final_action"] != "allow"), len(legit)),
        "overall_correct": rate(judged),
        "by_category": {}, "by_difficulty": {},
        "failures": [r for r in judged if not r["ok"]],
    }
    for key, field in (("by_category", "category"), ("by_difficulty", "difficulty")):
        groups = {}
        for r in judged:
            groups.setdefault(r[field], []).append(r)
        summary[key] = {name: rate(items) for name, items in sorted(groups.items())}
    return summary


def _pct(pair):
    done, total = pair
    return f"{done}/{total}" + (f" ({round(100 * done / total)}%)" if total else "")


def render_scenarios(summary, notes):
    lines = ["# Last Mile Guard: blind scenario test", "", "All data is made up. The site never saw the labels.", ""]
    for note in notes:
        lines.append(f"> {note}")
    lines += ["", f"- Scenarios run: {summary['scenarios_run']} (scored {summary['scored']}, errors {summary['errors']}, "
                  f"unreliable {summary['unreliable']})",
              f"- Scams flagged (warning or hold): {_pct(summary['scams_flagged'])}",
              f"- Genuine customers given any friction: {_pct(summary['genuine_with_friction'])}",
              f"- Overall as expected: {_pct(summary['overall_correct'])}", "", "## By kind of scenario"]
    for name, pair in summary["by_category"].items():
        lines.append(f"- {name}: {_pct(pair)}")
    lines += ["", "## By difficulty"]
    for name, pair in summary["by_difficulty"].items():
        lines.append(f"- {name}: {_pct(pair)}")
    if summary["failures"]:
        lines += ["", "## Where the system got it wrong"]
        for r in summary["failures"]:
            lines += ["", f"### {r['id']} ({r['category']}, {r['label']})",
                      f"- Expected: {' or '.join(r['expected_actions'])}   Got: {r['final_action']} (score {r.get('score')})",
                      f"- Note: {r.get('note')}"]
            if r.get("questions"):
                lines.append(f"- Bank asked: {' / '.join(r['questions'])}")
                lines.append(f"- Customer replied: {r.get('answer')}")
            lines.append(f"- Reasons shown: {'; '.join(r.get('reasons', [])) or 'none'}")
    return "\n".join(lines) + "\n"


def render_scenario_transcript(records):
    lines = ["# Last Mile Guard: every scenario exchange", "", "All data is made up.", ""]
    for r in records:
        lines += [f"## {r['id']} ({r['category']}, {r['label']}, {r['difficulty']})"]
        if r.get("error"):
            lines += [f"- Problem: {r['error']}", ""]
            continue
        lines.append(f"- Note: {r.get('note')}")
        lines.append(f"- First decision: {r.get('first_action')}")
        if r.get("questions"):
            lines.append(f"- Bank asked: {' / '.join(r['questions'])}")
            lines.append(f"- Customer replied: {r.get('answer')}")
        verdict = "OK" if r.get("ok") else "MISS" if r.get("ok") is False else "not reliable"
        lines.append(f"- Final: {r.get('final_action')} (score {r.get('score')}), expected "
                     f"{' or '.join(r['expected_actions'])}, {verdict}")
        lines.append("")
    return "\n".join(lines) + "\n"
