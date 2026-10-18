"""Case storage: every finished assessment and every analyst decision, kept in Firestore.

The analyst queue needs a record that outlives one browser tab, so the server saves each
recommendation (with its reasons and audit record) as a case, and each analyst decision
under that case. Storage is a convenience around the check, never part of it:

  - a failed or slow save never changes or delays a recommendation by more than a few seconds,
  - after a failure, saving pauses for a minute instead of failing on every request,
  - storage is off unless LMG_FIRESTORE=1, so tests and laptops never touch the cloud.

Privacy: each browser sends its own random session key. A case is saved only with a key,
under a hash of that key (the key itself is never stored), and only the same browser can
list it or record a decision on it. Every case and decision expires after 24 hours:
expired records are never returned, and Firestore's TTL policy on `expires_at` deletes them.

All records are synthetic demo payments. Nothing here moves or stops money.
"""

import hashlib
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone

log = logging.getLogger("lmg")

CASES = "cases"
DECISIONS = "decisions"
WRITE_TIMEOUT_SECONDS = 4
PAUSE_AFTER_FAILURE_SECONDS = 60
KEEP_FOR = timedelta(hours=24)
MAX_CASES_PER_SESSION = 200
MAX_NOTES_PER_CASE = 40
SESSION_KEY = re.compile(r"^[A-Za-z0-9_-]{32,64}$")


def utc_now():
    return datetime.now(timezone.utc)


def owner_of(session_key):
    """The stored owner for a browser's session key, or None if the key is missing or malformed."""
    if not session_key or not SESSION_KEY.fullmatch(session_key):
        return None
    return hashlib.sha256(f"lmg-session|{session_key}".encode()).hexdigest()[:32]


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _live(record, now):
    expires = record.get("expires_at")
    return expires is not None and expires > now


def case_record(request_id, payment, customer, message, questions, answer, outcome, owner, network=None):
    """Build the stored case from one assessment. Only what the analyst queue and a later re-check need."""
    created = utc_now()
    return {
        "id": request_id,
        "owner": owner,
        "synthetic": True,
        "created_at": created,
        "expires_at": created + KEEP_FOR,
        "round": outcome.get("round", 1),
        "payment": payment,
        "network": network,
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
        "investigation": outcome.get("investigation"),
        "status": "open",
    }


def public_case(record):
    """Turn a stored case into JSON for its own browser: timestamps as text, no owner hash."""
    item = {key: value for key, value in record.items() if key != "owner"}
    for key in ("created_at", "reviewed_at", "expires_at"):
        if key in item:
            item[key] = _iso(item[key])
    item["decisions"] = [{key: _iso(value) for key, value in decision.items() if key != "expires_at"}
                         for decision in item.get("decisions", [])]
    item["notes"] = [{**note, "at": _iso(note.get("at"))} for note in item.get("notes", [])]
    return item


def note_record(kind, text, author):
    """One entry in a case's call log: the customer's call, an analyst's notes, or a Voice AI check of them."""
    return {"kind": kind, "text": text, "author": author, "at": utc_now()}


class NoStore:
    """Storage switched off: nothing is saved and the queue starts from the recorded cases."""
    kind = "off"

    def save_case(self, record):
        return False

    def record_decision(self, case_id, owner, status, analyst):
        return None

    def add_note(self, case_id, owner, note):
        return None

    def get_case(self, case_id):
        return None

    def update_case(self, case_id, fields):
        return False

    def recent_cases(self, owner, limit):
        return []


