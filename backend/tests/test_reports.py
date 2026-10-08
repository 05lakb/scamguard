"""Tests for the reader of public fraud-advice pages. No internet is used."""

import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from redteam.intel import reports  # noqa: E402

PAGE = "https://consumer.ftc.gov/consumer-alerts"


def make_reader(handler, **kwargs):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return reports.ReportReader(pace_seconds=0, client=client, **kwargs)


def test_other_websites_and_plain_http_are_refused():
    with pytest.raises(ValueError):
        reports.check_address("https://example.com/page")
    with pytest.raises(ValueError):
        reports.check_address("http://consumer.ftc.gov/consumer-alerts")
    reports.check_address(PAGE)


def test_visible_text_is_pulled_out_and_scripts_are_ignored():
    html = ("<html><head><title> Fake  alert </title><script>var x=1;</script></head>"
            "<body><nav>menu</nav><p>Scammers call.</p></body></html>")
    title, text = reports.read_page(html)
    assert title == "Fake alert"
    assert text == "Scammers call."


def test_a_page_is_read_when_robots_allows_it():
    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        return httpx.Response(200, text="<title>Alert</title><p>A caller said the account is at risk.</p>")

    result = make_reader(handler).fetch(PAGE)
    assert result["status"] == 200
    assert "caller" in result["text"]


def test_a_page_robots_forbids_is_skipped_and_never_requested():
    seen = []

    def handler(request):
        seen.append(request.url.path)
        return httpx.Response(200, text="User-agent: *\nDisallow: /\n")

    result = make_reader(handler).fetch(PAGE)
    assert result["status"] is None
    assert "robots" in result["note"]
    assert seen == ["/robots.txt"]


def test_an_unreadable_robots_file_means_no():
    result = make_reader(lambda request: httpx.Response(500)).fetch(PAGE)
    assert result["status"] is None


def test_a_redirect_to_another_website_is_refused():
    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(302, headers={"location": "https://elsewhere.example/x"})

    result = make_reader(handler).fetch(PAGE)
    assert "refused" in result["note"]


def test_the_reader_stops_at_its_request_limit():
    reader = make_reader(lambda request: httpx.Response(404), max_requests=2)
    reader.fetch(PAGE)  # one request for robots.txt, one for the page
    with pytest.raises(RuntimeError):
        reader.fetch(PAGE)


# ---------- collecting passages from article pages ----------

def test_only_article_links_on_our_sites_are_kept_and_redirects_inside_them_are_followed():
    from redteam.intel import collect_reports

    pattern = collect_reports.INDEXES[0][1]
    links = ["https://consumer.ftc.gov/consumer-alerts/2026/03/a-fake-call", "https://consumer.ftc.gov/about-us",
             "https://consumer.ftc.gov/consumer-alerts/2026/03/a-fake-call"]
    assert collect_reports.article_links(links, pattern) == ["https://consumer.ftc.gov/consumer-alerts/2026/03/a-fake-call"]

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path == "/old":
            return httpx.Response(301, headers={"location": "/new"})
        return httpx.Response(200, text="<title>New</title><a href='/consumer-alerts/2026/03/x-y'>x</a><a href='https://other.example/z'>z</a>")

    result = make_reader(handler).fetch("https://consumer.ftc.gov/old")
    assert result["status"] == 200 and result["address"].endswith("/new")
    assert result["links"] == ["https://consumer.ftc.gov/consumer-alerts/2026/03/x-y"]


def test_passages_are_whole_sentences_and_only_useful_ones_are_kept():
    from redteam.intel import collect_reports

    sentence = "A caller says they are from your bank and tells you to send money to a safe account today. "
    passages = collect_reports.passages_of(sentence * 30)
    assert len(passages) > 1
    assert all(len(item) <= collect_reports.MAX_CHARS for item in passages)
    assert all(item.endswith(".") for item in passages)
    assert collect_reports.useful(sentence * 4)
    assert not collect_reports.useful("Skip to main content. The .gov means it is official.")


def test_collecting_saves_scrubbed_passages_with_their_source():
    from redteam.intel import collect_reports

    body = ("A caller says they are from your bank and tells you to send money to a safe account today. "
            "Call 555 123 4567 or visit https://scam.example to learn more about how they ask you to pay. ") * 3

    def handler(request):
        path = request.url.path
        if path == "/robots.txt":
            return httpx.Response(404)
        if path == "/consumer-alerts":
            return httpx.Response(200, text="<title>Alerts</title><a href='/consumer-alerts/2026/03/safe-account'>a</a>")
        if path == "/consumer-alerts/2026/03/safe-account":
            return httpx.Response(200, text=f"<title>Safe account calls</title><p>{body}</p>")
        return httpx.Response(404)

    stories = collect_reports.collect(make_reader(handler), per_source=3, max_pages=5)
    assert stories
    first = stories[0]
    assert first["reference"]["url"].endswith("/safe-account")
    assert first["reference"]["name"] == reports.SOURCES["consumer.ftc.gov"]
    assert "555" not in first["story"] and "scam.example" not in first["story"]


def test_page_furniture_is_removed_before_passages_are_cut():
    from redteam.intel import collect_reports

    ftc = ("Skip to main content The .gov means it is official. Vea esta pagina en espanol Consumer Alert "
           "A caller says you missed jury duty. Recent Consumer Alerts Did someone share an image?")
    assert collect_reports.clean_page_text(ftc) == "A caller says you missed jury duty."
    scamwatch = "Skip to content Skip to navigation Skip to search Search Menu Listen Phone scams Scammers call. Is this page useful? Yes No"
    assert collect_reports.clean_page_text(scamwatch) == "Phone scams Scammers call."


def test_on_topic_articles_come_first_and_off_topic_ones_are_dropped():
    from redteam.intel import collect_reports

    pattern = collect_reports.INDEXES[0][1]
    base = "https://consumer.ftc.gov/consumer-alerts/2026/03/"
    links = [base + "open-enrollment-health-plans", base + "ignore-jury-duty-arrest-calls", base + "gift-card-scam"]
    kept = collect_reports.article_links(links, pattern, require_topic=True)
    assert base + "open-enrollment-health-plans" not in kept
    assert kept[0] == base + "ignore-jury-duty-arrest-calls" or kept[0] == base + "gift-card-scam"
    assert len(kept) == 2


def test_passages_that_only_give_protection_advice_are_not_useful():
    from redteam.intel import collect_reports

    advice = ("Steps you can take to protect yourself. Call the organisation back on a number you found yourself and "
              "never send money or give bank account details to anyone who says they are from your bank. ") * 3
    story = ("A caller says they are from your bank and tells you the account is under attack, so you must send money "
             "to a safe account today and not tell anyone. ") * 3
    assert not collect_reports.useful(advice)
    assert collect_reports.useful(story)
