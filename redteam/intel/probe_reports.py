"""A first look at the public fraud-advice pages. Run it in Cloud Shell. It saves nothing.

  python3 -m redteam.intel.probe_reports

For each page it says whether it answered, whether the site allows robots to read it, and how much
readable text it holds. Send the output back so we can choose which sources to use.
"""

import httpx

from redteam.intel.reports import START_PAGES, SOURCES, ReportReader


def main():
    reader = ReportReader()
    print("Websites allowed:", ", ".join(sorted(SOURCES)))
    for address in START_PAGES:
        try:
            result = reader.fetch(address)
        except (httpx.HTTPError, RuntimeError) as error:
            print(f"- {address}\n    no answer: {type(error).__name__}")
            continue
        line = f"    status={result['status']} {result.get('note', '')}".rstrip()
        if result.get("status") == 200:
            line = f"    status=200 title={result['title'][:70]!r} text={result['text_length']} characters"
        print(f"- {address}\n{line}")
        if result.get("snippet"):
            print(f"    snippet: {result['snippet']!r}")
    print(f"\nRequests made: {reader.requests_made}. Nothing was saved.")


if __name__ == "__main__":
    main()
