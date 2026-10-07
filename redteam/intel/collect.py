"""Gathers scam-related complaint stories from the CFPB and saves them, scrubbed. Run it in Cloud Shell.

  python3 -m redteam.intel.collect --count 60

The original text is never saved. Only the scrubbed version goes to redteam/output/intel/ (not in git).
"""

import argparse
import json
from pathlib import Path

from redteam.intel.cfpb import ComplaintClient, extract_records, id_of, narrative_of
from redteam.intel.scrub import looks_clean, scrub

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "intel"
TERMS = ["scam", "zelle", "impersonat", "wire transfer", "tricked", "romance", "fake"]
MIN_STORY = 250  # shorter stories rarely explain what happened


def collect(client, count, per_term=25, max_requests=40):
    found = {}
    for term in TERMS:
        offset = 0
        while len(found) < count and client.requests_made < max_requests and offset < per_term * 3:
            status, payload, text = client.search(term, size=per_term, offset=offset)
            if status != 200:
                print(f"  '{term}': the source answered {status}. Stopping this term.")
                break
            records = extract_records(payload)
            if not records:
                break
            for record in records:
                narrative = scrub(narrative_of(record))
                key = id_of(record)
                if key and key not in found and len(narrative) >= MIN_STORY and looks_clean(narrative):
                    found[key] = {
                        "id": key, "product": record.get("product"), "issue": record.get("issue"),
                        "date_received": record.get("date_received"), "story": narrative,
                    }
            offset += per_term
            print(f"  '{term}': {len(found)} usable stories so far ({client.requests_made} requests)")
        if len(found) >= count or client.requests_made >= max_requests:
            break
    return list(found.values())[:count]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=60)
    parser.add_argument("--max-requests", type=int, default=40, help="hard cap on requests to the source")
    parser.add_argument("--out", default=str(OUTPUT / "complaints_scrubbed.jsonl"))
    args = parser.parse_args()

    client = ComplaintClient()
    stories = collect(client, args.count, max_requests=args.max_requests)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for story in stories:
            handle.write(json.dumps(story) + "\n")
    print(f"Saved {len(stories)} scrubbed stories to {out} after {client.requests_made} requests.")


if __name__ == "__main__":
    main()
