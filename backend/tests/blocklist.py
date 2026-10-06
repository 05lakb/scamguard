"""Words that must never appear in our made-up data.

They are stored as hashes, so the words themselves are not written down anywhere in the project.
"""

import hashlib
import re

BLOCKED_HASHES = {
    "abc07d7a1810b5c934a870aa96e9e4904bc73960bc6766842c41c3d4a947c1ae",
    "9c804ca9d325256d6e817a261f0de6f53ba28164c869d5aadd8f1a9b8ad42292",
}


def blocked_words_in(text):
    """Return any blocked word found in the text. The result is the hash, never the word."""
    tokens = set(re.findall(r"[a-z0-9]+", text.lower()))
    return [hashlib.sha256(token.encode()).hexdigest() for token in tokens
            if hashlib.sha256(token.encode()).hexdigest() in BLOCKED_HASHES]
