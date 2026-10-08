"""Gathers passages from public fraud-advice pages and saves them, scrubbed. Run it in Cloud Shell.

  python3 -m redteam.intel.collect_reports --per-source 8

It reads the list pages of each named website, picks article pages from them, and cuts each article
into short passages that describe how a fraud plays out. Only the scrubbed passages are saved, with
the page's name, title and address so we can credit it. The original page text is never saved.
The output goes to redteam/output/intel/ (not in git).
"""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx

from redteam.intel.reports import SOURCES, ReportReader
from redteam.intel.scrub import looks_clean, scrub

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "intel"

# Each list page, and the shape of the article addresses on it that we want.
INDEXES = [
    ("https://consumer.ftc.gov/consumer-alerts", re.compile(r"^/consumer-alerts/20\d\d/\d\d/[a-z0-9-]+$")),
    ("https://www.scamwatch.gov.au/types-of-scams", re.compile(r"^/types-of-scams/[a-z0-9-]+$")),
]

MONEY_WORDS = re.compile(r"\b(pay|paid|send|sent|transfer|wire|deposit|money|bank|account|gift card|crypto)\w*", re.I)
STORY_WORDS = re.compile(r"\b(call|calls|called|text|email|message|says|said|ask|asks|asked|tell|tells|told|claim|claims|pretend)\w*", re.I)
MIN_CHARS = 300
MAX_CHARS = 1400
PER_PAGE = 6


def article_links(links, pattern):
    """Keep only the links whose path looks like an article on this list."""
    found = []
    for link in links:
        if pattern.match(urlparse(link).path) and link not in found:
            found.append(link)
    return found


def passages_of(text):
    """Cut a page into passages of whole sentences, each short enough to read in one go."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    passages, current = [], ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > MAX_CHARS:
            passages.append(current)
            current = ""
        current = f"{current} {sentence}".strip()
    if current:
        passages.append(current)
    return passages


def useful(passage):
    """A passage is worth keeping if it talks about money moving and about what the fraudster says or does."""
    return len(passage) >= MIN_CHARS and bool(MONEY_WORDS.search(passage)) and bool(STORY_WORDS.search(passage))


def collect(reader, per_source=8, max_pages=24):
    stories, seen = [], set()
    pages = 0
    for index_address, pattern in INDEXES:
        try:
            index = reader.fetch(index_address)
        except (httpx.HTTPError, RuntimeError) as error:
            print(f"  {index_address}: no answer ({type(error).__name__})")
            continue
        if index.get("status") != 200:
            print(f"  {index_address}: {index.get('note') or index.get('status')}")
            continue
        articles = article_links(index["links"], pattern)[:per_source]
        print(f"  {index_address}: {len(articles)} article pages found")
        for address in articles:
            if pages >= max_pages:
                return stories
            pages += 1
            try:
                page = reader.fetch(address)
            except (httpx.HTTPError, RuntimeError) as error:
                print(f"    {address}: no answer ({type(error).__name__})")
                continue
            if page.get("status") != 200:
                print(f"    {address}: {page.get('note') or page.get('status')}")
                continue
            host = urlparse(page["address"]).hostname
            kept = 0
            for number, passage in enumerate(passages_of(page["text"])):
                clean = scrub(passage)
                if not useful(clean) or not looks_clean(clean) or clean in seen:
                    continue
                seen.add(clean)
                key = hashlib.sha256(f"{page['address']}|{number}".encode()).hexdigest()[:12]
                stories.append({
                    "id": key, "story": clean, "kind": "advice",
                    "reference": {"name": SOURCES[host], "title": page["title"], "url": page["address"]},
                })
                kept += 1
                if kept >= PER_PAGE:
                    break
            print(f"    {page['title'][:60]!r}: {kept} passages kept")
    return stories


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-source", type=int, default=8, help="articles to read from each website")
    parser.add_argument("--max-pages", type=int, default=24, help="hard cap on article pages")
    parser.add_argument("--max-requests", type=int, default=60, help="hard cap on all requests")
    parser.add_argument("--out", default=str(OUTPUT / "report_stories.jsonl"))
    args = parser.parse_args()

    reader = ReportReader(max_requests=args.max_requests)
    stories = collect(reader, args.per_source, args.max_pages)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        for story in stories:
            handle.write(json.dumps(story) + "\n")
    print(f"Saved {len(stories)} scrubbed passages to {out} after {reader.requests_made} requests.")


if __name__ == "__main__":
    main()
