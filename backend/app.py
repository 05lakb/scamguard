"""The web server for the Last Mile Guard prototype.

It serves the web pages and an assessment endpoint that checks a payment.
It keeps no memory between requests: for the second round of a conversation, the
browser sends the first note and the questions back with the customer's answer.

Safety built in:
  - every input is checked for type, range and length,
  - each visitor is slowed down if they send too many requests,
  - a cost guard stops calling Gemini if there are too many calls in an hour, and the
    server then answers using the payment details only,
  - the server never logs what customers wrote.
"""

import json
import logging
import os
import random
import re
import threading
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Annotated, Literal, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import arena as arena_module
from backend import gemini_client
from backend.risk import clarify, conversation
from backend.risk.decision import decide
from backend.risk.evidence import load_scam_types, read_message
from backend.risk.translate import translate_warning
from backend.service import assess_steps

log = logging.getLogger("lmg")
logging.basicConfig(level=logging.INFO, format="%(message)s")

ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = ROOT / "web" / "dist"
HASHED_ASSET = re.compile(r"^/assets/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$")

FALLBACK_REASONS = {
    "configuration": "Message analysis is not configured on this server.",
    "authentication": "The message service rejected its credentials or access permissions.",
    "quota": "The message service's quota or rate limit was reached.",
    "timeout": "Message analysis exceeded its request time limit.",
    "model_unavailable": "The configured message model is unavailable.",
    "budget": "Message analysis is paused by the demo's hourly limit.",
    "unavailable": "Message analysis could not complete.",
}

MAX_BODY_BYTES = 20_000
PER_VISITOR_PER_MINUTE = int(os.getenv("LMG_RATE_PER_MINUTE", "12"))
PER_VISITOR_PER_HOUR = int(os.getenv("LMG_RATE_PER_HOUR", "100"))
GEMINI_CALLS_PER_HOUR = int(os.getenv("LMG_GEMINI_PER_HOUR", "300"))
# The live red-team run: how often visitors may start one, and how many can run at once.
ARENA_ENABLED = os.getenv("LMG_ARENA", "1") == "1"
ARENA_PER_VISITOR_PER_HOUR = int(os.getenv("LMG_ARENA_PER_VISITOR_HOUR", "5"))
ARENA_RUNS_PER_HOUR = int(os.getenv("LMG_ARENA_PER_HOUR", "10"))
ARENA_AT_ONCE = int(os.getenv("LMG_ARENA_AT_ONCE", "2"))
# A visitor's own scenario: one a minute and a few an hour for each visitor, and a lower total than the live run.
CUSTOM_PER_VISITOR_PER_HOUR = int(os.getenv("LMG_CUSTOM_PER_VISITOR_HOUR", "8"))
CUSTOM_PER_HOUR = int(os.getenv("LMG_CUSTOM_PER_HOUR", "40"))


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
    location_changed: bool = False
    # What the customer did over the last 15 days (all optional).
    payments_last_15d: Optional[int] = Field(default=None, ge=0, le=1000)
    spend_last_15d: Optional[float] = Field(default=None, ge=0, le=10_000_000)
    payee_count_15d: Optional[int] = Field(default=None, ge=0, le=1000)
    payee_total_15d: Optional[float] = Field(default=None, ge=0, le=10_000_000)


class CustomerIn(BaseModel):
    segment: Literal["retiree", "young_professional", "small_business_owner", "student", "family"]
    typical_amount: int = Field(ge=1, le=1_000_000)
    typical_spend_15d: Optional[int] = Field(default=None, ge=1, le=10_000_000)


AccountId = Annotated[str, Field(min_length=1, max_length=64)]


class TransferIn(BaseModel):
    from_account_id: AccountId
    to_account_id: AccountId
    amount: float = Field(gt=0, le=10_000_000, allow_inf_nan=False)
    hours_ago: float = Field(ge=0, le=720, allow_inf_nan=False)


