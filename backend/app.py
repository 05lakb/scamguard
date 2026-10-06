"""The web server for Last Mile Guard.

It serves the web pages and one endpoint, /api/assess, that checks a payment.
It keeps no memory between requests: for the second round of a conversation, the
browser sends the first note and the questions back with the customer's answer.

Safety built in:
  - every input is checked for type, range and length,
  - each visitor is slowed down if they send too many requests,
  - a cost guard stops calling Gemini if there are too many calls in an hour, and the
    server then answers using the payment details only,
  - the server never logs what customers wrote.
"""

import logging
import os
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.risk import clarify
from backend.risk.decision import decide
from backend.risk.evidence import load_scam_types, read_message
from backend.service import assess

log = logging.getLogger("lmg")
logging.basicConfig(level=logging.INFO, format="%(message)s")

ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = ROOT / "web" / "dist"

MAX_BODY_BYTES = 20_000
PER_VISITOR_PER_MINUTE = int(os.getenv("LMG_RATE_PER_MINUTE", "12"))
PER_VISITOR_PER_HOUR = int(os.getenv("LMG_RATE_PER_HOUR", "100"))
GEMINI_CALLS_PER_HOUR = int(os.getenv("LMG_GEMINI_PER_HOUR", "300"))


class PaymentIn(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    timestamp: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$")
    payee_name: str = Field(max_length=80)
    payee_type: Literal["individual", "business", "crypto_exchange"]
    is_new_payee: bool
    payee_account_age_days: int = Field(ge=0, le=20_000)
    channel: Literal["mobile", "web"] = "web"
    device_known: bool
    payments_last_24h: int = Field(ge=0, le=50)
    on_live_call: bool
    remote_access_tool_running: bool


class CustomerIn(BaseModel):
    segment: Literal["retiree", "young_professional", "small_business_owner", "student", "family"]
    typical_amount: int = Field(ge=1, le=1_000_000)


class AssessIn(BaseModel):
    payment: PaymentIn
    customer: CustomerIn
    message: Optional[str] = Field(default=None, max_length=2000)
    questions: Optional[list[str]] = Field(default=None, max_length=2)
    answer: Optional[str] = Field(default=None, max_length=1000)


class SlidingWindow:
    """Counts events in the last minute and hour, per key (such as a visitor's address)."""

    def __init__(self, per_minute, per_hour):
        self.per_minute = per_minute
        self.per_hour = per_hour
        self.events = defaultdict(deque)

    def allow(self, key):
        now = time.monotonic()
        queue = self.events[key]
        while queue and now - queue[0] > 3600:
            queue.popleft()
        in_last_minute = sum(1 for moment in queue if now - moment <= 60)
        if in_last_minute >= self.per_minute or len(queue) >= self.per_hour:
            return False
        queue.append(now)
        if len(self.events) > 5000:  # keep memory small
            self.events.pop(next(iter(self.events)))
        return True


def visitor_key(request: Request):
    """Pick an address to count requests against.

    Google's front end adds the real address at the END of X-Forwarded-For, so we use the
    last entry. Anything a visitor writes at the front of the header is ignored.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def create_app(reader=read_message, asker=clarify.ask_questions):
    app = FastAPI(title="Last Mile Guard", docs_url=None, redoc_url=None, openapi_url=None)
    visitors = SlidingWindow(PER_VISITOR_PER_MINUTE, PER_VISITOR_PER_HOUR)
    gemini_budget = SlidingWindow(10**9, GEMINI_CALLS_PER_HOUR)  # one shared counter
    scam_types = load_scam_types()

    @app.middleware("http")
    async def protect(request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.post("/api/assess")
    def assess_payment(body: AssessIn, request: Request):
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."},
                                status_code=429)

        payment = body.payment.model_dump()
        customer = {"id": "web", **body.customer.model_dump()}
        started = time.monotonic()
        degraded = None

        if not gemini_budget.allow("gemini"):
            degraded = "The message reader is paused to keep costs low, so this result uses the payment details only."
        else:
            try:
                outcome = assess(payment, customer, body.message, questions=body.questions,
                                 answer=body.answer, reader=reader, asker=asker, scam_types=scam_types)
            except Exception as error:  # never show internal details to the visitor
                log.warning("assess failed: %s", type(error).__name__)
                degraded = "The message reader is busy right now, so this result uses the payment details only."

        if degraded:
            outcome = decide(payment, customer, None, scam_types)
            outcome["round"] = 2 if body.answer is not None else 1
            outcome["degraded"] = True
            outcome["notice"] = degraded

        log.info("assess action=%s score=%s round=%s degraded=%s ms=%d", outcome["action"], outcome["score"],
                 outcome.get("round"), bool(degraded), (time.monotonic() - started) * 1000)
        return outcome

    if WEB_DIST.exists():
        app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
    return app


app = create_app()
