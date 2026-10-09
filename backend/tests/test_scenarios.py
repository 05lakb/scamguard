"""Offline tests for the scenario factory, the simulated customer and the scoring."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk.behaviour import check_behaviour  # noqa: E402
from redteam import customer_agent, factory  # noqa: E402
from redteam.report import render_scenarios, summarise_scenarios  # noqa: E402
from redteam.site_client import Reply  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocklist import blocked_words_in  # noqa: E402


def behaviour(scenario):
    return check_behaviour(scenario["payment"], {**scenario["customer"], "id": "x"})["score"]


# ---------- the factory ----------

def test_the_same_seed_gives_the_same_file():
    assert factory.build(40, 7) == factory.build(40, 7)
    assert factory.build(40, 7) != factory.build(40, 8)


def test_the_counts_add_up_and_every_kind_is_present():
    for total in (10, 40, 77):
        assert sum(factory.counts_for(total).values()) == total
    kinds = {item["category"] for item in factory.build(40, 7)["scenarios"]}
    assert kinds == {name for name, _ in factory.PLAN}


def test_every_scenario_is_complete_and_ids_are_unique():
    items = factory.build(60, 3)["scenarios"]
    assert len({item["id"] for item in items}) == len(items)
    for item in items:
        for key in ("label", "category", "difficulty", "customer", "payment", "persona", "expected_actions"):
            assert key in item
        assert item["label"] in ("scam", "legit")
        assert item["persona"]["facts"]


def test_the_scenarios_behave_as_their_kind_intends():
    items = factory.build(200, 7)["scenarios"]
    for item in items:
        score = behaviour(item)
        if item["category"] in ("obvious_scam", "split_payments"):
            assert score >= 40, item["id"]  # the payment alone gives these away
        if item["category"] in ("quiet_scam", "coached_victim", "injection"):
            assert score < 40, item["id"]  # only the story can give these away
        if item["category"] == "obvious_legit":
            assert score < 25, item["id"]


def test_everything_in_a_scenario_is_made_up_and_no_real_names_appear():
    text = json.dumps(factory.build(200, 7)).lower()
    for word in ("paypal", "revolut", "binance", "coinbase", "barclays", "hsbc", "@", "http"):
        assert word not in text
    assert not blocked_words_in(text)


# ---------- what the site is allowed to see ----------

def test_the_site_never_sees_labels_or_the_persona():
    scenario = factory.build(40, 7)["scenarios"][0]
    first = customer_agent.request_for(scenario, "a note")
    second = customer_agent.request_for(scenario, "a note", ["Who is it?"], "my friend")
    assert set(first) == {"payment", "customer", "message"}
    assert set(second) == {"payment", "customer", "message", "questions", "answer"}
    sent = json.dumps(second)
    for hidden in (scenario["persona"]["facts"], scenario["label"] + '"', "expected_actions", "persona", "category"):
        assert hidden not in sent


# ---------- the simulated customer ----------

class FakeSite:
    def __init__(self, answers):
        self.answers = list(answers)
        self.sent = []

    def assess(self, body, retry_on_limit=True):
        self.sent.append(body)
        return Reply(200, self.answers.pop(0), "")


def pick(category):
    return next(s for s in factory.build(80, 7)["scenarios"] if s["category"] == category)


def test_a_customer_who_refuses_gives_a_refusal_not_a_written_answer():
    scenario = pick("refusal")
    site = FakeSite([{"action": "ask", "questions": ["Who is it for?"], "score": 40, "reasons": []},
                     {"action": "hold", "score": 80, "reasons": ["declined"]}])
    writes = []
    record = customer_agent.play(site, lambda prompt: writes.append(prompt) or "a short note", scenario)
    assert record["answer"] in customer_agent.REFUSALS
    assert len(writes) == 1  # only the note was written by the model
    assert record["final_action"] == "hold" and record["ok"] is True


def test_an_injection_line_is_added_exactly_as_written():
    scenario = pick("injection")
    site = FakeSite([{"action": "hold", "score": 80, "reasons": []}])
    record = customer_agent.play(site, lambda prompt: "paying today", scenario)
    assert record["note"].endswith(scenario["persona"]["injection"])


def test_a_customer_with_no_note_sends_none():
    scenario = next(s for s in factory.build(200, 7)["scenarios"]
                    if s["category"] == "obvious_legit" and not s["persona"]["writes_note"])
    site = FakeSite([{"action": "allow", "score": 0, "reasons": []}])
    record = customer_agent.play(site, lambda prompt: "never used", scenario)
    assert site.sent[0]["message"] is None
    assert record["ok"] is True


def test_prompts_for_the_customer_never_contain_the_banks_rules():
    scenario = pick("quiet_scam")
    prompt = customer_agent.build_note_prompt(scenario) + customer_agent.build_reply_prompt(scenario, "note", ["q?"])
    for secret in ("threshold", "points", "HOLD_AT", "WARN_AT", "score"):
        assert secret not in prompt


def test_reliability_marks_results_answered_without_the_message_reader():
    scenario = pick("quiet_scam")
    site = FakeSite([{"action": "allow", "score": 5, "reasons": [], "degraded": True}])
    record = customer_agent.play(site, lambda prompt: "note", scenario)
    assert record["ok"] is None


# ---------- scoring ----------

def test_scoring_counts_by_kind_and_lists_the_misses():
    records = [
        {"id": "a", "label": "scam", "category": "quiet_scam", "difficulty": "hard", "final_action": "allow",
         "expected_actions": ["warn", "hold"], "ok": False, "note": "n", "reasons": []},
        {"id": "b", "label": "scam", "category": "quiet_scam", "difficulty": "hard", "final_action": "hold",
         "expected_actions": ["warn", "hold"], "ok": True, "note": "n", "reasons": []},
        {"id": "c", "label": "legit", "category": "obvious_legit", "difficulty": "easy", "final_action": "allow",
         "expected_actions": ["allow"], "ok": True, "note": None, "reasons": []},
        {"id": "d", "label": "scam", "category": "refusal", "difficulty": "medium", "error": "site answered 500"},
    ]
    summary = summarise_scenarios(records)
    assert summary["scams_flagged"] == (1, 2)
    assert summary["genuine_with_friction"] == (0, 1)
    assert summary["by_category"]["quiet_scam"] == (1, 2)
    assert summary["errors"] == 1
    assert [r["id"] for r in summary["failures"]] == ["a"]
    assert "quiet_scam: 1/2 (50%)" in render_scenarios(summary, [])


def test_a_monthly_exchange_top_up_never_contradicts_the_banks_records():
    seen_known = seen_first_time = 0
    for seed in range(20, 30):
        for item in factory.build(90, seed)["scenarios"]:
            facts = item["persona"]["facts"]
            if item["label"] != "legit" or "exchange account" not in facts or "every month" not in facts:
                continue
            if not item["payment"]["is_new_payee"]:
                seen_known += 1  # the bank already knows this monthly payee
            else:
                assert "first time they are sending to it from this bank" in facts, item["id"]
                seen_first_time += 1  # the hard case is kept, and the story says so
    assert seen_known > seen_first_time > 0
