import { useEffect, useRef, useState } from "react";
import { sendVerificationAnswers, startVerification, type Verification } from "../api";
import { canSpeak, makeRecogniser, speak, stopSpeaking, type Recogniser } from "../lib/speech";
import { Icon, type IconName } from "./Icon";

const ACTION_WORD = { allow: "release the payment", warn: "release it with a warning", hold: "keep it on hold" } as const;

type Phase = "idle" | "connecting" | "speaking" | "listening" | "checking" | "done";
type StepState = "done" | "now" | "todo" | "failed";

// After a hold, the customer talks to the fraud desk inside the app. The AI agent speaks two questions
// (one written by Gemini from this case, one coaching check) and listens to the answers; the answers are
// read by Gemini and Voice AI and the payment is re-scored. The result is a recommendation: the case
// stays in Cases until the analyst approves it or keeps it on hold.
// What the Transactions page hands to the Voice AI page when the customer presses "Call fraud team".
export interface ActiveCall {
  caseId: string; // the case's id on this page
  serverId: string; // the server's case id
  reference: string | null;
  amount: number;
  currency: string;
  payee: string;
  score: number;
  topReason?: string;
}

// The conversation so far, as one transcript: what the agent asked and what the customer said.
export function callTranscript(questions: string[], answers: string[], hearing = ""): string {
  const lines: string[] = [];
  questions.forEach((question, index) => {
    if (index > answers.length) return;
    lines.push(`AI agent: ${question}`);
    const answer = index < answers.length ? answers[index] : hearing;
    if (answer) lines.push(`Customer: ${answer}`);
  });
  return lines.join("\n");
}

