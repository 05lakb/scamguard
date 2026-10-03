"""One place that sets up the connection to Gemini.

Everything else in the project asks this file for a ready-to-use client, so the
key and model names are only handled here.
"""

import os
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
