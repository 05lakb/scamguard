"""One place that sets up the connection to Gemini.

Everything else in the project asks this file for a ready-to-use client, so the
key and model names are only handled here.
"""

import os
import re
import time
from pathlib import Path

# On some company networks, web traffic is re-signed with a company certificate.
# This tells Python to trust the same certificates the Windows system trusts,
# without turning off any security checks. If it is not installed, we carry on.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

from dotenv import load_dotenv
from google import genai
from google.genai import types

# Read the secret key from the local ".env" file (never stored in git).
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# A cheap, quick model for everyday work, and a stronger one for harder calls.
FAST_MODEL = os.getenv("GEMINI_FAST_MODEL") or "gemini-3.5-flash-lite"
SMART_MODEL = os.getenv("GEMINI_SMART_MODEL") or "gemini-3.8-flash"

# When USE_VERTEX is "1" the app talks to Gemini through Google Cloud (Vertex AI).
# The newer models are only offered through the "global" location.
USE_VERTEX = os.getenv("USE_VERTEX") == "1"
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION") or "global"

# Saving answers to disk is handy when testing. A live server keeps them in memory instead.
DISK_CACHE = os.getenv("LMG_DISK_CACHE", "1") == "1"
REQUEST_TIMEOUT_MS = max(1000, min(int(os.getenv("GEMINI_TIMEOUT_MS", "20000")), 60000))

_client = None


class ConfigurationError(RuntimeError):
    """Required local model configuration is missing."""


def failure_reason(error):
    """Return a public category, never a provider error body or credential."""
    if isinstance(error, ConfigurationError):
        return "configuration"
    if "timeout" in type(error).__name__.lower():
        return "timeout"
    code = getattr(error, "code", None)
    if code in (401, 403):
        return "authentication"
    if code == 429:
        return "quota"
    if code == 404:
        return "model_unavailable"
    if code in (408, 504):
        return "timeout"
    return "unavailable"


def is_configured():
    """True when a Gemini key or a Vertex AI project is set, so AI reading can be attempted."""
    if USE_VERTEX:
        return bool(os.getenv("GOOGLE_CLOUD_PROJECT"))
    return bool(os.getenv("GEMINI_API_KEY"))


def get_client():
    """Return the shared Gemini client, creating it the first time."""
    global _client
    if _client is None:
        # Keep SDK retries from multiplying the application's attempt count.
        http_options = types.HttpOptions(
            timeout=REQUEST_TIMEOUT_MS,
            retry_options=types.HttpRetryOptions(attempts=1),
        )
        if USE_VERTEX:
            # On Google Cloud the app proves who it is with its own identity, so no key is needed.
            project = os.getenv("GOOGLE_CLOUD_PROJECT")
            if not project:
                raise ConfigurationError("GOOGLE_CLOUD_PROJECT is missing, so Vertex AI cannot be used.")
            _client = genai.Client(vertexai=True, project=project, location=VERTEX_LOCATION, http_options=http_options)
        else:
            key = os.getenv("GEMINI_API_KEY")
            if not key:
                raise ConfigurationError("GEMINI_API_KEY is missing. Add it to your .env file.")
            _client = genai.Client(api_key=key, http_options=http_options)
    return _client


EMAIL_LIKE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
CARD_LIKE = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def safe_to_send(text):
    """Refuse to send anything that looks like an email address or a card number.

    Our test data is all made up, so this should never trigger. It is a safety
    net in case something real is ever pasted in by mistake.
    """
    if EMAIL_LIKE.search(text) or CARD_LIKE.search(text):
        raise ValueError("Blocked: the text looks like it holds an email address or card number.")


def is_temporary(error):
    """True for hiccups that usually go away: speed limits, busy servers, dropped connections."""
    text = f"{type(error).__name__} {error}"
    signs = ("429", "RESOURCE_EXHAUSTED", "503", "500", "UNAVAILABLE", "DEADLINE", "ReadError",
             "ConnectError", "ConnectionReset", "RemoteProtocolError", "Timeout", "10054")
    return any(sign in text for sign in signs)


def ask_structured(prompt, answer_shape, model=None, retries=1):
    """Send a prompt and get back an answer in a fixed shape (a pydantic class)."""
    safe_to_send(prompt)
    model = model or FAST_MODEL
    settings = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=answer_shape,
        temperature=0,
    )
    for attempt in range(retries):
        try:
            reply = get_client().models.generate_content(model=model, contents=prompt, config=settings)
            return answer_shape.model_validate_json(reply.text)
        except Exception as error:
            if is_temporary(error) and attempt < retries - 1:
                time.sleep(min(2 * (attempt + 1), 5))
                continue
            raise


def ask(prompt, model=None, retries=1):
    """Send a prompt and return the reply text.

    Live calls make one attempt. Offline callers may explicitly request retries.
    """
    safe_to_send(prompt)
    model = model or FAST_MODEL
    for attempt in range(retries):
        try:
            reply = get_client().models.generate_content(model=model, contents=prompt)
            return reply.text
        except Exception as error:
            if is_temporary(error) and attempt < retries - 1:
                time.sleep(min(2 * (attempt + 1), 5))
                continue
            raise
