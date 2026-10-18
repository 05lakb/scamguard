"""The web server for the Last Mile Guard prototype.

It serves the web pages and an assessment endpoint that checks a payment.
The check itself keeps no memory between requests: for the second round of a conversation,
the browser sends the first note and the questions back with the customer's answer.
Finished assessments and analyst decisions are saved as cases (Firestore when switched on),
so the analyst queue survives a page refresh. Saving never changes a recommendation.
Cases belong to the browser that created them (its X-LMG-Session key) and expire after 24 hours.

Safety built in:
  - every input is checked for type, range and length,
  - each visitor is slowed down if they send too many requests,
  - a cost guard stops calling Gemini if there are too many calls in an hour, and the
    server then answers using the payment details only,
  - the server never logs what customers wrote.
"""

import hmac
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

from urllib.parse import parse_qsl

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import arena as arena_module
from backend import gemini_client
from backend.risk import clarify, conversation
from backend.risk.callback import callback_brief
from backend.risk.decision import decide
from backend.risk.evidence import load_scam_types, read_message
from backend.risk.playbook import playbook
from backend.risk.translate import translate_warning
from backend import verification as verify
from backend.service import assess, assess_steps
from backend.store import case_record, note_record, owner_of, public_case, store_from_environment

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
# Verification calls after a hold (Twilio): a few per visitor, and a hard cap for the whole demo.
CALLS_PER_VISITOR_PER_HOUR = int(os.getenv("LMG_CALLS_PER_VISITOR_HOUR", "4"))
CALLS_PER_HOUR = int(os.getenv("LMG_CALLS_PER_HOUR", "20"))
SESSION_HEADER = "x-lmg-session"
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


class DecisionIn(BaseModel):
    """An analyst's decision on a saved case."""
    status: Literal["approved", "held", "escalated"]
    analyst: str = Field(default="analyst", min_length=1, max_length=40)


CaseId = Annotated[str, Field(pattern=r"^[0-9a-f]{12}$")]


class NoteIn(BaseModel):
    """One call-log entry: the customer's call, the analyst's notes from it, or a Voice AI check of those notes."""
    kind: Literal["call", "note", "check"]
    text: str = Field(min_length=1, max_length=2000)
    author: str = Field(default="analyst", min_length=1, max_length=40)


class VerificationIn(BaseModel):
    """Start a verification after a hold: a voice call in the app, an AI call to the customer's own number, or typed answers."""
    mode: Literal["voice", "phone", "typed"]
    phone: Optional[str] = Field(default=None, max_length=16)


class AnswersIn(BaseModel):
    answers: list[Annotated[str, Field(max_length=verify.MAX_ANSWER_CHARS)]] = Field(min_length=1, max_length=2)


class CallbackIn(BaseModel):
    """A warned or held case, sent so the analyst can get call-back questions before phoning the customer."""
    action: Literal["warn", "hold"]
    score: int = Field(ge=0, le=100)
    amount: float = Field(gt=0, le=10_000_000)
    currency: str = Field(min_length=3, max_length=3)
    payee_type: Optional[Literal["individual", "business", "crypto_exchange"]] = None
    typology: Optional[str] = Field(default=None, max_length=40)
    reasons: list[Annotated[str, Field(max_length=400)]] = Field(default_factory=list, max_length=6)
    message: Optional[str] = Field(default=None, max_length=2000)
    questions: Optional[list[Annotated[str, Field(max_length=300)]]] = Field(default=None, max_length=2)
    answer: Optional[str] = Field(default=None, max_length=1000)


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


