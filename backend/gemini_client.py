"""One place that sets up the connection to Gemini.

Everything else in the project asks this file for a ready-to-use client, so the
key and model names are only handled here.
"""

import os
import re
import time

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
load_dotenv(".env")

# A cheap, quick model for everyday work, and a stronger one for harder calls.
FAST_MODEL = os.getenv("GEMINI_FAST_MODEL") or "gemini-3.5-flash-lite"
SMART_MODEL = os.getenv("GEMINI_SMART_MODEL") or "gemini-3.8-flash"

_client = None


def get_client():
    """Return the shared Gemini client, creating it the first time."""
    global _client
    if _client is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is missing. Add it to your .env file.")
        _client = genai.Client(api_key=key)
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


def ask_structured(prompt, answer_shape, model=None, retries=3):
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
            too_busy = "429" in str(error) or "RESOURCE_EXHAUSTED" in str(error)
            if too_busy and attempt < retries - 1:
                time.sleep(15 * (attempt + 1))
                continue
            raise


def ask(prompt, model=None, retries=3):
    """Send a prompt and return the reply text.

    If we hit the free-tier speed limit, wait a little and try again.
    """
    model = model or FAST_MODEL
    for attempt in range(retries):
        try:
            reply = get_client().models.generate_content(model=model, contents=prompt)
            return reply.text
        except Exception as error:
            too_busy = "429" in str(error) or "RESOURCE_EXHAUSTED" in str(error)
            if too_busy and attempt < retries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            raise
