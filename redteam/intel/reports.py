"""A careful reader for public pages where authorities explain how fraud happens.

The red agent should learn from real, published fraud patterns. This file only fetches and reads
pages. It never sends anything about us, and it never saves the original page text.

Safety rules built in:
  - only a short list of named websites, over https, is ever contacted,
  - a redirect to any other website is refused, not followed,
  - it checks each site's robots.txt and skips what the site asks robots to skip,
  - it waits between requests and stops at a hard limit,
  - it identifies itself honestly.
Run it in Cloud Shell, not on a laptop.
"""

import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from redteam.intel.scrub import scrub

USER_AGENT = "LastMileGuard-research/0.1 (hackathon prototype; reads public fraud advice pages)"

# The only websites we will talk to. US government pages are public domain.
SOURCES = {
    "consumer.ftc.gov": "US Federal Trade Commission, consumer alerts",
    "www.scamwatch.gov.au": "Australian Scamwatch (ACCC), types of scams",
    "www.actionfraud.police.uk": "UK Action Fraud, A to Z of fraud",
}

# Where to look first. The probe reports which of these answer with readable text.
START_PAGES = [
    "https://consumer.ftc.gov/consumer-alerts",
    "https://www.scamwatch.gov.au/types-of-scams/investment-scams",
    "https://www.scamwatch.gov.au/types-of-scams/romance-scams",
    "https://www.scamwatch.gov.au/types-of-scams/remote-access-scams",
    "https://www.scamwatch.gov.au/types-of-scams/false-billing",
    "https://www.actionfraud.police.uk/a-z-of-fraud",
]

SKIPPED_TAGS = {"script", "style", "nav", "header", "footer", "noscript", "svg", "form"}


class _TextOnly(HTMLParser):
    """Pulls the title and the visible words out of a page."""

    def __init__(self):
        super().__init__()
        self.title = ""
        self.parts = []
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in SKIPPED_TAGS:
            self._skip += 1
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag in SKIPPED_TAGS and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip and data.strip():
            self.parts.append(data.strip())


def read_page(html):
    """Return (title, visible text) from a page's source."""
    parser = _TextOnly()
    parser.feed(html or "")
    return " ".join(parser.title.split()), " ".join(parser.parts)


def check_address(address):
    """Raise if the address is not https on one of our named websites."""
    parsed = urlparse(address)
    if parsed.scheme != "https" or parsed.hostname not in SOURCES:
        raise ValueError(f"Refusing to talk to {parsed.hostname!r}. Only {sorted(SOURCES)} are allowed.")


class ReportReader:
    def __init__(self, pace_seconds=3.0, max_requests=30, client=None, sleeper=time.sleep, clock=time.monotonic,
                 timeout=30.0):
        self.pace_seconds = pace_seconds
        self.max_requests = max_requests
        self._sleep = sleeper
        self._clock = clock
        self._last = None
        self._http = client or httpx.Client(timeout=timeout, follow_redirects=False)
        self._robots = {}
        self.requests_made = 0

    def _pace(self):
        if self._last is not None:
            wait = self.pace_seconds - (self._clock() - self._last)
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()

    def _send(self, address):
        if self.requests_made >= self.max_requests:
            raise RuntimeError("Request limit reached.")
        self._pace()
        self.requests_made += 1
        return self._http.get(address, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})

    def allowed_by_robots(self, address):
        """True if the site's robots.txt lets us read this page. If we cannot read robots.txt, we say no."""
        check_address(address)
        parsed = urlparse(address)
        if parsed.hostname not in self._robots:
            rules = RobotFileParser()
            try:
                response = self._send(f"https://{parsed.hostname}/robots.txt")
                if response.status_code == 200:
                    rules.parse(response.text.splitlines())
                elif response.status_code in (404, 410):
                    rules.parse([])  # no robots.txt means no restrictions
                else:
                    rules = None
            except httpx.HTTPError:
                rules = None
            self._robots[parsed.hostname] = rules
        rules = self._robots[parsed.hostname]
        return rules is not None and rules.can_fetch(USER_AGENT, address)

    def fetch(self, address):
        """Read one page. Returns a dict describing what happened. Never follows a redirect off the list."""
        check_address(address)
        if not self.allowed_by_robots(address):
            return {"address": address, "status": None, "note": "skipped: robots.txt does not allow it"}
        response = self._send(address)
        if response.status_code in (301, 302, 303, 307, 308):
            target = urljoin(address, response.headers.get("location", ""))
            try:
                check_address(target)
            except ValueError:
                return {"address": address, "status": response.status_code, "note": "redirect to another website, refused"}
            return {"address": address, "status": response.status_code, "note": f"redirects to {target}", "redirect": target}
        if response.status_code != 200:
            return {"address": address, "status": response.status_code, "note": "no page"}
        title, text = read_page(response.text)
        return {"address": address, "status": 200, "title": title, "text_length": len(text),
                "snippet": scrub(text, 160), "text": text}
