import type { CaseItem } from "../lib/cases";
import { ExecutionSummary } from "./ExecutionSummary";

// Display assessment evidence that the backend actually supplied. Never invent agent scores.
export function AgentEvidence({ item }: { item: CaseItem }) {
  const audit = item.audit;
  if (!audit) {
    return (
      <section className="agent-evidence" aria-label="Agent findings">
        <h3 className="mini">Agent evidence</h3>
        <p className="notice">Recorded demonstration case. Its original per-agent audit was not stored; run a new scenario to inspect actual backend results.</p>
        {item.parts && <p className="muted small">Stored sample contributions: payment +{item.parts.payment}, message +{item.parts.message}. These are not live scores.</p>}
      </section>
    );
  }

  const mode = item.execution?.message_mode;
  const reading = audit.message_reading;
  const messageDetail = item.execution?.message_mode === "fallback_payment_only"
    ? "Message analysis unavailable. The recommendation uses payment checks and any supplied account links."
    : reading
      ? `Message contribution ${audit.message_points >= 0 ? "+" : ""}${audit.message_points}. ${reading.explanation}`
      : "No message evidence supplied for this case.";

  return (
    <section className="agent-evidence" aria-label="Three agent investigation results">
      <h3 className="mini">AI investigation · actual evidence</h3>
      <div className="agent-result">
        <div className="agent-result-head"><strong>TxnGuard · Payment behaviour</strong><span className="pill">{audit.behaviour_score} points</span></div>
        <ul className="agent-signal-list">
          {audit.behaviour_signals.length
            ? audit.behaviour_signals.map((signal, i) => <li key={`${signal.name}-${i}`}>{signal.reason} ({signal.points >= 0 ? "+" : ""}{signal.points})</li>)
            : <li>No elevated payment-behaviour signal recorded.</li>}
        </ul>
      </div>
      <div className="agent-result">
        <div className="agent-result-head"><strong>ScamStop · Customer context</strong><span className="pill">{mode === "gemini_live" ? "Gemini executed" : mode === "gemini_cached" ? "Cached model output" : mode === "fallback_payment_only" ? "Fallback" : reading ? "Message evaluated" : "No reading"}</span></div>
        <p className="muted small">{messageDetail}</p>
        {reading && <p className="muted small">Matched category: {reading.matched_typology.replaceAll("_", " ")} · Scam likelihood: {reading.scam_likelihood}/100</p>}
      </div>
      <div className="agent-result">
        <div className="agent-result-head"><strong>MuleNet · Synthetic account links</strong><span className="pill">{audit.network_available ? `${audit.network_score ?? 0} points` : "Not supplied"}</span></div>
        {audit.network_available ? (
          <ul className="agent-signal-list">
            {audit.network_signals?.length
              ? audit.network_signals.map((signal, i) => <li key={`${signal.name}-${i}`}>{signal.reason} ({signal.points >= 0 ? "+" : ""}{signal.points})</li>)
              : <li>Network evaluated; no elevated relationship signal found.</li>}
          </ul>
        ) : <p className="muted small">No account graph was provided for this assessment. No network-risk claim is made.</p>}
      </div>
      {item.execution && <ExecutionSummary execution={item.execution} />}
    </section>
  );
}
