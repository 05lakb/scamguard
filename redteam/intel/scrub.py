"""Removes anything that could identify a person from text we gather from public sources.

It is deliberately heavy-handed. Better to lose a detail than to keep a phone number.
"""

import re

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
URL = re.compile(r"(https?://\S+|www\.\S+)", re.IGNORECASE)
PHONE = re.compile(r"(\+?\d[\d\-\s().]{7,}\d)")
LONG_NUMBER = re.compile(r"\d{5,}")
MASK = re.compile(r"X{2,}", re.IGNORECASE)  # the source's own redaction marks
MAX_CHARS = 1800


def scrub(text, limit=MAX_CHARS):
    """Return the text with contact details, links and long numbers replaced by plain markers."""
    text = text or ""
    text = EMAIL.sub("[email]", text)
    text = URL.sub("[link]", text)
    text = PHONE.sub("[phone]", text)
    text = LONG_NUMBER.sub("[number]", text)
    text = MASK.sub("[hidden]", text)
    text = re.sub(r"[\x00-\x08\x0b-\x1f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def looks_clean(text):
    """A last check on anything we are about to send onwards or save."""
    return not (EMAIL.search(text) or URL.search(text) or PHONE.search(text) or LONG_NUMBER.search(text))
