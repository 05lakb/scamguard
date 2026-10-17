import { useEffect, useRef, useState } from "react";
import { fetchCase, sendVerificationAnswers, startVerification, type Verification } from "../api";
import { Icon, type IconName } from "./Icon";

const ACTIVE = new Set(["calling", "ringing", "in_call", "checking"]);
const POLL_MS = 2000;
const ACTION_WORD = { allow: "Allow", warn: "Warn", hold: "Hold" } as const;

type StepState = "done" | "now" | "todo" | "failed";

// After a hold: the customer asks the AI analyst to call their own number, or types the answers.
// The page shows each step the agent takes, the answers as they arrive, and the new decision.
export function VerificationPanel({ caseId, score, topReason, onDone, onOpenCase }: {
  caseId: string; // the server's case id
  score: number;
  topReason?: string;
  onDone: (verification: Verification) => void;
  onOpenCase: () => void;
}) {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [phone, setPhone] = useState("+91");
  const [typing, setTyping] = useState(false);
  const [answers, setAnswers] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reported = useRef(false);

  // While a call is in progress, follow it: the status, each answer as it is heard, then the result.
  useEffect(() => {
    if (!verification || !ACTIVE.has(verification.status)) return;
    const timer = window.setInterval(async () => {
      try {
        setVerification((await fetchCase(caseId)).verification);
      } catch {
        /* keep the last state; the next poll tries again */
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [caseId, verification?.status]);

  useEffect(() => {
    if (verification?.status === "done" && !reported.current) {
      reported.current = true;
      onDone(verification);
    }
  }, [verification?.status]);

  async function run(action: () => Promise<{ verification: Verification | null }>) {
    setBusy(true);
    setError("");
    try {
      setVerification((await action()).verification);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const callMe = () => run(() => startVerification(caseId, "phone", phone));
  const typeInstead = async () => {
    setTyping(true);
    if (!verification || verification.status === "no_answer") await run(() => startVerification(caseId, "typed"));
  };
  const submitTyped = () => run(() => sendVerificationAnswers(caseId, answers));

  const v = verification;
  const outcome = v?.outcome ?? null;
  const calling = v?.mode === "phone";
  const steps: { icon: IconName; title: string; detail: string; state: StepState }[] = [
    { icon: "hold", title: "Payment held", detail: `Risk ${score}/100${topReason ? `. ${topReason}` : ""}`, state: "done" },
    {
      icon: "brain", title: "Questions prepared",
      detail: v ? v.questions.map((question, index) => `${index + 1}. ${question}`).join("  ") : "Gemini writes two questions from this case's reasons.",
      state: v ? "done" : "todo",
    },
    {
      icon: calling ? "user" : "list",
      title: calling ? `Calling ${v?.phone ?? ""}` : v ? "Answers typed in the app" : "Reach the customer",
      detail: !v ? "The customer asks for a call to their own number, or types the answers."
        : v.status === "no_answer" ? "The call was not answered. The customer can type the answers instead."
        : calling ? ({ calling: "Placing the call…", ringing: "Ringing…", in_call: "On the call: the AI analyst is asking the questions." } as Record<string, string>)[v.status] ?? "Call finished."
        : "Typed answers received.",
      state: !v ? "todo" : v.status === "no_answer" ? "failed" : ["calling", "ringing", "in_call", "awaiting_answers"].includes(v.status) ? "now" : "done",
    },
    {
      icon: "mic", title: "What the customer said",
      detail: v && v.answers.length ? v.answers.map((answer, index) => `${index + 1}. "${answer || "(no answer)"}"`).join("  ") : "Answers appear here as they are heard.",
      state: v && v.answers.length ? "done" : "todo",
    },
    {
      icon: "search", title: "Agent re-checks the payment",
      detail: v?.status === "checking" ? "Gemini reads the answers for coaching, secrecy and contradictions; Voice AI scans them for scam-call patterns; the rules re-score."
        : outcome ? readingLine(outcome) : "Gemini reads the answers; Voice AI scans them; the rules re-score.",
      state: v?.status === "checking" ? "now" : outcome ? "done" : "todo",
    },
    {
      icon: outcome?.action === "hold" ? "hold" : outcome?.action === "warn" ? "warn" : "allow",
      title: outcome ? `New decision: ${ACTION_WORD[outcome.action]}` : "New decision",
      detail: outcome ? `Risk ${outcome.before_score} → ${outcome.score}.${outcome.kept_hold ? ` Held regardless: ${outcome.kept_hold}` : ""}` : "Allow, warn or hold, with the reasons.",
      state: outcome ? "done" : "todo",
    },
  ];

  return (
    <section className="verify-panel" aria-labelledby="verify-title" aria-live="polite">
      <div className="verify-head">
        <h3 id="verify-title" className="mini"><Icon name="shield" size={15} /> Verify with the customer: AI analyst</h3>
        <span className="tag">Prototype</span>
      </div>
      <p className="muted small">
        The customer asked for this in their app, so the bank is not cold-calling. The AI analyst asks two questions,
        the agent re-checks the payment, and anything still held goes to Cases for a person.
      </p>

      <ol className="agent-steps">
        {steps.map((step) => (
          <li key={step.title} className={`agent-step ${step.state}`}>
            <span className="agent-step-icon"><Icon name={step.icon} size={14} /></span>
            <span><strong>{step.title}</strong><small>{step.detail}</small></span>
          </li>
        ))}
      </ol>

      {(!v || v.status === "no_answer") && !typing && (
        <div className="verify-actions">
          <label className="f-label" htmlFor="verify-phone">Customer's phone number (with country code)</label>
          <div className="verify-row">
            <input id="verify-phone" className="f-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={16}
              value={phone} onChange={(event) => setPhone(event.target.value)} />
            <button className="btn small primary" onClick={callMe} disabled={busy}><Icon name="user" size={14} /> {busy ? "Calling…" : "Call me now"}</button>
            <button className="btn small" onClick={typeInstead} disabled={busy}>Type the answers instead</button>
          </div>
          <p className="muted small">
            The call uses Twilio. On our trial account it reaches only the team's verified numbers, so judges should use
            <strong> Type the answers instead</strong>: the re-check is exactly the same.
          </p>
        </div>
      )}

      {typing && v && v.status === "awaiting_answers" && (
        <div className="verify-actions">
          {v.questions.map((question, index) => (
            <label key={question} className="f-label">{question}
              <textarea className="f-area" maxLength={500} value={answers[index] ?? ""}
                onChange={(event) => setAnswers((old) => old.map((answer, at) => (at === index ? event.target.value : answer)))} />
            </label>
          ))}
          <button className="btn small primary" onClick={submitTyped} disabled={busy || answers.every((answer) => !answer.trim())}>
            {busy ? "Checking…" : "Send answers"}
          </button>
        </div>
      )}

      {error && <p className="problem" role="alert">{error}</p>}

      {outcome && (
        <div className={`verify-result ${outcome.action}`}>
          <p><strong>{outcome.action === "hold" ? "Still held. Sent to Cases for an analyst." : outcome.action === "warn" ? "Warning: the customer can go ahead after reading the advice." : "Cleared: the payment can go ahead (simulated)."}</strong></p>
          <ul className="small">{outcome.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {outcome.action === "hold" && <button className="btn small" onClick={onOpenCase}>Open the case <Icon name="arrow" size={14} /></button>}
        </div>
      )}
    </section>
  );
}

function readingLine(outcome: NonNullable<Verification["outcome"]>): string {
  const reading = outcome.reading;
  const signs: string[] = [];
  if (reading?.coached) signs.push("sounds coached");
  if (reading?.evasive) signs.push("evasive");
  if (reading?.contradicts_first_note) signs.push("contradicts the first note");
  if (reading?.secrecy === "concealment") signs.push("told to keep it secret");
  if (reading?.verified_independently) signs.push("customer checked independently");
  const gemini = reading ? `Gemini: scam likelihood ${reading.scam_likelihood ?? "?"}/100${signs.length ? `, ${signs.join(", ")}` : ", no coaching signs"}.` : "Gemini could not read the answers.";
  const voice = outcome.voice ? ` Voice AI: ${outcome.voice.risk_level} risk${outcome.voice.tactics.length ? ` (${outcome.voice.tactics.join(", ")})` : ""}.` : "";
  return gemini + voice;
}
