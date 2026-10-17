"""Tests for case storage. A fake Firestore client stands in, so nothing goes to the cloud."""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend import app as app_module  # noqa: E402
from backend import store as store_module  # noqa: E402
from backend.store import FirestoreStore, MemoryStore, NoStore, case_record, owner_of  # noqa: E402
from backend.tests.test_app import BODY, fake_asker, fake_reader  # noqa: E402

# A known payee with a full note: the guard decides in one round instead of asking.
LONG_NOTE = {**BODY, "payment": {**BODY["payment"], "is_new_payee": False},
             "message": "Paying my landlord for this month's rent, same flat as last year, I checked the account with him."}

BROWSER_A = "a" * 40
BROWSER_B = "b1" * 20


def client_with(store, session=BROWSER_A):
    headers = {"X-LMG-Session": session} if session else {}
    return TestClient(app_module.create_app(reader=fake_reader, asker=fake_asker, store=store), headers=headers)


def as_browser(client, session):
    return {"X-LMG-Session": session} if session else {"X-LMG-Session": ""}


# ---------- a tiny fake of the Firestore calls the store uses ----------

class FakeSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data)


class FakeDocument:
    def __init__(self, db, path):
        self.db, self.path = db, path

    def set(self, data, timeout=None):
        self.db.docs[self.path] = dict(data)

    def get(self, timeout=None):
        return FakeSnapshot(self.db.docs.get(self.path))

    def update(self, fields, timeout=None):
        doc = self.db.docs[self.path]
        for key, value in fields.items():
            if type(value).__name__ == "ArrayUnion":  # firestore.ArrayUnion appends to a list field
                doc[key] = doc.get(key, []) + list(value.values)
            else:
                doc[key] = value

    def collection(self, name):
        return FakeCollection(self.db, f"{self.path}/{name}")


class FakeCollection:
    def __init__(self, db, path):
        self.db, self.path = db, path
        self._filters, self._limit = [], None

    def document(self, doc_id):
        return FakeDocument(self.db, f"{self.path}/{doc_id}")

    def add(self, data, timeout=None):
        self.db.added.append((self.path, dict(data)))

    def where(self, filter):
        assert filter.op_string == "=="
        self._filters.append((filter.field_path, filter.value))
        return self

    def limit(self, count):
        self._limit = count
        return self

    def stream(self, timeout=None):
        prefix = self.path + "/"
        rows = [data for path, data in self.db.docs.items() if path.startswith(prefix) and "/" not in path[len(prefix):]]
        rows = [row for row in rows if all(row.get(field) == value for field, value in self._filters)]
        return [FakeSnapshot(row) for row in rows[: self._limit]]


class FakeFirestore:
    def __init__(self, fail=False):
        self.docs, self.added, self.fail, self.calls = {}, [], fail, 0

    def collection(self, name):
        self.calls += 1
        if self.fail:
            raise RuntimeError("firestore unavailable")
        return FakeCollection(self, name)


# ---------- the stored record ----------

def nested_lists(value):
    """Firestore rejects a list directly inside another list."""
    if isinstance(value, dict):
        return any(nested_lists(item) for item in value.values())
    if isinstance(value, list):
        return any(isinstance(item, list) or nested_lists(item) for item in value)
    return False


def test_saved_record_fits_firestore_keeps_the_audit_and_expires():
    store = MemoryStore()
    response = client_with(store).post("/api/assess", json=LONG_NOTE)
    assert response.status_code == 200
    saved = next(iter(store.cases.values()))
    assert saved["synthetic"] is True
    assert saved["action"] == response.json()["action"] and saved["score"] == response.json()["score"]
    assert saved["audit"]["behaviour_score"] == response.json()["audit"]["behaviour_score"]
    assert "id" not in saved["customer"]
    assert isinstance(saved["created_at"], datetime)
    assert saved["expires_at"] - saved["created_at"] == timedelta(hours=24)
    assert saved["owner"] == owner_of(BROWSER_A) and BROWSER_A not in str(saved)
    assert not nested_lists(saved)


def test_session_keys_are_checked_and_hashed():
    assert owner_of(None) is None and owner_of("") is None
    assert owner_of("short") is None and owner_of("x" * 65) is None and owner_of("a" * 39 + "!") is None
    assert owner_of(BROWSER_A) != owner_of(BROWSER_B)
    assert len(owner_of(BROWSER_A)) == 32


# ---------- the API ----------

def test_assessment_is_saved_listed_and_reviewed():
    store = MemoryStore()
    client = client_with(store)
    result = client.post("/api/assess", json=LONG_NOTE).json()
    case_id = result["execution"]["request_id"]
    assert result["execution"]["saved"] is True

    listed = client.get("/api/cases").json()
    assert listed["storage"] == "memory"
    assert [case["id"] for case in listed["cases"]] == [case_id]
    assert listed["cases"][0]["status"] == "open"
    assert "owner" not in listed["cases"][0]

    reviewed = client.post(f"/api/cases/{case_id}/decision", json={"status": "held", "analyst": "  Priya  "})
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "held"
    assert reviewed.json()["decisions"][-1]["analyst"] == "Priya"
    assert client.get("/api/cases").json()["cases"][0]["status"] == "held"


