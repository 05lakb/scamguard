"""A careful reader for the CFPB's public Consumer Complaint Database.

The database holds complaints that people chose to publish, with personal details already
removed by the CFPB. We still scrub again, and we never save the original text.

Safety rules built in:
  - it only ever talks to the CFPB's own website, over https,
  - it waits between requests and asks for small pages,
  - it identifies itself honestly.
Run it in Cloud Shell, not on a laptop.
"""

import time
from urllib.parse import urlparse

import httpx

BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"
ALLOWED_HOST = "www.consumerfinance.gov"
USER_AGENT = "LastMileGuard-research/0.1 (hackathon prototype; reads public complaint narratives)"


class ComplaintClient:
    def __init__(self, base=BASE, pace_seconds=2.0, client=None, sleeper=time.sleep, clock=time.monotonic):
        parsed = urlparse(base)
        if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST:
            raise ValueError(f"Refusing to talk to {parsed.hostname!r}. Only {ALLOWED_HOST} is allowed.")
        self.base = base
        self.pace_seconds = pace_seconds
        self._sleep = sleeper
        self._clock = clock
        self._last = None
        self._http = client or httpx.Client(timeout=45.0, follow_redirects=False)
        self.requests_made = 0

    def _pace(self):
        if self._last is not None:
            wait = self.pace_seconds - (self._clock() - self._last)
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()

    def get(self, params, base=None):
        """Send one request with exactly these parameters. Returns (status, payload, text, final address)."""
        self._pace()
        self.requests_made += 1
        response = self._http.get(base or self.base, params=params,
                                  headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            payload = response.json()
        except ValueError:
            payload = None
        return response.status_code, payload, response.text[:300], str(getattr(response, "url", ""))

    def search(self, term, size=25, offset=0, date_min="2023-01-01"):
        """Ask for complaints that mention a term and have a published story. Returns (status, payload)."""
        self._pace()
        self.requests_made += 1
        params = {
            "search_term": term, "field": "complaint_what_happened", "size": size, "frm": offset,
            "has_narrative": "true", "date_received_min": date_min, "sort": "created_date_desc",
            "no_aggs": "true", "format": "json",
        }
        response = self._http.get(self.base, params=params, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            payload = response.json()
        except ValueError:
            payload = None
        return response.status_code, payload, response.text[:300]


def extract_records(payload):
    """Pull the list of complaints out of a response, whichever shape it comes in."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return [item.get("_source", item) for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        hits = payload.get("hits")
        if isinstance(hits, dict) and isinstance(hits.get("hits"), list):
            return [item.get("_source", item) for item in hits["hits"] if isinstance(item, dict)]
        for key in ("results", "data", "complaints"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def narrative_of(record):
    return record.get("complaint_what_happened") or ""


def id_of(record):
    return str(record.get("complaint_id") or record.get("_id") or "")
