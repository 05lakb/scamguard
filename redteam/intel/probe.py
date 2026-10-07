"""A small first look at the CFPB data. Run it in Cloud Shell. It saves nothing.

  python3 -m redteam.intel.probe

It asks for 3 complaints in small steps, adding one parameter at a time, so that if the source
refuses a request we can see exactly which parameter caused it.
"""

import httpx

from redteam.intel.cfpb import BASE, ComplaintClient, extract_records, id_of, narrative_of
from redteam.intel.scrub import scrub

LIGHT = {"size": 3, "no_aggs": "true"}  # tells the server not to total up millions of complaints
STEPS = [
    ("size and no_aggs only", dict(LIGHT)),
    ("add search_term", {**LIGHT, "search_term": "scam"}),
    ("add has_narrative", {**LIGHT, "search_term": "scam", "has_narrative": "true"}),
    ("add field", {**LIGHT, "search_term": "scam", "has_narrative": "true", "field": "complaint_what_happened"}),
    ("add sort", {**LIGHT, "search_term": "scam", "has_narrative": "true", "field": "complaint_what_happened",
                  "sort": "created_date_desc"}),
    ("add date", {**LIGHT, "search_term": "scam", "has_narrative": "true", "field": "complaint_what_happened",
                  "sort": "created_date_desc", "date_received_min": "2023-01-01"}),
    ("add frm", {**LIGHT, "search_term": "scam", "has_narrative": "true", "field": "complaint_what_happened",
                 "sort": "created_date_desc", "date_received_min": "2023-01-01", "frm": 0}),
    ("add format", {**LIGHT, "search_term": "scam", "has_narrative": "true", "field": "complaint_what_happened",
                    "sort": "created_date_desc", "date_received_min": "2023-01-01", "frm": 0, "format": "json"}),
]


def describe(payload):
    if isinstance(payload, dict):
        detail = payload.get("detail")
        return f"keys={sorted(payload)[:6]}" + (f" detail={str(detail)[:100]!r}" if detail else "")
    return f"type={type(payload).__name__}"


def main():
    client = ComplaintClient(timeout=25.0)
    print(f"Address: {BASE}")
    working = None
    for name, params in STEPS:
        try:
            status, payload, text, url = client.get(params)
        except httpx.HTTPError as error:
            print(f"- {name:24} no answer: {type(error).__name__}")
            continue
        records = extract_records(payload)
        print(f"- {name:24} status={status} records={len(records)} {describe(payload) if payload is not None else repr(text[:80])}")
        if status == 200 and records:
            working = (name, params, records, url)

    # The same request without the trailing slash, in case the address is picky about it.
    try:
        status, payload, text, url = client.get(LIGHT, base=BASE.rstrip("/"))
        print(f"- {'no trailing slash':24} status={status} records={len(extract_records(payload))}")
    except httpx.HTTPError as error:
        print(f"- {'no trailing slash':24} no answer: {type(error).__name__}")

    if not working:
        print("\nNothing worked. Send me this output and I will adjust.")
        return
    name, params, records, url = working
    print(f"\nThe last working step was: {name}")
    print(f"Fields in the first record: {sorted(records[0])}")
    for number, record in enumerate(records, start=1):
        story = narrative_of(record)
        print(f"Record {number}: id={id_of(record)} product={record.get('product')!r} issue={record.get('issue')!r}")
        print(f"  story length: {len(story)} characters; scrubbed snippet: {scrub(story, 140)!r}")
    print(f"\nRequests made: {client.requests_made}. Nothing was saved.")


if __name__ == "__main__":
    main()
