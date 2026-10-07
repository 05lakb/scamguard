"""A tiny first look: fetch 3 complaints and show what the data looks like. Run it in Cloud Shell.

  python3 -m redteam.intel.probe

It prints the shape of the response and a short scrubbed snippet. It saves nothing.
"""

from redteam.intel.cfpb import ComplaintClient, extract_records, id_of, narrative_of
from redteam.intel.scrub import scrub


def main():
    client = ComplaintClient()
    status, payload, text = client.search("scam", size=3)
    print(f"HTTP status: {status}")
    if payload is None:
        print(f"The answer was not JSON. First characters: {text!r}")
        return
    print(f"Top-level keys: {sorted(payload) if isinstance(payload, dict) else type(payload).__name__}")
    if isinstance(payload, dict) and isinstance(payload.get("hits"), dict):
        total = payload["hits"].get("total")
        print(f"Total matches reported: {total}")
    records = extract_records(payload)
    print(f"Records returned: {len(records)}")
    if not records:
        return
    print(f"Fields in the first record: {sorted(records[0])}")
    for number, record in enumerate(records, start=1):
        narrative = narrative_of(record)
        print(f"\nRecord {number}: id={id_of(record)} product={record.get('product')!r} issue={record.get('issue')!r}")
        print(f"  story length: {len(narrative)} characters")
        print(f"  scrubbed snippet: {scrub(narrative, 160)!r}")
    print(f"\nRequests made: {client.requests_made}. Nothing was saved.")


if __name__ == "__main__":
    main()
