"""Writes a file that lets the web version prove it matches the Python version.

For every test case it saves the inputs (payment, customer, the message reading)
and what the Python checks decided. The web tests then run the same inputs and
compare. Messages already read are taken from the saved answers.

Run it with:  python eval/export_parity_fixture.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.risk import clarify  # noqa: E402
from backend.risk.decision import decide  # noqa: E402
from backend.risk.evidence import load_scam_types, read_message  # noqa: E402


def main():
    customers = {c["id"]: c for c in json.loads((ROOT / "data" / "customers.json").read_text(encoding="utf-8"))}
    scenarios = json.loads((ROOT / "data" / "scenarios_hard.json").read_text(encoding="utf-8"))
    scam_types = load_scam_types()

    rows = []
    for case in scenarios:
        customer = customers[case["customer_id"]]
        message = case["customer_evidence"]
        reading = read_message(message, scam_types) if message else None
        outcome = decide(case["payment"], customer, reading, scam_types)
        reading_for_web = None
        if reading:
            reading_for_web = {k: v for k, v in reading.items() if k != "from_cache"}
        rows.append({
            "id": case["id"],
            "customer": {"id": customer["id"], "segment": customer["segment"], "typical_amount": customer["typical_amount"]},
            "payment": case["payment"],
            "message": message,
            "reading": reading_for_web,
            "expected": {
                "action": outcome["action"],
                "score": outcome["score"],
                "behaviour_score": outcome["audit"]["behaviour_score"],
                "message_points": outcome["audit"]["message_points"],
                "verified_discount": outcome["audit"]["verified_discount"],
                "forced_hold": outcome["audit"]["forced_hold"],
                "should_ask": clarify.should_ask(message, reading, outcome),
                "reasons": outcome["reasons"],
                "customer_warning": outcome["customer_warning"],
            },
        })

    out = ROOT / "web" / "src" / "core" / "parity_fixture.json"
    out.write_text(json.dumps({"scam_types": scam_types, "cases": rows}, indent=1), encoding="utf-8")
    print(f"Wrote {len(rows)} cases to {out}")


if __name__ == "__main__":
    main()
