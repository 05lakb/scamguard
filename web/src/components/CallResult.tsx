import type { Verification } from "../api";
import { Icon } from "./Icon";

const SUGGESTION = { allow: "release the payment", warn: "release it with a warning", hold: "keep it on hold" } as const;

// Back on Transactions after the customer's call: what was said, what the AI found, what it suggests,
// and that the case has gone to the analyst. Before the call, it invites the customer to call.
export function CallResult({ verification, onCall, onOpenCase, why }: {
  verification: Verification | null | undefined;
  onCall: () => void;
  onOpenCase: () => void;
  why?: string | null; // why a hold stays after the call
}) {
  const outcome = verification?.outcome;
  if (!verification || !outcome) {
    return (
      <section className="call-result waiting" aria-label="Next step: the customer's call">
        <div>
          <strong>Next: the customer calls the fraud desk</strong>
          <p className="muted small">The call opens on the Voice AI page. The AI agent asks two questions and Voice AI analyses the conversation; then you come back here.</p>
        </div>
        <button className="btn small primary" onClick={onCall}><Icon name="mic" size={14} /> Call fraud team</button>
      </section>
    );
  }
  const reading = outcome.reading;
  const signs = [
    reading?.coached && "sounds coached",
    reading?.evasive && "evasive",
    reading?.contradicts_first_note && "contradicts the first note",
    reading?.secrecy === "concealment" && "told to keep it secret",
    reading?.verified_independently && "checked independently",
  ].filter(Boolean) as string[];
  return (
    <section className={`call-result ${outcome.action}`} aria-label="The customer's call and the agent's recommendation">
      <h3 className="mini"><Icon name="mic" size={15} /> The customer's call with the AI agent</h3>
      <ol className="call-log">
        {verification.questions.map((question, index) => (
          <li key={question}>
            <span className="muted small">AI agent: {question}</span>
            <span>Customer: {verification.answers[index] || "(no answer)"}</span>
          </li>
        ))}
      </ol>
      <ul className="call-findings">
        <li><strong>Gemini:</strong> {reading ? `scam likelihood ${reading.scam_likelihood ?? "?"}/100${signs.length ? `, ${signs.join(", ")}` : ", no coaching signs"}.` : "could not read the answers, so the original decision stands."}</li>
        {outcome.voice && <li><strong>Voice AI:</strong> {outcome.voice.risk_level} risk{outcome.voice.tactics.length && outcome.voice.tactics[0] !== "none" ? ` (${outcome.voice.tactics.join(", ")})` : ""}.</li>}
        <li><strong>Risk:</strong> {outcome.before_score} → {outcome.score}{outcome.kept_hold ? `. Held regardless: ${outcome.kept_hold}` : "."}</li>
      </ul>
      {why && <p className="call-why"><Icon name="hold" size={15} /> <span>{why}</span></p>}
      <div className="call-result-foot">
        <p><strong>Agent's recommendation: {SUGGESTION[outcome.action]}.</strong> The agent's work is done. The case is with the analyst, who makes the decision.</p>
        <button className="btn small primary" onClick={onOpenCase}>Open the case (analyst) <Icon name="arrow" size={14} /></button>
      </div>
    </section>
  );
}
