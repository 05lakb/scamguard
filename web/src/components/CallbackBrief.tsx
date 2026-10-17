import { useState } from "react";
import { requestCallbackBrief, type CallbackBrief as Brief } from "../api";
import type { CaseItem } from "../lib/cases";
import { Icon } from "./Icon";

// Helps the analyst before they phone the customer about a warned or held payment.
// The agent never calls the customer: a "call from the bank" is often the scam itself.
export function CallbackBrief({ item }: { item: CaseItem }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    setLoading(true);
    setError("");
    try {
      setBrief(await requestCallbackBrief({ ...item, typology: item.audit?.message_reading?.matched_typology }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The call-back questions could not be prepared.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="callback-brief" aria-live="polite">
      <div className="callback-head">
        <h3 className="mini"><Icon name="user" size={15} /> Call-back brief for the analyst</h3>
        {!brief && (
          <button className="ghost" onClick={prepare} disabled={loading}>
            {loading ? "Preparing…" : "Prepare call-back questions"}
          </button>
        )}
      </div>
      <p className="muted small">
        The agent never phones the customer: a call "from the bank" is often the scam itself. A person makes this call,
        or takes the customer's call on the number printed on their card.
      </p>
      {error && <p className="problem" role="alert">{error}</p>}
      {brief && (
        <>
          <p className="callback-summary">{brief.summary}</p>
          <ol className="callback-questions">
            {brief.questions.map((question) => <li key={question}>{question}</li>)}
          </ol>
          <p className="muted small">
            {brief.source === "gemini"
              ? "Written by Gemini from this case. It never asks for an OTP, PIN or password, and it cannot change the decision."
              : "Standard safety questions, matched to the scam type when one was found (Gemini was not used for this brief)."}
          </p>
        </>
      )}
    </div>
  );
}