def create_app(reader=read_message, asker=clarify.ask_questions, arena_writer=None, translator=translate_warning,
               store=None, callback_writer=None, twilio=None, call_placer=None):
    store = store if store is not None else store_from_environment()
    twilio = twilio if twilio is not None else verify.TwilioConfig()
    place_call = call_placer or verify.place_call
    call_visitors = SlidingWindow(2, CALLS_PER_VISITOR_PER_HOUR)  # verification calls cost money: a few per visitor
    call_total = SlidingWindow(10**9, CALLS_PER_HOUR)
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
        return {"ok": True, "ai_configured": gemini_client.is_configured(), "storage": store.kind}

    @app.get("/api/playbook")
    def scam_playbook():
        """The scam types the message reader is given, with red flags and the public advice they come from."""
        return {"types": playbook(scam_types)}

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

    def assessment_events(body: AssessIn, owner=None):
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
        # Save the case. A failed save is reported, never allowed to change the recommendation.
        outcome["execution"]["saved"] = store.save_case(case_record(
            request_id, payment, customer, body.message, body.questions, body.answer, outcome, owner, network))

        log.info("assess request_id=%s action=%s score=%s round=%s mode=%s degraded=%s ms=%d",
                 outcome["execution"]["request_id"], outcome["action"], outcome["score"],
                 outcome.get("round"), message_mode, bool(degraded), outcome["execution"]["duration_ms"])
        yield event("decision", "complete", "Recommendation ready: " + outcome["action"] + ".", score=outcome["score"])
        yield {"type": "result", "request_id": request_id, "result": outcome}

    @app.post("/api/assess")
    def assess_payment(body: AssessIn, request: Request):
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        for event in assessment_events(body, owner_of(request.headers.get(SESSION_HEADER))):
            if event["type"] == "result":
                return event["result"]

    @app.post("/api/assess/stream")
    def stream_payment(body: AssessIn, request: Request):
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        owner = owner_of(request.headers.get(SESSION_HEADER))

        def lines():
            try:
                for event in assessment_events(body, owner):
                    yield json.dumps(event) + "\n"
            except Exception:
                log.warning("assessment stream could not finish")
                yield json.dumps({"type": "error", "detail": "The assessment could not finish. No final result was received."}) + "\n"
        return StreamingResponse(lines(), media_type="application/x-ndjson",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    @app.get("/api/cases")
    def list_cases(request: Request, limit: int = 20):
        """This browser's recent saved cases that reached a recommendation (not ones still waiting for an answer)."""
        limit = max(1, min(limit, 50))
        owner = owner_of(request.headers.get(SESSION_HEADER))
        cases = [case for case in store.recent_cases(owner, limit * 2) if case.get("action") != "ask"][:limit]
        return {"storage": store.kind, "cases": cases}

    @app.post("/api/cases/{case_id}/decision")
    def record_decision(case_id: CaseId, body: DecisionIn, request: Request):
        """Save an analyst's approve, hold or escalate decision under the case."""
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        if store.kind == "off":
            return JSONResponse({"detail": "Case storage is switched off on this server."}, status_code=503)
        owner = owner_of(request.headers.get(SESSION_HEADER))
        if owner is None:
            return JSONResponse({"detail": "A session key is required to record a decision."}, status_code=401)
        analyst = " ".join(body.analyst.split())[:40] or "analyst"
        saved = store.record_decision(case_id, owner, body.status, analyst)
        if saved is None:
            return JSONResponse({"detail": "The case was not found or could not be updated."}, status_code=404)
        log.info("decision case=%s status=%s", case_id, body.status)  # the analyst's name is not logged
        return saved

    @app.post("/api/cases/{case_id}/notes")
    def add_note(case_id: CaseId, body: NoteIn, request: Request):
        """Add to a saved case's call log. Only the browser that owns the case can write to it."""
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        if store.kind == "off":
            return JSONResponse({"detail": "Case storage is switched off on this server."}, status_code=503)
        owner = owner_of(request.headers.get(SESSION_HEADER))
        if owner is None:
            return JSONResponse({"detail": "A session key is required to add to a case."}, status_code=401)
        text = re.sub(r"[\x00-\x08\x0b-\x1f]", " ", body.text).strip()
        author = " ".join(body.author.split())[:40] or "analyst"
        saved = store.add_note(case_id, owner, note_record(body.kind, text, author))
        if saved is None:
            return JSONResponse({"detail": "The case was not found, is full, or could not be updated."}, status_code=404)
        log.info("note case=%s kind=%s", case_id, body.kind)  # the note itself is never logged
        return saved

    # ---------- verification after a hold: an AI call the customer asks for, or typed answers ----------

    def own_case(case_id, request):
        """This browser's live case, or an error response."""
        if store.kind == "off":
            return None, JSONResponse({"detail": "Case storage is switched off on this server."}, status_code=503)
        owner = owner_of(request.headers.get(SESSION_HEADER))
        if owner is None:
            return None, JSONResponse({"detail": "A session key is required."}, status_code=401)
        case = store.get_case(case_id)
        if case is None or case.get("owner") != owner:
            return None, JSONResponse({"detail": "The case was not found."}, status_code=404)
        return case, None

    def verified_case(case):
        """The case as its browser sees it, with the verification but never the call token."""
        shown = public_case(case)
        shown["verification"] = verify.public_verification(case.get("verification"))
        return shown

    def recheck(case_id):
        """Check the held payment again with the customer's answers, and save the result on the case."""
        case = store.get_case(case_id)
        if case is None or not case.get("verification"):
            return None
        state = dict(case["verification"])
        reply = verify.answer_text(state["questions"], state["answers"])
        customer = {"id": "web", **case["customer"]}
        try:
            if not (gemini_client.is_configured() and gemini_budget.allow("gemini")):
                raise RuntimeError("budget")
            outcome = assess(case["payment"], customer, case.get("message"), questions=state["questions"],
                             answer=reply, reader=reader, asker=asker, scam_types=scam_types, network=case.get("network"))
        except Exception as error:
            # Gemini unavailable: the answers cannot be read, so they cannot lower the risk.
            # The original decision stands for a person; an outage never releases a hold.
            log.warning("verification recheck fallback: %s", type(error).__name__)
            outcome = decide(case["payment"], customer, None, scam_types, asked=True, network=case.get("network"))
            outcome.update(action=case["action"], score=max(case["score"], outcome["score"]), degraded=True,
                           reasons=["The answers could not be read automatically, so the original decision stands."]
                           + case.get("reasons", [])[:3])
        summary = verify.summarise_outcome(case, outcome, verify.hard_hold_reason(case.get("audit")))
        # Voice AI also scans what was said, the same check as the Voice AI page: OTP requests,
        # impersonation, secrecy, pressure, remote access. It explains; the rules above decide.
        spoken = " ".join(answer for answer in state["answers"] if answer.strip())
        if spoken:
            try:
                use_ai = gemini_client.is_configured() and gemini_budget.allow("gemini")
                voice = conversation.analyse(spoken[:4000], reader=reader if use_ai else None, scam_types=scam_types)
                summary["voice"] = {"risk_level": voice["risk_level"], "scam_likelihood": voice["scam_likelihood"],
                                    "tactics": voice.get("tactics", [])[:6], "source": voice.get("source")}
            except Exception as error:
                log.warning("verification voice check failed: %s", type(error).__name__)
        state.update(status="done", outcome=summary)
        # The re-check is a recommendation for the analyst. The case keeps its decision until a person
        # approves, keeps on hold or escalates it, so it stays in the review queue.
        store.update_case(case_id, {"verification": state})
        log.info("verification done case=%s recommends=%s kept=%s", case_id, summary["action"], bool(summary["kept_hold"]))
        return state

    @app.post("/api/cases/{case_id}/verification")
    def start_verification(case_id: CaseId, body: VerificationIn, request: Request):
        """Start a verification on a warned or held case: call the customer's own number, or show typed questions."""
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        case, problem = own_case(case_id, request)
        if problem:
            return problem
        if case.get("action") not in ("warn", "hold"):
            return JSONResponse({"detail": "Only a warned or held payment needs verifying."}, status_code=409)
        current = case.get("verification") or {}
        if current.get("status") in verify.ACTIVE:
            return JSONResponse({"detail": "A verification is already in progress for this payment."}, status_code=409)
        phone = (body.phone or "").replace(" ", "")
        if body.mode == "phone":
            if not twilio.configured:
                return JSONResponse({"detail": "Phone calls are not set up on this server. Please type the answers instead."},
                                    status_code=503)
            if not verify.PHONE.fullmatch(phone):
                return JSONResponse({"detail": "Enter the number with its country code, for example +919812345678."},
                                    status_code=422)
            if not call_visitors.allow(visitor_key(request)) or not call_total.allow("calls"):
                return JSONResponse({"detail": "Verification calls are paused for now to keep costs low. Please type the answers."},
                                    status_code=429)
        use_ai = gemini_client.is_configured() and gemini_budget.allow("gemini")
        brief = callback_brief({**case["payment"], "action": case["action"], "score": case["score"],
                                "typology": ((case.get("audit") or {}).get("message_reading") or {}).get("matched_typology"),
                                "reasons": case.get("reasons", []), "message": case.get("message"),
                                "questions": case.get("questions"), "answer": case.get("answer")},
                               ask=callback_writer, use_ai=use_ai)
        state = verify.new_verification(body.mode, verify.choose_questions(brief["questions"]), phone or None)
        if body.mode == "phone":
            query = f"case={case_id}&t={state['token']}"
            try:
                state["call_sid"] = place_call(twilio, phone, f"{twilio.public_url}/api/twilio/voice?{query}&step=0",
                                               f"{twilio.public_url}/api/twilio/status?{query}")
            except Exception as error:
                log.warning("verification call failed: %s", type(error).__name__)  # the number is never logged
                return JSONResponse({"detail": "The call could not be placed. Please type the answers instead."}, status_code=502)
        if not store.update_case(case_id, {"verification": state}):
            return JSONResponse({"detail": "The verification could not be saved."}, status_code=503)
        log.info("verification started case=%s mode=%s", case_id, body.mode)
        return verified_case({**case, "verification": state})

    @app.post("/api/cases/{case_id}/verification/answers")
    def typed_answers(case_id: CaseId, body: AnswersIn, request: Request):
        """The typed fallback: the customer's answers to the same questions, then the same re-check."""
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        case, problem = own_case(case_id, request)
        if problem:
            return problem
        state = case.get("verification")
        if not state or state.get("status") in ("done", "checking"):
            return JSONResponse({"detail": "Start a verification first."}, status_code=409)
        clean = [re.sub(r"[\x00-\x08\x0b-\x1f]", " ", answer).strip() for answer in body.answers]
        mode = state.get("mode") if state.get("mode") in ("voice", "typed") else "typed"  # a missed phone call becomes typed
        state = {**state, "mode": mode, "answers": clean, "status": "checking"}
        store.update_case(case_id, {"verification": state})
        recheck(case_id)
        return verified_case(store.get_case(case_id) or case)

    @app.get("/api/cases/{case_id}")
    def get_case(case_id: CaseId, request: Request):
        """One of this browser's cases, with its verification. The page polls this during a call."""
        case, problem = own_case(case_id, request)
        return problem or verified_case(case)

    # ---------- Twilio webhooks: only Twilio, signed with the account's token, and only for a live call token ----------

    async def twilio_request(request):
        params = dict(parse_qsl((await request.body()).decode("utf-8", "replace"), keep_blank_values=True))
        url = f"{twilio.public_url}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
        if not twilio.configured or not verify.valid_signature(url, params, twilio.auth_token,
                                                                request.headers.get("x-twilio-signature", "")):
            return None, None, None
        case_id, token = request.query_params.get("case", ""), request.query_params.get("t", "")
        case = store.get_case(case_id) if re.fullmatch(r"[0-9a-f]{12}", case_id) else None
        state = (case or {}).get("verification") or {}
        if not token or not hmac.compare_digest(state.get("token", ""), token):
            return None, None, None
        return case, state, params

    def twiml(xml):
        return Response(content=xml, media_type="application/xml")

    @app.post("/api/twilio/voice")
    async def twilio_voice(request: Request):
        case, state, _ = await twilio_request(request)
        if case is None:
            return Response(status_code=403)
        state = {**state, "status": "in_call"}
        store.update_case(case["id"], {"verification": state})
        action = f"{twilio.public_url}/api/twilio/answer?case={case['id']}&t={state['token']}&step=0"
        return twiml(verify.twiml_question(state["questions"][0], action, intro=verify.call_intro(case)))

    @app.post("/api/twilio/answer")
    async def twilio_answer(request: Request, background: BackgroundTasks):
        case, state, params = await twilio_request(request)
        if case is None:
            return Response(status_code=403)
        step = int(request.query_params.get("step", "0")) if request.query_params.get("step", "0").isdigit() else 0
        answers = list(state.get("answers", []))
        if len(answers) == step:  # Twilio may retry a request; record each answer once
            answers.append(re.sub(r"[\x00-\x08\x0b-\x1f]", " ", params.get("SpeechResult", "")).strip()[:verify.MAX_ANSWER_CHARS])
        state = {**state, "answers": answers}
        if step + 1 < len(state["questions"]):
            store.update_case(case["id"], {"verification": state})
            action = f"{twilio.public_url}/api/twilio/answer?case={case['id']}&t={state['token']}&step={step + 1}"
            return twiml(verify.twiml_question(state["questions"][step + 1], action))
        store.update_case(case["id"], {"verification": {**state, "status": "checking"}})
        background.add_task(recheck, case["id"])
        return twiml(verify.twiml_goodbye(verify.GOODBYE))

    @app.post("/api/twilio/status")
    async def twilio_status(request: Request, background: BackgroundTasks):
        case, state, params = await twilio_request(request)
        if case is None:
            return Response(status_code=403)
        call_status = params.get("CallStatus", "")
        update = {**state, "call_status": call_status}
        if call_status == "ringing" and state.get("status") == "calling":
            update["status"] = "ringing"
        if call_status in ("busy", "no-answer", "failed", "canceled"):
            update["status"] = "no_answer"
        elif call_status == "completed" and state.get("status") in ("calling", "ringing", "in_call"):
            # The customer hung up before answering everything: check with what was said.
            update["status"] = "checking" if any(answer.strip() for answer in state.get("answers", [])) else "no_answer"
            if update["status"] == "checking":
                background.add_task(recheck, case["id"])
        store.update_case(case["id"], {"verification": update})
        return Response(status_code=204)

    @app.post("/api/callback-brief")
    def prepare_callback(body: CallbackIn, request: Request):
        """A short brief and questions for the analyst's call-back."""
        if not visitors.allow(visitor_key(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a minute and try again."}, status_code=429)
        use_ai = gemini_client.is_configured() and gemini_budget.allow("gemini")
        brief = callback_brief(body.model_dump(), ask=callback_writer, use_ai=use_ai)
        log.info("callback brief action=%s source=%s", body.action, brief["source"])  # the customer's words are not logged
        return brief

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
