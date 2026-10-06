"""A careful web client for the testing agent.

Safety rules built in:
  - it only talks over https,
  - it only talks to your own Cloud Run address (ending in .run.app), unless you name
    one extra host on purpose,
  - it paces itself, so it stays under the site's own speed limit.
"""

import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx


@dataclass
class Reply:
    status: int
    body: Optional[dict]
    text: str


class SiteClient:
    def __init__(self, base_url, allow_host=None, pace_seconds=6.0, sleeper=time.sleep,
                 clock=time.monotonic, client=None, budget=None):
        parsed = urlparse(base_url)
        host = parsed.hostname or ""
        if parsed.scheme != "https":
            raise ValueError("Only https addresses are allowed.")
        if not (host.endswith(".run.app") or (allow_host and host == allow_host)):
            raise ValueError(
                f"Refusing to test {host!r}. Only your own Cloud Run address (ending in .run.app) is allowed."
            )
        self.base = f"https://{host}"
        self.pace_seconds = pace_seconds
        self._sleep = sleeper
        self._clock = clock
        self._last = None
        self._http = client or httpx.Client(timeout=45.0, follow_redirects=False)
        self.requests_made = 0
        self.budget = budget  # optional hard limits, checked before every request

    def _pace(self):
        """Wait so that requests are spaced out."""
        if self._last is not None:
            wait = self.pace_seconds - (self._clock() - self._last)
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()

    def _send(self, method, path, **kwargs):
        if self.budget:
            self.budget.check_request()
        self._pace()
        self.requests_made += 1
        response = self._http.request(method, self.base + path, **kwargs)
        try:
            body = response.json()
        except ValueError:
            body = None
        return Reply(response.status_code, body if isinstance(body, dict) else None, response.text[:500])

    def health(self):
        """Check the home page answers. (Google reserves /healthz on Cloud Run, so we do not use it.)"""
        return self._send("GET", "/")

    def assess(self, payload, retry_on_limit=True):
        """Send one payment check. If the site says "too many requests", wait and try again."""
        reply = self._send("POST", "/api/assess", json=payload)
        tries = 0
        while retry_on_limit and reply.status == 429 and tries < 2:
            self._sleep(30)
            reply = self._send("POST", "/api/assess", json=payload)
            tries += 1
        return reply

    def post_raw(self, body, content_type="application/json"):
        """Send bytes exactly as given, for testing broken input."""
        return self._send("POST", "/api/assess", content=body, headers={"Content-Type": content_type})
