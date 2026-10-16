"""Looks at the links in a customer's message for signs of a scam link.

It only reads the text of the link. It never opens it, never fetches anything and never sends the link anywhere,
so a dangerous link cannot do any harm. It is plain pattern matching, so every flag has a plain reason.

What it flags:
  - shortened links, which hide where they really go,
  - a web address typed as a bare number (an IP address),
  - look-alike characters in an address (punycode),
  - a name@ part in front of the real site, used to disguise it,
  - an address that imitates a well-known brand, such as paypa1-secure.com,
  - endings that scams often use, such as .xyz or .top,
  - a payment-request link (upi://pay), which sends money out when approved.
"""

import re
from urllib.parse import urlsplit

SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "buff.ly",
    "tiny.cc", "rebrand.ly", "t.ly", "lnkd.in", "s.id", "v.gd",
}

# Well-known names that scammers like to imitate. Their real address is what counts as genuine.
BRANDS = [
    "paypal.com", "amazon.com", "google.com", "microsoft.com", "apple.com", "netflix.com", "whatsapp.com",
    "facebook.com", "instagram.com", "linkedin.com", "dhl.com", "fedex.com", "ups.com", "usps.com",
    "paytm.com", "phonepe.com", "stripe.com", "coinbase.com", "binance.com",
]

ODD_ENDINGS = {
    "zip", "mov", "top", "xyz", "click", "gq", "tk", "ml", "cf", "ga", "icu", "cyou", "sbs", "rest", "monster",
    "buzz", "loan", "work",
}

MAX_FINDINGS = 3
TRAILING = ".,;:!?)]}'\""

LINK = re.compile(
    r"(?i)(?:\b[a-z][a-z0-9+.-]*://[^\s<>\"']+"  # anything with a scheme, such as https:// or upi://
    r"|\bwww\.[^\s<>\"']+"
    r"|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s<>\"']*)?)"  # a bare address, such as bit.ly/abc
)
IPV4 = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


def normalise(label):
    """Undo the usual disguises: 0 for o, 1 for l, 5 for s, rn for m, vv for w."""
    swapped = label.translate(str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "$": "s"}))
    return swapped.replace("rn", "m").replace("vv", "w")


def one_edit_apart(first, second):
    """True if the two words differ by exactly one letter added, removed or changed."""
    if first == second or abs(len(first) - len(second)) > 1:
        return False
    if len(first) == len(second):
        return sum(1 for a, b in zip(first, second) if a != b) == 1
    short, long = (first, second) if len(first) < len(second) else (second, first)
    return any(long[:i] + long[i + 1:] == short for i in range(len(long)))


def reason_for(link):
    """Return a plain reason why this link looks risky, or None if nothing stands out."""
    lowered = link.lower()
    if lowered.startswith("upi://"):
        return "a payment-request link, which sends money out when it is approved"
    parts = urlsplit(link if "://" in link else "http://" + link)
    host = (parts.hostname or "").lower()
    if not host:
        return None
    if "@" in parts.netloc:
        return "a hidden name@ part that disguises the real website"
    if IPV4.match(host):
        return "an address made of numbers instead of a name"
    if "xn--" in host:
        return "look-alike characters in the address"
    labels = host.split(".")
    registrable = ".".join(labels[-2:]) if len(labels) >= 2 else host
    if host in SHORTENERS or registrable in SHORTENERS:
        return "a shortened link, which hides where it really goes"
    for brand in BRANDS:
        name = brand.split(".")[0]
        if registrable == brand or len(name) < 5:
            continue
        label = labels[-2] if len(labels) >= 2 else host
        if label == name:
            continue  # the same name with another country ending, such as amazon.in, is normally genuine
        # Look at each piece of the address (split at dots and dashes) after undoing the usual disguises.
        pieces = [normalise(piece) for piece in re.split(r"[.-]", host)]
        if any(piece == name or one_edit_apart(piece, name) for piece in pieces):
            return f"an address that imitates {brand}"
    if labels[-1] in ODD_ENDINGS:
        return f"an unusual ending (.{labels[-1]}) that scams often use"
    return None


def check_links(text):
    """Return up to three risky links found in the text, each as {"link": ..., "why": ...}."""
    found = []
    seen = set()
    for match in LINK.finditer(text or ""):
        link = match.group(0).rstrip(TRAILING)
        if not link or link in seen:
            continue
        seen.add(link)
        why = reason_for(link)
        if why:
            found.append({"link": link[:50], "why": why})
        if len(found) >= MAX_FINDINGS:
            break
    return found
