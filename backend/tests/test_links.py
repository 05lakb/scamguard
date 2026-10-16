"""Tests for the link check. It never opens a link, so these need no internet."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk.links import check_links, normalise, one_edit_apart  # noqa: E402


def whys(text):
    return [item["why"] for item in check_links(text)]


def test_a_shortened_link_is_flagged_with_or_without_the_scheme():
    assert "shortened" in whys("Your refund is waiting, tap https://bit.ly/3xYz")[0]
    assert "shortened" in whys("claim here: tinyurl.com/abc123.")[0]


def test_a_payment_request_link_is_flagged():
    assert "payment-request" in whys("Approve upi://pay?pa=someone@bank&am=500 to receive money")[0]


def test_an_address_made_of_numbers_or_look_alike_characters_is_flagged():
    assert "numbers" in whys("Log in at http://192.168.4.20/secure")[0]
    assert "look-alike" in whys("Visit https://xn--pypal-4ve.com/login")[0]


def test_a_hidden_name_before_the_real_site_is_flagged():
    assert "hidden" in whys("Open https://paypal.com@evil-site.top/login")[0]


def test_an_address_that_imitates_a_known_brand_is_flagged():
    assert "imitates paypal.com" in whys("Verify at https://paypa1-secure.com/login")[0]
    assert "imitates paypal.com" in whys("https://paypal-support.net/help")[0]
    assert "imitates amazon.com" in whys("https://amazon.verify-account.info/orders")[0]
    assert "imitates amazon.com" in whys("https://arnazon.com/deal")[0]  # rn looks like m


def test_genuine_addresses_are_not_flagged():
    for text in ("See https://www.google.com/maps", "https://mail.google.com/inbox", "Orders at https://amazon.in/orders",
                 "https://www.paypal.com/signin", "Pay rent of $800 today. Thank you.", "e.g. a normal sentence."):
        assert check_links(text) == [], text


def test_an_unusual_ending_alone_is_flagged_but_a_plain_unknown_site_is_not():
    assert "unusual ending (.xyz)" in whys("Collect your prize at https://win-big.xyz/now")[0]
    assert check_links("More details at https://example-supplier.com/invoice") == []


def test_at_most_three_findings_and_repeats_count_once():
    text = " ".join(f"bit.ly/{n}" for n in range(8)) + " bit.ly/0"
    assert len(check_links(text)) == 3
    assert len(check_links("bit.ly/a bit.ly/a bit.ly/a")) == 1


def test_a_long_link_is_cut_for_display_and_empty_text_is_fine():
    shown = check_links("https://bit.ly/" + "a" * 200)[0]["link"]
    assert len(shown) <= 50
    assert check_links("") == [] and check_links(None) == []


def test_the_helpers_undo_common_disguises():
    assert normalise("paypa1") == "paypal"
    assert normalise("arnazon") == "amazon"
    assert one_edit_apart("amazn", "amazon") and not one_edit_apart("amazon", "amazon")
    assert not one_edit_apart("abc", "abcde")
