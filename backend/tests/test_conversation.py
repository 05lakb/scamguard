"""Voice AI conversation analysis: rule fallback and AI reader handling."""

from backend.risk.conversation import analyse, rule_reading

VISHING = ("Hello, I am calling from your bank's security department. Your account will be blocked today "
           "unless you verify your identity. Give me the OTP sent to your phone immediately.")


def test_classic_vishing_script_is_high_risk():
    result = analyse(VISHING)
    assert result["source"] == "rules"
    assert result["risk_level"] == "high"
    tactics = set(result["tactics"])
    assert {"authority", "credential_request", "fear", "urgency"} <= tactics


def test_ordinary_call_is_low_risk():
    result = analyse("Hi mum, I will be home for dinner at eight. Can you buy some milk on the way?")
    assert result["risk_level"] == "low"
    assert result["tactics"] == ["none"]
    assert result["scam_likelihood"] == 0


def test_remote_access_request_is_detected():
    reading = rule_reading("Please install AnyDesk so our technician can fix your refund.")
    assert "remote_control" in reading["tactics"]
    assert reading["scam_likelihood"] >= 30


def test_ai_reader_result_is_used_when_available():
    def reader(text, scam_types):
        return {"scam_likelihood": 91, "tactics": ["authority"], "suspicious_phrases": ["calling from your bank"],
                "explanation": "Bank impersonation.", "matched_typology": "bank_impersonation",
                "orders_found_in_message": []}
    result = analyse(VISHING, reader=reader)
    assert result["source"] == "gemini"
    assert result["scam_likelihood"] == 91
    assert result["matched_typology"] == "bank_impersonation"


def test_failing_ai_reader_falls_back_to_rules():
    def reader(text, scam_types):
        raise RuntimeError("no key")
    result = analyse(VISHING, reader=reader)
    assert result["source"] == "rules"
    assert "notice" in result
    assert result["risk_level"] == "high"