class MemoryStore:
    """Keeps cases in this process only. Used by tests and for local runs (LMG_STORE=memory)."""
    kind = "memory"

    def __init__(self):
        self.cases = {}
        self.lock = threading.Lock()

    def _prune(self, now):
        for case_id in [case_id for case_id, case in self.cases.items() if not _live(case, now)]:
            del self.cases[case_id]

    def save_case(self, record):
        if not record.get("owner"):
            return False
        with self.lock:
            self.cases[record["id"]] = {**record, "decisions": []}
        return True

    def record_decision(self, case_id, owner, status, analyst):
        now = utc_now()
        with self.lock:
            self._prune(now)
            case = self.cases.get(case_id)
            if case is None or not owner or case["owner"] != owner:
                return None
            decision = {"status": status, "analyst": analyst, "at": now, "expires_at": case["expires_at"]}
            case["decisions"].append(decision)
            case["status"] = status
            case["reviewed_at"] = now
            return public_case(case)

    def add_note(self, case_id, owner, note):
        with self.lock:
            self._prune(utc_now())
            case = self.cases.get(case_id)
            if case is None or not owner or case["owner"] != owner:
                return None
            notes = case.setdefault("notes", [])
            if len(notes) >= MAX_NOTES_PER_CASE:
                return None
            notes.append(note)
            return public_case(case)

    def get_case(self, case_id):
        """The stored live case, owner included, or None. Callers check the owner or a call token."""
        with self.lock:
            self._prune(utc_now())
            case = self.cases.get(case_id)
            return dict(case) if case else None

    def update_case(self, case_id, fields):
        with self.lock:
            case = self.cases.get(case_id)
            if case is None:
                return False
            case.update(fields)
            return True

    def recent_cases(self, owner, limit):
        if not owner:
            return []
        now = utc_now()
        with self.lock:
            self._prune(now)
            mine = [case for case in self.cases.values() if case["owner"] == owner]
            mine.sort(key=lambda case: case["created_at"], reverse=True)
            return [public_case(case) for case in mine[:limit]]


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
        if not record.get("owner") or not self._available():
            return False
        try:
            self.client.collection(CASES).document(record["id"]).set(record, timeout=WRITE_TIMEOUT_SECONDS)
            return True
        except Exception as error:
            self._failed("save", error)
            return False

    def record_decision(self, case_id, owner, status, analyst):
        """Add the analyst's decision under the case. None if it is not this browser's live case, or storage failed."""
        if not owner or not self._available():
            return None
        try:
            case_ref = self.client.collection(CASES).document(case_id)
            snapshot = case_ref.get(timeout=WRITE_TIMEOUT_SECONDS)
            now = utc_now()
            if not snapshot.exists:
                return None
            case = snapshot.to_dict()
            if case.get("owner") != owner or not _live(case, now):
                return None
            decision = {"status": status, "analyst": analyst, "at": now, "expires_at": case["expires_at"]}
            case_ref.collection(DECISIONS).add(decision, timeout=WRITE_TIMEOUT_SECONDS)
            case_ref.update({"status": status, "reviewed_at": now}, timeout=WRITE_TIMEOUT_SECONDS)
            return public_case({**case, "status": status, "reviewed_at": now, "decisions": [decision]})
        except Exception as error:
            self._failed("decision", error)
            return None

    def add_note(self, case_id, owner, note):
        """Append a call-log entry to this browser's live case. None if it is not theirs, is full, or storage failed."""
        if not owner or not self._available():
            return None
        try:
            from google.cloud import firestore
            case_ref = self.client.collection(CASES).document(case_id)
            snapshot = case_ref.get(timeout=WRITE_TIMEOUT_SECONDS)
            if not snapshot.exists:
                return None
            case = snapshot.to_dict()
            notes = case.get("notes", [])
            if case.get("owner") != owner or not _live(case, utc_now()) or len(notes) >= MAX_NOTES_PER_CASE:
                return None
            case_ref.update({"notes": firestore.ArrayUnion([note])}, timeout=WRITE_TIMEOUT_SECONDS)
            return public_case({**case, "notes": notes + [note]})
        except Exception as error:
            self._failed("note", error)
            return None

    def get_case(self, case_id):
        """The stored live case, owner included, or None. Callers check the owner or a call token."""
        if not self._available():
            return None
        try:
            snapshot = self.client.collection(CASES).document(case_id).get(timeout=WRITE_TIMEOUT_SECONDS)
            case = snapshot.to_dict() if snapshot.exists else None
            return case if case and _live(case, utc_now()) else None
        except Exception as error:
            self._failed("get", error)
            return None

    def update_case(self, case_id, fields):
        if not self._available():
            return False
        try:
            self.client.collection(CASES).document(case_id).update(fields, timeout=WRITE_TIMEOUT_SECONDS)
            return True
        except Exception as error:
            self._failed("update", error)
            return False

    def recent_cases(self, owner, limit):
        """This browser's live cases, newest first. An equality filter only, so no extra index is needed."""
        if not owner or not self._available():
            return []
        try:
            from google.cloud.firestore_v1.base_query import FieldFilter
            query = self.client.collection(CASES).where(filter=FieldFilter("owner", "==", owner)).limit(MAX_CASES_PER_SESSION)
            now = utc_now()
            mine = [snapshot.to_dict() for snapshot in query.stream(timeout=WRITE_TIMEOUT_SECONDS)]
            mine = [case for case in mine if _live(case, now)]
            mine.sort(key=lambda case: case["created_at"], reverse=True)
            return [public_case(case) for case in mine[:limit]]
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
