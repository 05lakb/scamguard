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
