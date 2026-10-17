"""Case storage: every finished assessment and every analyst decision, kept in Firestore.

The analyst queue needs a record that outlives one browser tab, so the server saves each
recommendation (with its reasons and audit record) as a case, and each analyst decision
under that case. Storage is a convenience around the check, never part of it:

  - a failed or slow save never changes or delays a recommendation by more than a few seconds,
  - after a failure, saving pauses for a minute instead of failing on every request,
  - storage is off unless LMG_FIRESTORE=1, so tests and laptops never touch the cloud.

All records are synthetic demo payments. Nothing here moves or stops money.
"""

import logging
import os
import threading
import time
from datetime import datetime, timezone

log = logging.getLogger("lmg")

CASES = "cases"
DECISIONS = "decisions"
WRITE_TIMEOUT_SECONDS = 4
PAUSE_AFTER_FAILURE_SECONDS = 60


def utc_now():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def case_record(request_id, payment, customer, message, questions, answer, outcome):
    """Build the stored case from one assessment. Only what the analyst queue needs."""
    return {
        "id": request_id,
        "synthetic": True,
        "created_at": utc_now(),
        "round": outcome.get("round", 1),
        "payment": payment,
        "customer": {key: value for key, value in customer.items() if key != "id"},
        "message": message,
        "questions": outcome.get("questions") or questions,
        "answer": answer,
        "action": outcome["action"],
        "score": outcome["score"],
        "reasons": outcome.get("reasons", []),
        "customer_warning": outcome.get("customer_warning", ""),
        "degraded": bool(outcome.get("degraded")),
        "audit": outcome.get("audit", {}),
        "execution": outcome.get("execution", {}),
        "status": "open",
    }


def public_case(record):
    """Turn a stored case into JSON for the browser (timestamps as text)."""
    item = dict(record)
    for key in ("created_at", "reviewed_at"):
        if key in item:
            item[key] = _iso(item[key])
    item["decisions"] = [{**decision, "at": _iso(decision.get("at"))} for decision in item.get("decisions", [])]
    return item


class NoStore:
    """Storage switched off: nothing is saved and the queue starts from the recorded cases."""
    kind = "off"

    def save_case(self, record):
        return False

    def record_decision(self, case_id, status, analyst):
        return None

    def recent_cases(self, limit):
        return []


class MemoryStore:
    """Keeps cases in this process only. Used by tests and for local runs (LMG_STORE=memory)."""
    kind = "memory"

    def __init__(self):
        self.cases = {}
        self.lock = threading.Lock()

    def save_case(self, record):
        with self.lock:
            self.cases[record["id"]] = {**record, "decisions": []}
        return True

    def record_decision(self, case_id, status, analyst):
        with self.lock:
            case = self.cases.get(case_id)
            if case is None:
                return None
            decision = {"status": status, "analyst": analyst, "at": utc_now()}
            case["decisions"].append(decision)
            case["status"] = status
            case["reviewed_at"] = decision["at"]
            return public_case(case)

    def recent_cases(self, limit):
        with self.lock:
            items = sorted(self.cases.values(), key=lambda case: case["created_at"], reverse=True)
            return [public_case(case) for case in items[:limit]]


class FirestoreStore:
    """Cases in the Firestore collection `cases`; decisions in `cases/{id}/decisions`."""
    kind = "firestore"

    def __init__(self, client=None, project=None):
        self._client = client
        self._project = project
        self._paused_until = 0.0

    @property
    def client(self):
        if self._client is None:
            from google.cloud import firestore  # imported only when storage is switched on
            self._client = firestore.Client(project=self._project)
        return self._client

    def _available(self):
        return time.monotonic() >= self._paused_until

    def _failed(self, action, error):
        log.warning("firestore %s failed: %s", action, type(error).__name__)  # never log case contents
        self._paused_until = time.monotonic() + PAUSE_AFTER_FAILURE_SECONDS

    def save_case(self, record):
        if not self._available():
            return False
        try:
            self.client.collection(CASES).document(record["id"]).set(record, timeout=WRITE_TIMEOUT_SECONDS)
            return True
        except Exception as error:
            self._failed("save", error)
            return False

    def record_decision(self, case_id, status, analyst):
        """Add the analyst's decision under the case. None if the case is unknown or storage failed."""
        if not self._available():
            return None
        try:
            case_ref = self.client.collection(CASES).document(case_id)
            snapshot = case_ref.get(timeout=WRITE_TIMEOUT_SECONDS)
            if not snapshot.exists:
                return None
            decision = {"status": status, "analyst": analyst, "at": utc_now()}
            case_ref.collection(DECISIONS).add(decision, timeout=WRITE_TIMEOUT_SECONDS)
            case_ref.update({"status": status, "reviewed_at": decision["at"]}, timeout=WRITE_TIMEOUT_SECONDS)
            return public_case({**snapshot.to_dict(), "status": status, "reviewed_at": decision["at"],
                                "decisions": [decision]})
        except Exception as error:
            self._failed("decision", error)
            return None

    def recent_cases(self, limit):
        if not self._available():
            return []
        try:
            query = (self.client.collection(CASES)
                     .order_by("created_at", direction="DESCENDING")
                     .limit(limit))
            return [public_case(snapshot.to_dict()) for snapshot in query.stream(timeout=WRITE_TIMEOUT_SECONDS)]
        except Exception as error:
            self._failed("list", error)
            return []


def store_from_environment():
    """Pick the store from settings. Firestore only when LMG_FIRESTORE=1."""
    if os.getenv("LMG_FIRESTORE") == "1":
        return FirestoreStore(project=os.getenv("GOOGLE_CLOUD_PROJECT") or None)
    if os.getenv("LMG_STORE") == "memory":
        return MemoryStore()
    return NoStore()