class NetworkIn(BaseModel):
    """Small synthetic graph for the MuleNet prototype, never customer-supplied bank evidence."""
    payee_account_id: AccountId
    flagged_account_ids: list[AccountId] = Field(default_factory=list, max_length=50)
    transfers: list[TransferIn] = Field(default_factory=list, max_length=100)


class AssessIn(BaseModel):
    payment: PaymentIn
    customer: CustomerIn
    network: Optional[NetworkIn] = None
    message: Optional[str] = Field(default=None, max_length=2000)
    questions: Optional[list[str]] = Field(default=None, max_length=2)
    answer: Optional[str] = Field(default=None, max_length=1000)
    # The customer's language, for the warning only. English or nothing means no translation.
    language: Optional[Literal["en", "hi", "es", "fr", "pt", "ar"]] = None


class ConversationIn(BaseModel):
    """A call transcript or chat pasted, uploaded as text, or captured by the browser's speech recogniser."""
    transcript: str = Field(min_length=1, max_length=4000)


class ArenaIn(BaseModel):
    count: int = Field(default=8, ge=3, le=9)


class CustomIn(BaseModel):
    """A visitor's own made-up scenario: a story, and the payment details around it."""
    story: str = Field(min_length=20, max_length=400)
    role: Literal["victim", "genuine"]
    coached: bool = False
    customer: CustomerIn
    amount: float = Field(gt=0, le=1_000_000)
    payee_name: str = Field(min_length=1, max_length=60)
    payee_type: Literal["individual", "business", "crypto_exchange"]
    is_new_payee: bool
    payee_account_age_days: int = Field(ge=0, le=20_000)
    device_known: bool
    payments_last_24h: int = Field(ge=0, le=50)
    on_live_call: bool
    remote_access_tool_running: bool


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


