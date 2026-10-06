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
