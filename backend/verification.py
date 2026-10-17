"""Verification after a hold: the customer asks the AI analyst to call them back, or types the answers.

The flow, step by step:
  1. A payment is held. In the app, the customer asks for a verification call to their own number.
     The bank never cold-calls: the call exists only because the customer asked for it in the app.
  2. Twilio calls the number. The AI analyst says why the payment is paused and asks two questions:
     one written by Gemini from this case's reasons, and one standard coaching check.
  3. Twilio turns each spoken answer into text and sends it here.
  4. The payment is checked again with the answers as the customer's reply: the same rules, plus
     Gemini's reading of the answers (coached, evasive, secret, contradicting the first note?).
  5. Some holds cannot be talked away: a remote-control app, a flagged receiving account, or a note
     that tried to give the checker orders. Those stay held for a person, whatever is said.

Judges without a phone can type the same two answers instead; the re-check is identical.
Phone numbers are passed to Twilio only; the case keeps the last four digits.
"""

import base64
import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from backend.risk.callback import GENERAL_QUESTIONS, SAFETY_QUESTIONS

PHONE = re.compile(r"^\+[1-9][0-9]{7,14}$")
MAX_ANSWER_CHARS = 500
TWILIO_API = "https://api.twilio.com/2010-04-01"
VOICE = 'voice="Polly.Aditi" language="en-IN"'