def create_app(reader=read_message, asker=clarify.ask_questions, arena_writer=None, translator=translate_warning):
    app = FastAPI(title="Last Mile Guard", docs_url=None, redoc_url=None, openapi_url=None)
    visitors = SlidingWindow(PER_VISITOR_PER_MINUTE, PER_VISITOR_PER_HOUR)
    gemini_budget = SlidingWindow(10**9, GEMINI_CALLS_PER_HOUR)  # one shared counter
    scam_types = load_scam_types()
    arena_visitors = SlidingWindow(1, ARENA_PER_VISITOR_PER_HOUR)  # one a minute, a few an hour
    arena_total = SlidingWindow(10**9, ARENA_RUNS_PER_HOUR)
    arena_slots = threading.BoundedSemaphore(ARENA_AT_ONCE)  # live runs and own scenarios share these places
    custom_visitors = SlidingWindow(1, CUSTOM_PER_VISITOR_PER_HOUR)
    custom_total = SlidingWindow(10**9, CUSTOM_PER_HOUR)
    write_for_arena = arena_writer or (lambda prompt: gemini_client.ask(prompt, model=gemini_client.FAST_MODEL))

    @app.middleware("http")
    async def protect(request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            response = JSONResponse({"detail": "Request too large."}, status_code=413)
        else:
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
        elif response.status_code in (200, 206, 304) and HASHED_ASSET.fullmatch(request.url.path):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            # Revalidate HTML, unversioned files and errors after each deployment.
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/api/health")
    def health():
        return {"ok": True, "ai_configured": gemini_client.is_configured()}

    @app.post("/api/conversation")
    def analyse_conversation(body: ConversationIn, request: Request):
        """Voice AI: score a call transcript for social-engineering patterns."""
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."},
                                status_code=429)
        use_ai = gemini_client.is_configured() and gemini_budget.allow("gemini")
        started = time.monotonic()
        result = conversation.analyse(body.transcript, reader=reader if use_ai else None, scam_types=scam_types)
        if not use_ai and "notice" not in result:
            result["notice"] = "AI reading is not configured or is paused, so this result uses phrase rules only."
        result["duration_ms"] = int((time.monotonic() - started) * 1000)
        log.info("conversation level=%s source=%s ms=%d", result["risk_level"], result["source"], result["duration_ms"])
        return result

    def assessment_events(body: AssessIn):
        payment = body.payment.model_dump()
        customer = {"id": "web", **body.customer.model_dump()}
        network = body.network.model_dump() if body.network else None
        started = time.monotonic()
        request_id = uuid.uuid4().hex[:12]
        active_stage = "request"
        def event(stage, status, detail, **extra):
            return {"type": "stage", "request_id": request_id, "stage": stage,
                    "status": status, "detail": detail,
                    "elapsed_ms": round((time.monotonic() - started) * 1000), **extra}
        yield event("request", "complete", "Payment request validated by the backend.")
        degraded = None
        fallback_reason = None

        needs_model = bool(body.message) or body.answer is not None or clarify.should_ask(
            body.message, None, decide(payment, customer, None, scam_types, network=network)
        )
        if needs_model and not gemini_budget.allow("gemini"):
            fallback_reason = "budget"
        else:
            try:
                steps = assess_steps(payment, customer, body.message, questions=body.questions,
                                     answer=body.answer, reader=reader, asker=asker,
                                     scam_types=scam_types, network=network)
                while True:
                    try:
                        step = next(steps)
                    except StopIteration as finished:
                        outcome = finished.value
                        break
                    active_stage = step["stage"]
                    yield event(**step)
            except Exception as error:  # never show internal details to the visitor
                log.warning("assess failed: %s", type(error).__name__)
                fallback_reason = gemini_client.failure_reason(error)

        if fallback_reason:
            yield event(active_stage if fallback_reason != "budget" else "message", "failed", FALLBACK_REASONS[fallback_reason])
            yield event("decision", "running", "Applying fallback rules using the available payment and network evidence.")
            degraded = FALLBACK_REASONS[fallback_reason] + (
                " This recommendation uses payment checks and the supplied account links."
                if network is not None else " This recommendation uses payment checks only."
            )
            outcome = decide(payment, customer, None, scam_types, network=network)
            outcome["round"] = 2 if body.answer is not None else 1
            outcome["degraded"] = True
            outcome["notice"] = degraded
            if fallback_reason == "budget":
                yield event("behaviour", "complete", "Payment rules completed for the fallback recommendation.", score=outcome["audit"]["behaviour_score"])
                yield event("network", "complete" if network is not None else "skipped",
                            "Account-link rules completed." if network is not None else "No account graph supplied for this case.",
                            score=outcome["audit"]["network_score"])
            if active_stage != "clarify":
                yield event("clarify", "skipped", "Follow-up generation unavailable in this fallback run.")

        # Put the warning in the customer's language, if asked. The English warning stays as the record.
        if body.language and body.language != "en" and outcome.get("customer_warning"):
            translated = None
            if gemini_budget.allow("gemini"):
                try:
                    translated = translator(outcome["customer_warning"], body.language)
                except Exception as error:  # a failed translation must never break the decision
                    log.warning("translate failed: %s", type(error).__name__)
            if translated:
                outcome["customer_warning_translated"] = translated
                outcome["warning_language"] = body.language
            else:
                outcome["warning_language"] = "en"  # tell the page we fell back to English

        reading = outcome.get("audit", {}).get("message_reading")
        if degraded:
            message_mode = "fallback_payment_only"
        elif not reading:
            message_mode = "not_requested"
        elif reader is not read_message:
            message_mode = "injected_reader"  # Only used by automated tests.
        elif reading.get("from_cache"):
            message_mode = "gemini_cached"
        else:
            message_mode = "gemini_live"
        outcome["execution"] = {
            "request_id": request_id,
            "backend": "FastAPI /api/assess",
            "duration_ms": round((time.monotonic() - started) * 1000),
            "message_mode": message_mode,
            "network_checked": network is not None,
            "model": gemini_client.FAST_MODEL if message_mode.startswith("gemini_") else None,
            "fallback_reason": fallback_reason,
        }

        log.info("assess request_id=%s action=%s score=%s round=%s mode=%s degraded=%s ms=%d",
                 outcome["execution"]["request_id"], outcome["action"], outcome["score"],
                 outcome.get("round"), message_mode, bool(degraded), outcome["execution"]["duration_ms"])
        yield event("decision", "complete", "Recommendation ready: " + outcome["action"] + ".", score=outcome["score"])
        yield {"type": "result", "request_id": request_id, "result": outcome}

    @app.post("/api/assess")
    def assess_payment(body: AssessIn, request: Request):
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        for event in assessment_events(body):
            if event["type"] == "result":
                return event["result"]

    @app.post("/api/assess/stream")
    def stream_payment(body: AssessIn, request: Request):
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        def lines():
            try:
                for event in assessment_events(body):
                    yield json.dumps(event) + "\n"
            except Exception:
                log.warning("assessment stream could not finish")
                yield json.dumps({"type": "error", "detail": "The assessment could not finish. No final result was received."}) + "\n"
        return StreamingResponse(lines(), media_type="application/x-ndjson",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    @app.post("/api/arena")
    def arena_run(body: ArenaIn, request: Request):
        """Play made-up scenarios against the guard and stream each result as it is decided."""
        if not ARENA_ENABLED:
            return JSONResponse({"detail": "The live red-team run is switched off."}, status_code=403)
        if not arena_visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Please wait a few minutes between live runs."}, status_code=429)
        if not arena_total.allow("arena"):
            return JSONResponse({"detail": "Live runs are paused for now to keep costs low. Try again later."},
                                status_code=429)
        if not arena_slots.acquire(blocking=False):
            return JSONResponse({"detail": "Two live runs are already going. Please try again in a minute."},
                                status_code=429)
        seed = random.SystemRandom().randrange(1, 10**6)

        def lines():
            try:
                for event in arena_module.stream_run(body.count, seed, write_for_arena, reader, asker, scam_types):
                    yield json.dumps(event) + "\n"
            finally:
                arena_slots.release()

        log.info("arena run started count=%d", body.count)
        return StreamingResponse(lines(), media_type="application/x-ndjson",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    @app.post("/api/custom")
    def custom_run(body: CustomIn, request: Request):
        """Play one scenario a visitor described, and stream the result like a live run."""
        if not ARENA_ENABLED:
            return JSONResponse({"detail": "Own scenarios are switched off."}, status_code=403)
        text = re.sub(r"[\x00-\x08\x0b-\x1f]", " ", f"{body.story} {body.payee_name}")
        try:
            gemini_client.safe_to_send(text)
        except ValueError:
            return JSONResponse({"detail": "Email addresses and card numbers are blocked for safety. Please leave them out."},
                                status_code=422)
        if not custom_visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Please wait a minute between your own scenarios."}, status_code=429)
        if not custom_total.allow("custom") or not gemini_budget.allow("gemini"):
            return JSONResponse({"detail": "Own scenarios are paused for now to keep costs low. Try again later."},
                                status_code=429)
        if not arena_slots.acquire(blocking=False):
            return JSONResponse({"detail": "The guard is busy with other runs. Please try again in a minute."},
                                status_code=429)

        payment = {
            "amount": body.amount, "payee_name": " ".join(body.payee_name.split()), "payee_type": body.payee_type,
            "is_new_payee": body.is_new_payee, "payee_account_age_days": body.payee_account_age_days,
            "device_known": body.device_known, "payments_last_24h": body.payments_last_24h,
            "on_live_call": body.on_live_call, "remote_access_tool_running": body.remote_access_tool_running,
        }
        scenario = arena_module.custom_scenario(" ".join(body.story.split()), body.role, body.coached,
                                                body.customer.model_dump(), payment)

        def lines():
            try:
                for event in arena_module.stream_scenarios([scenario], write_for_arena, reader, asker, scam_types):
                    yield json.dumps(event) + "\n"
            finally:
                arena_slots.release()

        log.info("custom scenario started role=%s", body.role)  # the visitor's text is never logged
        return StreamingResponse(lines(), media_type="application/x-ndjson",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    if WEB_DIST.exists():
        app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
    return app


app = create_app()
