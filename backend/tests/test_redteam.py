"""Offline tests for the testing agent. Nothing here goes to the internet."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk.behaviour import check_behaviour  # noqa: E402
from redteam import attacks, attacker  # noqa: E402
from redteam.report import judge, summarise  # noqa: E402
from redteam.site_client import Reply, SiteClient  # noqa: E402


class FakeHttp:
    def __init__(self):
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url))

        class Response:
            status_code = 200
            text = "{}"

            def json(self):
                return {}

        return Response()


# ---------- the safety guard ----------

def test_only_https_cloud_run_addresses_are_allowed():
    SiteClient("https://my-app-abc123-uc.a.run.app", client=FakeHttp())
    for bad in ("http://my-app.run.app", "https://example.com", "https://evil.com/.run.app", "https://run.app.evil.com"):
        with pytest.raises(ValueError):
            SiteClient(bad, client=FakeHttp())


def test_one_extra_host_can_be_named_on_purpose():
    SiteClient("https://my.own.domain", allow_host="my.own.domain", client=FakeHttp())
    with pytest.raises(ValueError):
        SiteClient("https://other.domain", allow_host="my.own.domain", client=FakeHttp())


def test_requests_are_spaced_out():
    waits = []
    now = [0.0]
    site = SiteClient("https://x.a.run.app", pace_seconds=6, sleeper=waits.append, clock=lambda: now[0], client=FakeHttp())
    site.health()
    now[0] = 1.0
    site.health()
    assert waits and 4.9 < waits[0] <= 5.0


# ---------- the attacks ----------

def test_the_risky_payment_leaves_room_for_a_trick_to_matter():
    score = check_behaviour(attacks.risky_payment(), {**attacks.CUSTOMER, "id": "x"})["score"]
    assert 40 <= score < 70  # a warning on its own, so a successful trick would show up as "allow"


def test_the_calm_payment_is_allowed_by_behaviour_alone():
    assert check_behaviour(attacks.calm_payment(), {**attacks.CUSTOMER, "id": "x"})["score"] < 25


def test_attack_ids_are_unique_and_cover_every_group():
    everything = attacks.injection_attacks() + attacks.validation_attacks()
    ids = [item.id for item in everything]
    assert len(ids) == len(set(ids))
    assert {item.group for item in everything} == {"injection", "validation"}
    assert len(attacks.injection_attacks()) >= 8


def test_every_attack_has_a_payload_or_raw_body():
    for item in attacks.injection_attacks() + attacks.validation_attacks():
        assert item.payload is not None or item.raw is not None
        assert item.expect in ("not_allow", "reject_4xx", "no_crash", "allow")


def test_split_payments_count_up():
    steps = attacks.split_payment_sequence(5)
    assert [step["payment"]["payments_last_24h"] for step in steps] == [0, 1, 2, 3, 4]


# ---------- judging and reporting ----------

def test_judging_rules():
    assert judge("not_allow", Reply(200, {"action": "hold"}, "")) is True
    assert judge("not_allow", Reply(200, {"action": "allow"}, "")) is False
    assert judge("not_allow", Reply(200, {"action": "allow", "degraded": True}, "")) is None
    assert judge("reject_4xx", Reply(422, None, "")) is True
    assert judge("reject_4xx", Reply(500, None, "")) is False
    assert judge("no_crash", Reply(200, {}, "")) is True
    assert judge("allow", Reply(200, {"action": "warn"}, "")) is False


def test_summary_counts_evasions_and_friction():
    adaptive = [
        {"kind": "scam", "typology": "romance", "tries": [{"note": "a"}], "evaded": True, "evaded_on_try": 2},
        {"kind": "scam", "typology": "investment", "tries": [{"note": "b"}], "evaded": False, "evaded_on_try": None},
        {"kind": "benign", "story": "surprise party", "tries": [{"note": "c"}], "false_alarm": True},
    ]
    result = summarise([], adaptive, [])
    assert result["scam_attempts"]["got_through_within_three_tries"] == 1
    assert result["scam_attempts"]["got_through_first_try"] == 0
    assert result["genuine_customers"]["given_friction"] == 1


# ---------- the adaptive attacker, with a fake writer and a fake site ----------

class FakeSite:
    def __init__(self, answers):
        self.answers = list(answers)
        self.sent = []

    def assess(self, body, retry_on_limit=True):
        self.sent.append(body)
        return Reply(200, self.answers.pop(0), "")


SEED = attacker.SCAM_SEEDS[0]
SCAM_TYPE = {"name": "Fake investment", "how_it_works": "A promise of returns."}


def test_attacker_stops_as_soon_as_a_payment_is_allowed():
    site = FakeSite([{"action": "hold", "score": 80, "reasons": ["r"]}, {"action": "allow", "score": 10, "reasons": []}])
    record = attacker.run_scam_seed(site, lambda prompt: "paying my broker today", SEED, SCAM_TYPE)
    assert record["evaded"] and record["evaded_on_try"] == 2


def test_attacker_answers_the_banks_questions_and_the_second_round_decides():
    site = FakeSite([
        {"action": "ask", "questions": ["Who is it for?"], "score": 40, "reasons": []},
        {"action": "hold", "score": 90, "reasons": ["rehearsed"]},
    ] * 3)
    record = attacker.run_scam_seed(site, lambda prompt: "a calm reply", SEED, SCAM_TYPE, max_tries=1)
    assert not record["evaded"]
    assert site.sent[1]["answer"] == "a calm reply"
    assert site.sent[1]["questions"] == ["Who is it for?"]


def test_attacker_that_refuses_is_recorded_not_counted():
    site = FakeSite([])
    record = attacker.run_scam_seed(site, lambda prompt: "I can't help with that.", SEED, SCAM_TYPE)
    assert "error" in record["tries"][0]
    assert not record["evaded"]


def test_genuine_customer_with_friction_is_a_false_alarm():
    seed = attacker.BENIGN_SEEDS[0]
    site = FakeSite([{"action": "warn", "score": 45, "reasons": ["new payee"]}])
    record = attacker.run_benign_seed(site, lambda prompt: "surprise party deposit", seed)
    assert record["false_alarm"] is True


def test_attacker_prompts_never_include_our_rules():
    prompt = attacker.build_scam_note_prompt(SEED, SCAM_TYPE, [])
    for secret in ("threshold", "points", "HOLD_AT", "WARN_AT", "score of"):
        assert secret not in prompt


# ---------- the hard limits ----------

from redteam.budget import Budget, BudgetExceeded  # noqa: E402
from redteam import run as run_module  # noqa: E402


def test_the_request_cap_stops_the_run():
    budget = Budget(max_requests=3, max_minutes=60, max_model_calls=10)
    for _ in range(3):
        budget.check_request()
    with pytest.raises(BudgetExceeded):
        budget.check_request()


def test_the_tester_gemini_cap_stops_the_run():
    budget = Budget(max_requests=100, max_minutes=60, max_model_calls=2)
    budget.check_model_call()
    budget.check_model_call()
    with pytest.raises(BudgetExceeded):
        budget.check_model_call()


def test_the_time_cap_stops_the_run():
    now = [0.0]
    budget = Budget(max_requests=100, max_minutes=2, max_model_calls=10, clock=lambda: now[0])
    budget.check_request()
    now[0] = 121.0
    with pytest.raises(BudgetExceeded):
        budget.check_request()


def test_the_web_client_checks_the_cap_before_sending():
    http = FakeHttp()
    site = SiteClient("https://x.a.run.app", pace_seconds=0, sleeper=lambda s: None,
                      client=http, budget=Budget(max_requests=2, max_minutes=60, max_model_calls=5))
    site.health()
    site.health()
    with pytest.raises(BudgetExceeded):
        site.health()
    assert len(http.calls) == 2  # the third request was never sent


def test_the_plan_matches_the_size_of_the_suites():
    fixed = run_module.plan("fixed", 4, 6)
    adaptive = run_module.plan("adaptive", 4, 6)
    both = run_module.plan("all", 4, 6)
    assert fixed["attacker_calls"] == 0
    assert adaptive["attacker_calls"] == 4 * 6 + 2 * 2
    assert both["requests"] == fixed["requests"] + adaptive["requests"]
    assert fixed["minutes"] > 0


def test_the_transcript_shows_every_exchange():
    from redteam.report import render_transcript
    adaptive = [{"kind": "scam", "typology": "romance", "evaded": False, "evaded_on_try": None, "tries": [
        {"note": "help with visa fee", "first_action": "ask", "questions": ["Who is it for?"], "answer": "my friend",
         "final_action": "hold", "score": 88, "reasons": ["new payee"]}]}]
    fixed = [{"id": "inject_plain_order", "group": "injection", "status": 200, "action": "hold", "passed": True}]
    text = render_transcript(adaptive, fixed)
    for expected in ("help with visa fee", "Who is it for?", "my friend", "hold (score 88)", "inject_plain_order"):
        assert expected in text
