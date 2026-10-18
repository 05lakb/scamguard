"""The scam playbook: the scam types Gemini reads a customer's words against, shown to people as they are.

The types and red flags come from data/typologies.json, the same file the message reader uses, so what the
page shows is exactly what the model is given. The public advice pages are kept here, not in that file, so the
recorded evaluation's input hashes stay valid.
"""

SCAMWATCH = "https://www.scamwatch.gov.au/types-of-scams"

# Public advice page for each type. Types without a dedicated page link to the Scamwatch index.
SOURCES = {
    "investment": ("Scamwatch: investment scams", f"{SCAMWATCH}/investment-scams"),
    "romance": ("Scamwatch: romance scams", f"{SCAMWATCH}/romance-scams"),
    "remote_access": ("Scamwatch: remote access scams", f"{SCAMWATCH}/remote-access-scams"),
    "invoice_redirect": ("Scamwatch: false billing", f"{SCAMWATCH}/false-billing"),
    "purchase": ("Scamwatch: buying and selling scams", f"{SCAMWATCH}/buying-and-selling-scams"),
}
GENERAL = ("Scamwatch: types of scams", SCAMWATCH)

FIELDS = ("id", "name", "how_it_works", "red_flags", "pressure_tactics", "safe_advice")


def playbook(scam_types):
    """Each scam type with its red flags, pressure tactics, safe advice and the public page it is described on."""
    out = []
    for item in scam_types:
        label, url = SOURCES.get(item["id"], GENERAL)
        out.append({**{key: item[key] for key in FIELDS if key in item}, "source": {"label": label, "url": url}})
    return out
