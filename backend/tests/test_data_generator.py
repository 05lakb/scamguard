"""Checks that the made-up test data has the shape we promised."""

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "data"))
import generate_data  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocklist import blocked_words_in  # noqa: E402


def test_same_seed_gives_same_data():
    first = generate_data.build_all(seed=1)
    second = generate_data.build_all(seed=1)
    assert first == second


def test_counts_are_100_scam_and_100_legit():
    _, scenarios = generate_data.build_all()
    counts = Counter(item["label"] for item in scenarios)
    assert counts["scam"] == 100
    assert counts["legit"] == 100


def test_every_scam_type_is_covered():
    _, scenarios = generate_data.build_all()
    kinds = {item["typology"] for item in scenarios if item["label"] == "scam"}
    assert kinds == set(generate_data.SCAM_MESSAGES)


def test_some_scams_try_to_trick_the_checker():
    _, scenarios = generate_data.build_all()
    tricky = [item for item in scenarios if item["has_injection"]]
    assert len(tricky) >= 8
    assert all(item["label"] == "scam" for item in tricky)


def test_some_scams_come_with_no_message():
    _, scenarios = generate_data.build_all()
    silent = [item for item in scenarios if item["label"] == "scam" and not item["customer_evidence"]]
    assert 10 <= len(silent) <= 40


def test_quiet_scams_look_ordinary_and_only_the_message_gives_them_away():
    _, scenarios = generate_data.build_all()
    quiet = [item for item in scenarios if item.get("quiet")]
    assert len(quiet) >= 20
    for item in quiet:
        assert item["customer_evidence"]
        assert not item["payment"]["on_live_call"]
        assert not item["payment"]["remote_access_tool_running"]
        assert item["payment"]["device_known"]


def test_normal_payments_that_look_odd_are_included():
    _, scenarios = generate_data.build_all()
    lookalikes = [item for item in scenarios if item["label"] == "legit" and item["difficulty"] == "hard"]
    assert len(lookalikes) >= 30


def test_no_real_company_or_employer_names_in_the_data():
    # The data must never name the owner's employer, its clients, or well-known firms.
    blocked = [
        "deutsche", "barclays", "hsbc", "jpmorgan", "citibank",
        "wells fargo", "vanguard", "fidelity", "blackrock", "amundi", "allianz",
        "aviva", "paypal", "revolut", "pioneer", "harbor", "summit",
    ]
    customers, scenarios = generate_data.build_all()
    text = (str(customers) + str(scenarios)).lower()
    found = [word for word in blocked if word in text]
    assert not found, f"Real-looking names found in test data: {found}"
    assert not blocked_words_in(text), "A blocked word was found in the test data"


def test_every_scenario_points_at_a_real_customer():
    customers, scenarios = generate_data.build_all()
    ids = {customer["id"] for customer in customers}
    assert all(item["customer_id"] in ids for item in scenarios)


def test_expected_action_is_always_one_of_the_allowed_ones():
    _, scenarios = generate_data.build_all()
    for item in scenarios:
        assert item["expected_action"] in item["acceptable_actions"]
