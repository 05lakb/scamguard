import type { AssessmentEvent, AssessmentStage } from "../api";
import { Icon, type IconName } from "./Icon";

const checks: { stage: AssessmentStage; title: string; explanation: string; icon: IconName }[] = [
  { stage: "behaviour", title: "Check the payment", explanation: "Is the amount or payment pattern unusual?", icon: "chart" },
  { stage: "network", title: "Check account links", explanation: "Are there suspicious connections to the recipient?", icon: "server" },
  { stage: "message", title: "Understand the message", explanation: "Gemini looks for pressure, deception and scam signals.", icon: "brain" },
];

export function SimpleExecution({ events, busy, error }: { events: AssessmentEvent[]; busy: boolean; error: string }) {
  return <section className="card simple-checks" aria-labelledby="simple-checks-title">
    <p className="eyebrow">2 · Watch the checks</p><h2 id="simple-checks-title">What is PaySentinel checking?</h2>
    <p className="muted small">These statuses come from the backend as each check runs.</p>
    <ol>{checks.map(check => {
      const event = events.filter(item => item.stage === check.stage).at(-1);
      const state = error && (!event || event.status === "running") ? "failed" : event?.status ?? "waiting";
      const label = state === "running" ? "Checking…" : state === "complete" ? "Done" : state === "skipped" ? "Not needed / no input" : state === "failed" ? "Unavailable" : "Ready";
      return <li key={check.stage} className={state}><span className="simple-check-icon"><Icon name={check.icon} size={20} /></span>
        <div><div className="simple-check-heading"><h3>{check.title}</h3><span>{label}</span></div>
          <p>{event?.detail ?? check.explanation}</p>
          {event?.mode && <span className="simple-ai-label">{event.mode === "live" ? "Fresh Gemini AI response" : event.mode === "cached" ? "Saved Gemini AI response" : "Automated test response"}</span>}
        </div></li>;
    })}</ol>
    <p className="simple-checks-foot" role="status">{error ? error : busy ? "Checking the evidence. The recommendation will appear below." : events.length ? "See the recommendation below, or inspect the live backend details." : "Choose a case and press Check this payment to begin."}</p>
  </section>;
}