# Statuses a verification moves through.
ACTIVE = {"calling", "ringing", "in_call", "checking"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class TwilioConfig:
    """Twilio settings from the environment. Without all four, phone calls are switched off."""

    def __init__(self, env=None):
        env = env if env is not None else os.environ
        self.account_sid = env.get("TWILIO_ACCOUNT_SID", "")
        self.auth_token = env.get("TWILIO_AUTH_TOKEN", "")
        self.from_number = env.get("TWILIO_FROM_NUMBER", "")
        self.public_url = env.get("LMG_PUBLIC_URL", "").rstrip("/")

    @property
    def configured(self):
        return bool(self.account_sid and self.auth_token and self.from_number and self.public_url.startswith("https://"))


def mask_phone(phone):
    return f"•••• {phone[-4:]}"


def choose_questions(brief_questions):
    """Two questions: the first case-specific one from the call-back brief, then the main coaching check."""
    specific = next((question for question in brief_questions if question not in SAFETY_QUESTIONS), GENERAL_QUESTIONS[0])
    return [specific, SAFETY_QUESTIONS[0]]


def new_verification(mode, questions, phone=None):
    return {
        "mode": mode,
        "token": secrets.token_urlsafe(18),
        "status": "calling" if mode == "phone" else "awaiting_answers",
        "questions": questions,
        "answers": [],
        "phone": mask_phone(phone) if phone else None,
        "call_status": None,
        "started_at": now_iso(),
        "outcome": None,
    }


def public_verification(verification):
    """What the browser may see: everything except the call token."""
    if not verification:
        return None
    return {key: value for key, value in verification.items() if key != "token"}


def hard_hold_reason(audit):
    """Why a hold must stay with a person whatever the customer says, or None."""
    audit = audit or {}
    if audit.get("forced_hold"):
        return "The note tried to give orders to the safety check."
    if any(signal.get("name") == "remote_access" for signal in audit.get("behaviour_signals", [])):
        return "A remote-control app was running during the payment, so someone else may be in control."
    if any(signal.get("name") in ("flagged_payee", "flagged_direct_link") for signal in audit.get("network_signals", [])):
        return "The receiving account is linked to an account already flagged for fraud."
    return None


def answer_text(questions, answers):
    """The questions and answers as one reply for the re-check. Empty when the customer said nothing."""
    if not any(answer.strip() for answer in answers):
        return ""
    lines = []
    for index, question in enumerate(questions):
        answer = answers[index].strip() if index < len(answers) else ""
        lines.append(f"Question: {question} Answer: {answer or '(no answer)'}")
    return " ".join(lines)


def summarise_outcome(before, outcome, hard_reason):
    """The re-check's result, with the score before and after, and why a hold was kept if it was."""
    action = outcome["action"]
    kept = None
    if hard_reason and before.get("action") == "hold" and action != "hold":
        action, kept = "hold", hard_reason
    reading = (outcome.get("audit") or {}).get("message_reading") or {}
    return {
        "action": action,
        "score": outcome["score"],
        "reasons": outcome.get("reasons", [])[:4],
        "before_action": before.get("action"),
        "before_score": before.get("score"),
        "kept_hold": kept,
        "degraded": bool(outcome.get("degraded")),
        "reading": {
            "scam_likelihood": reading.get("scam_likelihood"),
            "explanation": reading.get("explanation", ""),
            "coached": bool(reading.get("rehearsed_or_coached")),
            "evasive": bool(reading.get("evasive")),
            "contradicts_first_note": bool(reading.get("contradicts_first_note")),
            "secrecy": reading.get("secrecy"),
            "verified_independently": bool(reading.get("customer_verified_independently")),
        } if reading else None,
        "decided_at": now_iso(),
    }


# ---------- Twilio ----------

def twilio_signature(url, params, auth_token):
    """Twilio's request signature: HMAC-SHA1 of the full URL followed by the sorted form fields."""
    data = url + "".join(key + params[key] for key in sorted(params))
    digest = hmac.new(auth_token.encode(), data.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def valid_signature(url, params, auth_token, given):
    return bool(given) and hmac.compare_digest(twilio_signature(url, params, auth_token), given)


def place_call(config, to, answer_url, status_url, post=None):
    """Ask Twilio to call the customer. Returns the call id. Raises on any failure."""
    import httpx
    post = post or httpx.post
    data = [
        ("To", to), ("From", config.from_number), ("Url", answer_url), ("Method", "POST"),
        ("StatusCallback", status_url), ("StatusCallbackMethod", "POST"),
        ("StatusCallbackEvent", "ringing"), ("StatusCallbackEvent", "answered"), ("StatusCallbackEvent", "completed"),
        ("Timeout", "30"),
    ]
    response = post(f"{TWILIO_API}/Accounts/{config.account_sid}/Calls.json", data=data,
                    auth=(config.account_sid, config.auth_token), timeout=10)
    if response.status_code >= 300:
        raise RuntimeError(f"Twilio refused the call ({response.status_code})")
    return response.json().get("sid", "")


def _say(text):
    return f"<Say {VOICE}>{escape(text)}</Say>"


def twiml_question(question, action_url, intro=None):
    """Ask one question and send the spoken answer to action_url; silence moves on with no answer."""
    url = escape(action_url)
    opening = _say(intro) + '<Pause length="1"/>' if intro else ""
    return ('<?xml version="1.0" encoding="UTF-8"?><Response>' + opening +
            f'<Gather input="speech" action="{url}" method="POST" language="en-IN" speechTimeout="auto" timeout="7">'
            + _say(question) + f'</Gather><Redirect method="POST">{url}</Redirect></Response>')


def twiml_goodbye(text):
    return f'<?xml version="1.0" encoding="UTF-8"?><Response>{_say(text)}<Hangup/></Response>'


def call_intro(case):
    payment = case.get("payment", {})
    amount = f"{payment.get('amount', 0):,.0f} {payment.get('currency', '')}".strip()
    return (f"Hello. This is the Last Mile Guard fraud desk, an automated assistant, calling because you asked us to "
            f"in your banking app. Your payment of {amount} to {payment.get('payee_name', 'a new payee')} is paused "
            f"to protect you. We will never ask for your PIN, password or a one-time code. Please answer two short questions.")


GOODBYE = ("Thank you. We are checking your answers now, and your app will show the result in a moment. "
           "If anyone is telling you what to say, please hang up on them and call the number on your card. Goodbye.")
