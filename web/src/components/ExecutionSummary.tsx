import type { BackendExecution } from "../api";

const MODES: Record<BackendExecution["message_mode"], { label: string; detail: string }> = {
  gemini_live: { label: "Fresh Gemini analysis", detail: "Gemini was called for this message." },
  gemini_cached: { label: "Saved Gemini analysis", detail: "Reused a previous reading of the same message. Gemini was not called again for the reading." },
  fallback_payment_only: { label: "Message analysis unavailable", detail: "The recommendation uses payment checks and any supplied account links." },
  not_requested: { label: "No message analysis requested", detail: "No message reading was needed for this assessment." },
  injected_reader: { label: "Automated test reader", detail: "This response used a test reader instead of Gemini." },
};

export function ExecutionSummary({ execution }: { execution: BackendExecution }) {
  const mode = MODES[execution.message_mode];
  return (
    <div className="execution-panel" role="status">
      <strong>{mode.label}</strong>
      <span>{mode.detail}</span>
      <span>Backend assessment: {execution.duration_ms < 1 ? "less than 1 ms" : `${execution.duration_ms.toLocaleString()} ms`}</span>
      <span>MuleNet: {execution.network_checked ? "synthetic account graph checked" : "no account graph supplied for this scenario"}</span>
      <span className="muted small">Request {execution.request_id} · {execution.message_mode}</span>
      <span className="muted small">Risk scores are rule-based indicators, not calibrated fraud probabilities.</span>
    </div>
  );
}