def test_another_browser_cannot_see_or_decide_a_case():
    store = MemoryStore()
    client = client_with(store)
    case_id = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]

    assert client.get("/api/cases", headers=as_browser(client, BROWSER_B)).json()["cases"] == []
    stolen = client.post(f"/api/cases/{case_id}/decision", json={"status": "approved"}, headers=as_browser(client, BROWSER_B))
    assert stolen.status_code == 404
    assert client.get("/api/cases").json()["cases"][0]["status"] == "open"


def test_without_a_session_nothing_is_saved_listed_or_decided():
    store = MemoryStore()
    client = client_with(store, session=None)
    result = client.post("/api/assess", json=LONG_NOTE)
    assert result.status_code == 200 and result.json()["execution"]["saved"] is False
    assert store.cases == {}
    assert client.get("/api/cases").json()["cases"] == []
    assert client.post("/api/cases/abcdef123456/decision", json={"status": "held"}).status_code == 401
    malformed = client.post("/api/cases/abcdef123456/decision", json={"status": "held"}, headers={"X-LMG-Session": "short"})
    assert malformed.status_code == 401


def test_streamed_assessments_are_saved_for_their_browser():
    store = MemoryStore()
    client = client_with(store)
    with client.stream("POST", "/api/assess/stream", json=LONG_NOTE) as response:
        lines = list(response.iter_lines())
    assert '"saved": true' in lines[-1]
    assert len(client.get("/api/cases").json()["cases"]) == 1
    assert client.get("/api/cases", headers=as_browser(client, BROWSER_B)).json()["cases"] == []


def test_expired_cases_are_hidden_and_cannot_be_decided():
    store = MemoryStore()
    client = client_with(store)
    case_id = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    store.cases[case_id]["expires_at"] = store_module.utc_now() - timedelta(seconds=1)
    assert client.get("/api/cases").json()["cases"] == []
    assert client.post(f"/api/cases/{case_id}/decision", json={"status": "held"}).status_code == 404
    assert store.cases == {}  # pruned


def test_cases_waiting_for_an_answer_are_not_listed():
    store = MemoryStore()
    client = client_with(store)
    result = client.post("/api/assess", json=BODY).json()  # a two-word note to a new payee: the guard asks
    assert result["action"] == "ask"
    assert result["execution"]["saved"] is True
    assert client.get("/api/cases").json()["cases"] == []


def test_list_limit_is_bounded():
    store = MemoryStore()
    client = client_with(store)
    for _ in range(3):
        client.post("/api/assess", json=LONG_NOTE)
    assert len(client.get("/api/cases?limit=2").json()["cases"]) == 2
    assert len(client.get("/api/cases?limit=0").json()["cases"]) == 1


def test_bad_decisions_are_rejected():
    client = client_with(MemoryStore())
    assert client.post("/api/cases/abcdef123456/decision", json={"status": "held"}).status_code == 404
    assert client.post("/api/cases/not-a-case/decision", json={"status": "held"}).status_code == 422
    assert client.post("/api/cases/abcdef123456/decision", json={"status": "allow"}).status_code == 422
    assert client.post("/api/cases/abcdef123456/decision", json={"status": "held", "analyst": "x" * 41}).status_code == 422


def test_storage_off_still_assesses():
    client = client_with(NoStore())
    result = client.post("/api/assess", json=LONG_NOTE)
    assert result.status_code == 200
    assert result.json()["execution"]["saved"] is False
    assert client.get("/api/cases").json() == {"storage": "off", "cases": []}
    assert client.post("/api/cases/abcdef123456/decision", json={"status": "held"}).status_code == 503
    assert client.get("/api/health").json()["storage"] == "off"


def test_failed_firestore_never_breaks_the_assessment():
    fake = FakeFirestore(fail=True)
    client = client_with(FirestoreStore(client=fake))
    first = client.post("/api/assess", json=LONG_NOTE)
    assert first.status_code == 200 and first.json()["execution"]["saved"] is False
    calls = fake.calls
    second = client.post("/api/assess", json=LONG_NOTE)  # saving is paused after a failure
    assert second.status_code == 200 and second.json()["execution"]["saved"] is False
    assert fake.calls == calls
    assert client.get("/api/cases").json()["cases"] == []


# ---------- the Firestore store itself ----------

