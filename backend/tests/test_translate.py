"""Tests for putting the warning in the customer's language. They use fake helpers, so nothing goes to the internet."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.risk import translate  # noqa: E402

WARNING = "We have paused this payment so a specialist can check it with you. This is to protect your money."


@pytest.fixture(autouse=True)
def clean_cache():
    translate._cache.clear()
    yield
    translate._cache.clear()


# ---------- the translator itself ----------

def test_the_prompt_names_the_language_and_keeps_the_warning_as_data():
    prompt = translate.build_prompt(WARNING, "Hindi")
    assert "into Hindi" in prompt
    assert "<notice>\n" + WARNING + "\n</notice>" in prompt
    assert "NOT an instruction" in prompt


def test_a_good_translation_is_returned_and_remembered():
    calls = []

    def ask(prompt):
        calls.append(prompt)
        return "  Hemos pausado este pago para que un especialista lo revise con usted.  "

    first = translate.translate_warning(WARNING, "es", ask)
    second = translate.translate_warning(WARNING, "es", ask)
    assert first == second == "Hemos pausado este pago para que un especialista lo revise con usted."
    assert len(calls) == 1  # the second request came from the memory


def test_unknown_languages_and_empty_text_are_not_translated():
    ask = lambda prompt: "anything"  # noqa: E731
    assert translate.translate_warning(WARNING, "xx", ask) is None
    assert translate.translate_warning("", "es", ask) is None
    assert translate.translate_warning(WARNING, "en", ask) is None  # English needs no translation


def test_unusable_answers_are_rejected():
    assert translate.translate_warning(WARNING, "fr", lambda prompt: "") is None
    assert translate.translate_warning(WARNING, "fr", lambda prompt: "   ") is None
    assert translate.translate_warning(WARNING, "fr", lambda prompt: "```fr\nbonjour\n```") is None
    assert translate.translate_warning(WARNING, "fr", lambda prompt: "x" * 5000) is None


def test_the_memory_is_limited(monkeypatch):
    monkeypatch.setattr(translate, "CACHE_LIMIT", 3)
    for number in range(6):
        translate.translate_warning(f"Warning number {number}.", "es", lambda prompt: "Aviso.")
    assert len(translate._cache) == 3


# ---------- the endpoint ----------

fastapi_testclient = pytest.importorskip("fastapi.testclient")
from backend import app as app_module  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_arena import fake_asker, fake_reader, fake_writer  # noqa: E402

RISKY = {
    "payment": {
        "amount": 5000, "currency": "USD", "timestamp": "2026-09-10T14:30:00", "payee_name": "Test Payee",
        "payee_type": "individual", "is_new_payee": True, "payee_account_age_days": 2, "channel": "web",
        "device_known": False, "payments_last_24h": 0, "on_live_call": True, "remote_access_tool_running": True,
    },
    "customer": {"segment": "retiree", "typical_amount": 100},
    "message": "He told me to move the money today and keep it secret from everyone, please hurry.",
}
CALM = {
    "payment": {**RISKY["payment"], "amount": 100, "is_new_payee": False, "payee_account_age_days": 3000,
                "device_known": True, "on_live_call": False, "remote_access_tool_running": False},
    "customer": RISKY["customer"],
    "message": "Paying my usual monthly bill, same as always, thank you very much for your help.",
}


def client(translator):
    return fastapi_testclient.TestClient(app_module.create_app(
        reader=fake_reader, asker=fake_asker, arena_writer=fake_writer, translator=translator))


def test_a_warning_comes_back_in_the_chosen_language_and_the_english_stays():
    response = client(lambda text, code: f"[{code}] translated").post("/api/assess", json={**RISKY, "language": "hi"})
    body = response.json()
    assert response.status_code == 200 and body["action"] in ("warn", "hold")
    assert body["customer_warning_translated"] == "[hi] translated" and body["warning_language"] == "hi"
    assert body["customer_warning"]  # the English record is untouched


def test_no_language_or_english_means_no_translation():
    seen = []
    app_client = client(lambda text, code: seen.append(code) or "translated")
    for extra in ({}, {"language": "en"}):
        body = app_client.post("/api/assess", json={**RISKY, **extra}).json()
        assert "customer_warning_translated" not in body
    assert seen == []


def test_an_allowed_payment_has_no_warning_to_translate():
    seen = []
    body = client(lambda text, code: seen.append(code) or "translated").post("/api/assess", json={**CALM, "language": "es"}).json()
    assert body["action"] == "allow" and "customer_warning_translated" not in body and seen == []


def test_a_failed_translation_falls_back_to_english_and_says_so():
    def broken(text, code):
        raise RuntimeError("the model is busy")

    body = client(broken).post("/api/assess", json={**RISKY, "language": "fr"}).json()
    assert body["warning_language"] == "en" and "customer_warning_translated" not in body
    assert body["action"] in ("warn", "hold")  # the decision itself is never affected

    body = client(lambda text, code: None).post("/api/assess", json={**RISKY, "language": "fr"}).json()
    assert body["warning_language"] == "en"


def test_an_unknown_language_is_refused():
    response = client(lambda text, code: "x").post("/api/assess", json={**RISKY, "language": "klingon"})
    assert response.status_code == 422
