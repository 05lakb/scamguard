import { useEffect, useRef, useState } from "react";
import type { AssessmentEvent, AssessmentStage } from "../api";
import { Icon, type IconName } from "./Icon";

const STEPS: { stage: AssessmentStage; title: string; role: string; icon: IconName }[] = [
  { stage: "request", title: "Payment received", role: "Validate input", icon: "user" },
  { stage: "behaviour", title: "FraudShield", role: "Payment rules", icon: "chart" },
  { stage: "network", title: "MuleNet", role: "Account-link rules", icon: "server" },
  { stage: "message", title: "ScamStop", role: "Gemini analysis", icon: "brain" },
  { stage: "decision", title: "Recommendation", role: "Combine evidence", icon: "shield" },
];
const LABELS = { running: "Running", complete: "Complete", skipped: "Not used", failed: "Unavailable", waiting: "Waiting", stopped: "Interrupted" };
const names: Record<AssessmentStage, string> = { request: "Request", behaviour: "FraudShield", network: "MuleNet", message: "ScamStop", clarify: "Follow-up", decision: "Decision" };

export function LiveExecution({ events, busy, error }: { events: AssessmentEvent[]; busy: boolean; error: string }) {
  const [selection, setSelection] = useState<AssessmentStage | null>(null);
  const feed = useRef<HTMLOListElement>(null);
  const latest = (stage: AssessmentStage) => events.filter(event => event.stage === stage).at(-1);
  const last = events.at(-1);
  const selected = selection ?? last?.stage ?? "message";
  const detail = latest(selected);
  const active = busy ? [...events].reverse().find(event => latest(event.stage)?.status === "running")?.stage : undefined;
  useEffect(() => { setSelection(null); }, [events[0]?.request_id]);
  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [events.length]);

  return <section className="execution-stage" aria-labelledby="execution-title">
    <header className="execution-stage-head">
      <div><span className="eyebrow">Live execution</span><h2 id="execution-title">Watch the evidence become a decision.</h2></div>
      <span className={`execution-connection ${busy ? "on" : ""}`}><i aria-hidden="true" />{busy ? "Receiving backend events" : error ? "Run interrupted" : last ? "Run complete" : "Ready to run"}</span>
    </header>
    <p className="execution-caption">Each stage updates from the server. Select a check to inspect what it found.</p>

    <ol className="execution-pipeline" aria-label="Assessment execution stages">
      {STEPS.map((step, index) => {
        const event = latest(step.stage);
        const state = event?.status === "running" && error ? "stopped" : event?.status ?? (error ? "stopped" : "waiting");
        return <li key={step.stage} className={`execution-node ${state} ${active === step.stage ? "active" : ""}`}>
          <button type="button" aria-pressed={selected === step.stage} onClick={() => setSelection(step.stage)}>
            <span className="execution-node-top"><span className="execution-node-icon"><Icon name={step.icon} size={21} /></span><span className="execution-step-number">0{index + 1}</span></span>
            <strong>{step.title}</strong><span className="execution-node-role">{step.role}</span>
            <span className="execution-node-state"><i aria-hidden="true" />{LABELS[state]}{event && <small>+{event.elapsed_ms.toLocaleString()} ms</small>}</span>
          </button>
        </li>;
      })}
    </ol>

    <div className="execution-inspection">
      <section className="execution-findings" aria-labelledby="findings-title">
        <div className="execution-pane-head"><h3 id="findings-title">{names[selected]} · Findings</h3>{selection && <button type="button" onClick={() => setSelection(null)}>Follow live</button>}</div>
        <p className="execution-detail" role="status">{error && detail?.status === "running" ? error : detail?.detail ?? "Run a payment to see the actual findings here."}</p>
        {detail?.summary && <blockquote>{detail.summary}</blockquote>}
        <div className="execution-output-tags">
          {detail?.score !== undefined && detail.status === "complete" && <span>Rule score <strong>{detail.score}/100</strong></span>}
          {detail?.mode && <span>{detail.mode === "cached" ? "Saved Gemini reading" : detail.mode === "live" ? "Fresh Gemini response" : "Test reader"}</span>}
          {selected === "message" && detail?.status === "running" && <span className="execution-wait">Waiting for validated message analysis…</span>}
        </div>
        <p className="execution-findings-note">Synthetic payment. Scores are rule indicators. An analyst reviews the recommendation.</p>
      </section>

      <section className="execution-terminal" aria-labelledby="event-feed-title">
        <div className="execution-pane-head"><h3 id="event-feed-title"><span aria-hidden="true">›_</span> Backend event feed</h3><span>{events.length} events</span></div>
        <ol ref={feed} role="log" aria-live="polite" aria-relevant="additions" aria-label="Backend execution events">
          {events.length ? events.map((event, index) => <li key={`${event.request_id}-${index}`} className={event.status}>
            <time>+{event.elapsed_ms.toLocaleString()} ms</time><div><strong>{names[event.stage]} <span>{LABELS[event.status]}</span></strong><p>{event.detail}</p></div>
          </li>) : <li className="execution-feed-empty"><span>No run yet.<br />Start a live check to receive server events.</span></li>}
          {error && <li className="failed"><span>{error}</span></li>}
        </ol>
        <footer>{last ? `Request ${last.request_id}` : "Connected when a run starts"}<span>Stage events + validated outputs</span></footer>
      </section>
    </div>
  </section>;
}