def test_firestore_store_keeps_each_browser_to_its_own_cases():
    fake = FakeFirestore()
    store = FirestoreStore(client=fake)
    client = client_with(store)
    first = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    second = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    other = client.post("/api/assess", json=LONG_NOTE, headers=as_browser(client, BROWSER_B)).json()["execution"]["request_id"]
    assert all(f"cases/{case_id}" in fake.docs for case_id in (first, second, other))
    assert fake.docs[f"cases/{first}"]["owner"] == owner_of(BROWSER_A)

    listed = client.get("/api/cases").json()["cases"]
    assert [case["id"] for case in listed] == [second, first]  # newest first, only this browser's
    assert isinstance(listed[0]["created_at"], str) and "owner" not in listed[0]
    assert [case["id"] for case in client.get("/api/cases", headers=as_browser(client, BROWSER_B)).json()["cases"]] == [other]

    assert client.post(f"/api/cases/{first}/decision", json={"status": "approved"},
                       headers=as_browser(client, BROWSER_B)).status_code == 404
    assert fake.added == []

    reviewed = client.post(f"/api/cases/{first}/decision", json={"status": "escalated", "analyst": "Lalit"})
    assert reviewed.status_code == 200 and "owner" not in reviewed.json()
    case = fake.docs[f"cases/{first}"]
    assert case["status"] == "escalated"
    assert fake.added == [(f"cases/{first}/decisions", {"status": "escalated", "analyst": "Lalit",
                                                          "at": case["reviewed_at"], "expires_at": case["expires_at"]})]
    assert client.post("/api/cases/abcdef123456/decision", json={"status": "held"}).status_code == 404


def test_call_log_is_kept_with_the_case_and_private():
    store = MemoryStore()
    client = client_with(store)
    case_id = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    call = client.post(f"/api/cases/{case_id}/notes",
                       json={"kind": "call", "text": "Customer called the fraud team quoting LMG-ABC123", "author": "customer"})
    assert call.status_code == 200
    notes = client.post(f"/api/cases/{case_id}/notes",
                        json={"kind": "note", "text": "Says the bank told them to move money\nand stay on the line.", "author": " Priya "})
    assert notes.status_code == 200
    saved = client.get("/api/cases").json()["cases"][0]["notes"]
    assert [note["kind"] for note in saved] == ["call", "note"]
    assert saved[1]["author"] == "Priya" and isinstance(saved[1]["at"], str)

    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": "x"},
                       headers=as_browser(client, BROWSER_B)).status_code == 404
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": "x"},
                       headers={"X-LMG-Session": ""}).status_code == 401
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "decision", "text": "x"}).status_code == 422
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": ""}).status_code == 422
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": "x" * 2001}).status_code == 422


def test_call_log_has_a_limit_and_needs_storage():
    store = MemoryStore()
    client = client_with(store)
    case_id = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    owner = owner_of(BROWSER_A)
    for _ in range(store_module.MAX_NOTES_PER_CASE):  # straight to the store: the API's rate limit would stop a loop
        assert store.add_note(case_id, owner, store_module.note_record("note", "ok", "analyst")) is not None
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": "one too many"}).status_code == 404
    assert client_with(NoStore()).post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": "x"}).status_code == 503


def test_firestore_store_appends_to_the_call_log():
    fake = FakeFirestore()
    client = client_with(FirestoreStore(client=fake))
    case_id = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "call", "text": "Customer called"}).status_code == 200
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "check", "text": "high risk (90/100)."}).status_code == 200
    assert [note["kind"] for note in fake.docs[f"cases/{case_id}"]["notes"]] == ["call", "check"]
    assert client.post(f"/api/cases/{case_id}/notes", json={"kind": "note", "text": "x"},
                       headers=as_browser(client, BROWSER_B)).status_code == 404


def test_firestore_store_hides_expired_cases():
    fake = FakeFirestore()
    client = client_with(FirestoreStore(client=fake))
    case_id = client.post("/api/assess", json=LONG_NOTE).json()["execution"]["request_id"]
    fake.docs[f"cases/{case_id}"]["expires_at"] = store_module.utc_now() - timedelta(seconds=1)
    assert client.get("/api/cases").json()["cases"] == []
    assert client.post(f"/api/cases/{case_id}/decision", json={"status": "held"}).status_code == 404


def test_case_record_keeps_follow_up_questions():
    outcome = {"action": "ask", "score": 30, "questions": ["Who is this for?"], "round": 1,
               "audit": {}, "execution": {}}
    record = case_record("abcdef123456", {"amount": 5}, {"id": "web", "segment": "family"}, "rent", None, None, outcome,
                         owner_of(BROWSER_A))
    assert record["questions"] == ["Who is this for?"]
    assert record["customer"] == {"segment": "family"}


def test_store_is_chosen_from_settings(monkeypatch):
    monkeypatch.delenv("LMG_FIRESTORE", raising=False)
    monkeypatch.delenv("LMG_STORE", raising=False)
    assert isinstance(store_module.store_from_environment(), NoStore)
    monkeypatch.setenv("LMG_STORE", "memory")
    assert isinstance(store_module.store_from_environment(), MemoryStore)
    monkeypatch.setenv("LMG_FIRESTORE", "1")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "demo-project")
    chosen = store_module.store_from_environment()
    assert isinstance(chosen, FirestoreStore) and chosen._project == "demo-project"