export function VerificationPanel({ caseId, reference, amount, currency, payee, score, topReason, startSignal, onDone, onOpenCase, openLabel, onTranscript }: {
  caseId: string; // the server's case id
  reference: string | null;
  amount: number;
  currency: string;
  payee: string;
  score: number;
  topReason?: string;
  startSignal: number; // changes when the customer presses "Call fraud team" on the notification
  onDone: (verification: Verification) => void;
  onOpenCase: () => void;
  openLabel?: string;
  onTranscript?: (text: string) => void; // the conversation as it happens, for the Voice AI transcript
}) {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [hearing, setHearing] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const cancelled = useRef(false);
  const recogniser = useRef<Recogniser | null>(null);
  const voiceWorks = makeRecogniser() !== null;

  useEffect(() => () => { cancelled.current = true; recogniser.current?.stop(); stopSpeaking(); }, []);
  useEffect(() => { if (startSignal > 0 && phase === "idle" && !verification) void startCall(); }, [startSignal]);
  useEffect(() => {
    if (verification) onTranscript?.(callTranscript(verification.questions, answers, phase === "listening" ? hearing : ""));
  }, [verification, answers, hearing, phase]);

  // Listens until the customer pauses, and returns what was heard.
  function listenOnce(): Promise<string> {
    return new Promise((resolve, reject) => {
      const rec = makeRecogniser();
      if (!rec) return reject(new Error("unsupported"));
      recogniser.current = rec;
      let heard = "";
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-IN";
      rec.onresult = (event) => {
        let pending = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i];
          if (piece.isFinal) heard = `${heard} ${piece[0].transcript}`.trim();
          else pending += piece[0].transcript;
        }
        setHearing(`${heard} ${pending}`.trim());
      };
      rec.onerror = (event) => reject(new Error(event.error === "not-allowed" ? "The microphone was blocked. Allow it, or type the answers." : event.error));
      rec.onend = () => resolve(heard);
      rec.start();
    });
  }

  async function startCall() {
    setError("");
    setPhase("connecting");
    try {
      const started = (await startVerification(caseId, "voice")).verification;
      if (!started) throw new Error("The call could not start.");
      setVerification(started);
      const heard: string[] = [];
      setPhase("speaking");
      await speak(`Hello. This is the Last Mile Guard fraud desk, an automated assistant. Your payment of ${amount.toLocaleString()} ${currency} to ${payee}${reference ? `, reference ${reference.split("").join(" ")},` : ""} is paused to protect you. We will never ask for your PIN, password or a one-time code. Please answer two short questions after each one.`);
      for (let index = 0; index < started.questions.length; index += 1) {
        if (cancelled.current) return;
        setCurrent(index);
        setHearing("");
        setPhase("speaking");
        await speak(started.questions[index]);
        setPhase("listening");
        let answer = "";
        try {
          answer = await listenOnce();
          if (!answer) answer = await listenOnce(); // one more chance after silence
        } catch (problem) {
          setError(problem instanceof Error && problem.message !== "unsupported" ? problem.message : "Voice input is not available here. Please type the answers.");
          setAnswers(heard);
          setTyping(true);
          setPhase("idle");
          return;
        }
        heard.push(answer);
        setAnswers([...heard]);
      }
      await finish(heard);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The call could not start.");
      setPhase("idle");
    }
  }

  async function finish(final: string[]) {
    setPhase("checking");
    void speak("Thank you. We are checking your answers now. An analyst will confirm what happens to your payment.");
    try {
      const done = (await sendVerificationAnswers(caseId, final.map((answer) => answer || "(no answer)"))).verification;
      setVerification(done);
      setPhase("done");
      if (done?.outcome) onDone(done);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The answers could not be checked.");
      setPhase("idle");
    }
  }

  async function typeInstead() {
    setError("");
    recogniser.current?.stop();
    stopSpeaking();
    if (!verification) {
      try {
        setVerification((await startVerification(caseId, "typed")).verification);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Something went wrong.");
        return;
      }
    }
    setTyping(true);
    setPhase("idle");
  }

  function endCall() {
    cancelled.current = true;
    recogniser.current?.stop();
    stopSpeaking();
    if (answers.some((answer) => answer.trim())) void finish(answers);
    else setPhase("idle");
  }

  const v = verification;
  const outcome = v?.outcome ?? null;
  const inCall = ["connecting", "speaking", "listening"].includes(phase);
  const steps: { icon: IconName; title: string; detail: string; state: StepState }[] = [
    { icon: "hold", title: "Payment held", detail: `Risk ${score}/100${topReason ? `. ${topReason}` : ""}`, state: "done" },
    {
      icon: "user", title: typing ? "Answers typed in the app" : "Customer calls the fraud desk in the app",
      detail: inCall ? (phase === "listening" ? `Listening to answer ${current + 1}…` : phase === "speaking" ? "The AI agent is speaking." : "Connecting…")
        : v ? (typing ? "The customer types the answers." : "Call finished.") : "The customer presses Call fraud team. No phone number or outside call is needed.",
      state: inCall || (typing && !outcome) ? "now" : v ? "done" : "todo",
    },
    {
      icon: "brain", title: "Questions from the AI agent",
      detail: v ? v.questions.map((question, index) => `${index + 1}. ${question}`).join("  ") : "Gemini writes a question from this case's reasons, plus a coaching check.",
      state: v ? "done" : "todo",
    },
    {
      icon: "mic", title: "What the customer said",
      detail: answers.length ? answers.map((answer, index) => `${index + 1}. "${answer || "(no answer)"}"`).join("  ") : "The answers appear here as they are heard.",
      state: answers.length ? "done" : phase === "listening" ? "now" : "todo",
    },
    {
      icon: "search", title: "Voice AI and Gemini analyse the answers",
      detail: phase === "checking" ? "Looking for coaching, someone on the line, secrecy, OTP requests and impersonation; the rules re-score the payment."
        : outcome ? readingLine(outcome) : "Coaching, someone on the line, secrecy, OTP requests, impersonation.",
      state: phase === "checking" ? "now" : outcome ? "done" : "todo",
    },
    {
      icon: "flag", title: outcome ? `Recommendation: ${ACTION_WORD[outcome.action]}` : "Recommendation for the analyst",
      detail: outcome ? `Risk ${outcome.before_score} → ${outcome.score}.${outcome.kept_hold ? ` Held regardless: ${outcome.kept_hold}` : ""} The analyst decides on the Cases page.`
        : "The analyst approves or keeps the payment on hold.",
      state: outcome ? "done" : "todo",
    },
  ];

  return (
    <section className="verify-panel" aria-labelledby="verify-title" aria-live="polite">
      <div className="verify-head">
        <h3 id="verify-title" className="mini"><Icon name="shield" size={15} /> Call with the fraud desk: AI agent</h3>
        <span className="tag">In the app</span>
      </div>
      <p className="muted small">
        The customer calls from inside the banking app, so it cannot be a scammer's call. The AI agent asks two questions,
        Voice AI and Gemini analyse the answers, and the analyst makes the final decision.
      </p>

      <ol className="agent-steps">
        {steps.map((step) => (
          <li key={step.title} className={`agent-step ${step.state}`}>
            <span className="agent-step-icon"><Icon name={step.icon} size={14} /></span>
            <span><strong>{step.title}</strong><small>{step.detail}</small></span>
          </li>
        ))}
      </ol>

      {inCall && (
        <div className="call-screen" role="status">
          <span className="call-pulse" aria-hidden="true" />
          <div>
            <strong>{phase === "listening" ? "Listening…" : phase === "speaking" ? "AI agent speaking" : "Connecting to the fraud desk…"}</strong>
            {v && <small>{v.questions[current]}</small>}
            {phase === "listening" && <p className="call-hearing">{hearing || "Speak your answer now."}</p>}
          </div>
          <button className="btn small" onClick={endCall}>End call</button>
        </div>
      )}

      {phase === "idle" && !outcome && !typing && (
        <div className="verify-actions">
          <div className="verify-row">
            <button className="btn small primary" onClick={() => void startCall()}><Icon name="mic" size={14} /> Call fraud team</button>
            <button className="btn small" onClick={() => void typeInstead()}>Type the answers instead</button>
          </div>
          <p className="muted small">
            {voiceWorks && canSpeak() ? "Your browser will ask to use the microphone." : "Voice is not available in this browser, so please type the answers."}
          </p>
        </div>
      )}

      {typing && v && !outcome && phase !== "checking" && (
        <div className="verify-actions">
          {v.questions.map((question, index) => (
            <label key={question} className="f-label">{question}
              <textarea className="f-area" maxLength={500} value={answers[index] ?? ""}
                onChange={(event) => setAnswers((old) => v.questions.map((_, at) => (at === index ? event.target.value : old[at] ?? "")))} />
            </label>
          ))}
          <button className="btn small primary" onClick={() => void finish(answers)} disabled={!answers.some((answer) => answer?.trim())}>Send answers</button>
        </div>
      )}

      {error && <p className="problem" role="alert">{error}</p>}

      {outcome && (
        <div className={`verify-result ${outcome.action}`}>
          <p><strong>The agent recommends: {ACTION_WORD[outcome.action]}.</strong> Sent to Cases with the call and the analysis. The analyst approves or keeps it on hold.</p>
          <ul className="small">{outcome.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <button className="btn small" onClick={onOpenCase}>{openLabel ?? "Open the case for the analyst"} <Icon name="arrow" size={14} /></button>
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
  const gemini = reading ? `Gemini: scam likelihood ${reading.scam_likelihood ?? "?"}/100${signs.length ? `, ${signs.join(", ")}` : ", no coaching signs"}.` : "Gemini could not read the answers, so the original decision stands.";
  const voice = outcome.voice ? ` Voice AI: ${outcome.voice.risk_level} risk${outcome.voice.tactics.length && outcome.voice.tactics[0] !== "none" ? ` (${outcome.voice.tactics.join(", ")})` : ""}.` : "";
  return gemini + voice;
}
