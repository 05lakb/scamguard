import { useEffect, useRef, useState } from "react";
import { streamAssessment, type AssessmentEvent, type AssessRequest, type ServerDecision } from "../api";
import { EvidenceBars } from "../components/EvidenceBars";
import { ExecutionSummary } from "../components/ExecutionSummary";
import { LiveExecution } from "../components/LiveExecution";
import { SimpleExecution } from "../components/SimpleExecution";
import { Icon } from "../components/Icon";
import type { AccountNetwork, Customer, Payment } from "../core/types";
import { contributions } from "../lib/contrib";
import { SEGMENT_LABEL } from "../lib/labels";
import { LANGUAGES, isRightToLeft } from "../lib/languages";

export interface Scenario {
  id: string;
  title: string;
  group: "scam" | "genuine";
  kind: string;
  difficulty: string;
  blurb: string;
  customer: Pick<Customer, "segment" | "typical_amount" | "typical_spend_15d">;
  payment: Payment;
  network?: AccountNetwork;
  message: string;
  sample_reply: string;
}

export interface Autoplay {
  scenarioId: string;
  autoAnswer: boolean;
  nonce: number;
}

export interface FinishedCase {
  scenario: Scenario;
  message: string | null;
  questions?: string[];
  answer?: string;
  decision: ServerDecision;
}

interface Props {
  scenarios: Scenario[];
  onCase: (item: FinishedCase) => void;
  autoplay: Autoplay | null;
  onFinished: () => void;
  onReview: () => void;
}

type Stage = "idle" | "busy" | "asked" | "done";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function chipsFor(p: Payment): { text: string; level: "risk" | "plain" }[] {
  const hour = parseInt(p.timestamp.slice(11, 13), 10);
  const chips: { text: string; level: "risk" | "plain" }[] = [
    p.is_new_payee
      ? { text: `New payee, account ${p.payee_account_age_days} days old`, level: "risk" }
      : { text: "Known payee", level: "plain" },
  ];
  if (p.on_live_call) chips.push({ text: "On a phone call", level: "risk" });
  if (p.remote_access_tool_running) chips.push({ text: "Remote-control tool running", level: "risk" });
  if (!p.device_known) chips.push({ text: "New device", level: "risk" });
  if (p.payments_last_24h >= 2) chips.push({ text: `${p.payments_last_24h} payments in 24 hours`, level: "risk" });
  if (p.payee_type === "crypto_exchange") chips.push({ text: "Crypto exchange", level: "risk" });
  if (hour >= 1 && hour <= 5) chips.push({ text: "Night-time payment", level: "risk" });
  if (!chips.some((chip) => chip.level === "risk") ) chips.push({ text: "Nothing unusual in the payment", level: "plain" });
  return chips;
}

function requestFor(sc: Scenario, note: string, language: string, questions?: string[], answer?: string): AssessRequest {
  return {
    payment: sc.payment,
    ...(sc.network ? { network: sc.network } : {}),
    customer: sc.customer,
    message: note.trim() || null,
    ...(language !== "en" ? { language } : {}),
    ...(answer !== undefined ? { questions, answer } : {}),
  };
}

export function Console({ scenarios, onCase, autoplay, onFinished, onReview }: Props) {
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const scenario = scenarios.find((item) => item.id === selectedId) ?? scenarios[0];
  const [note, setNote] = useState(scenario.message);
  const [language, setLanguage] = useState("en"); // the language the customer's warning is shown in
  const [answer, setAnswer] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [first, setFirst] = useState<ServerDecision | null>(null);
  const [result, setResult] = useState<ServerDecision | null>(null);
  const [sentAnswer, setSentAnswer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  useEffect(() => () => { runId.current += 1; controller.current?.abort(); }, []);

  function execute(request: AssessRequest, id: number) {
    controller.current?.abort();
    controller.current = new AbortController();
    setEvents([]);
    return streamAssessment(request, event => {
      if (id === runId.current) setEvents(previous => [...previous, event]);
    }, controller.current.signal);
  }
  const auto = useRef(false);

  function reset() {
    runId.current += 1;
    controller.current?.abort();
    setEvents([]);
    setStage("idle");
    setFirst(null);
    setResult(null);
    setSentAnswer(null);
    setAnswer("");
    setError("");
  }

  function choose(id: string) {
    const next = scenarios.find((item) => item.id === id) ?? scenarios[0];
    setSelectedId(next.id);
    setNote(next.message);
    reset();
  }

  function finish(sc: Scenario, text: string, asked: ServerDecision | null, reply: string | null, final: ServerDecision) {
    setResult(final);
    setStage("done");
    onCase({
      scenario: sc,
      message: text.trim() || null,
      questions: asked?.questions,
      answer: reply ?? undefined,
      decision: final,
    });
    if (auto.current) onFinished();
  }

  async function run(sc: Scenario, text: string, autoAnswer: boolean) {
    const id = ++runId.current;
    setStage("busy");
    setError("");
    setResult(null);
    setFirst(null);
    setSentAnswer(null);
    try {
      const r1 = await execute(requestFor(sc, text, language), id);
      if (id !== runId.current) return;
      if (r1.action !== "ask") {
        finish(sc, text, null, null, r1);
        return;
      }
      setFirst(r1);
      setStage("asked");
      if (autoAnswer) {
        const reply = sc.sample_reply || "It is genuine. I know the person and I have checked.";
        await pause(1600);
        if (id !== runId.current) return;
        setAnswer(reply);
        await pause(1600);
        if (id !== runId.current) return;
        await answerQuestions(id, sc, text, r1, reply);
      }
    } catch (problem) {
      if (id !== runId.current) return;
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
      setStage("idle");
      if (auto.current) onFinished();
    }
  }

  async function answerQuestions(id: number, sc: Scenario, text: string, asked: ServerDecision, reply: string) {
    setStage("busy");
    setError("");
    try {
      const r2 = await execute(requestFor(sc, text, language, asked.questions, reply), id);
      if (id !== runId.current) return;
      setSentAnswer(reply);
      finish(sc, text, asked, reply, r2);
    } catch (problem) {
      if (id !== runId.current) return;
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
      setStage("asked");
    }
  }

  function startManual() {
    auto.current = false;
    void run(scenario, note, false);
  }

  function sendAnswer(text: string) {
    if (!first) return;
    auto.current = false;
    void answerQuestions(runId.current, scenario, note, first, text);
  }

  useEffect(() => {
    if (!autoplay) return;
    const next = scenarios.find((item) => item.id === autoplay.scenarioId);
    if (!next) return;
    // Defer the side effect so StrictMode's setup/cleanup check cannot send two requests.
    const timer = window.setTimeout(() => {
      setSelectedId(next.id);
      setNote(next.message);
      setAnswer("");
      auto.current = true;
      void run(next, next.message, autoplay.autoAnswer);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      runId.current += 1;
      controller.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay?.nonce]);

  const p = scenario.payment;
  const shown = result ?? first;
  const items = shown ? contributions(shown) : [];
  const actionTitle = result ? { hold: "An analyst should review this payment", warn: "Check with the customer before proceeding", allow: "No hold recommended by these checks", ask: "More information is needed" }[result.action] : "";

  return <div className="simple-demo">
    <div className="simple-demo-grid">
      <section className="card simple-payment" aria-labelledby="payment-heading">
        <p className="eyebrow">1 · Choose a payment</p><h2 id="payment-heading">Try a sample case</h2>
        <label className="field" htmlFor="demo-case">Scenario</label>
        <select id="demo-case" value={selectedId} disabled={stage === "busy"} onChange={event => choose(event.target.value)}>
          {scenarios.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <p className="muted small">{scenario.blurb}</p>
        <div className="simple-payment-amount"><strong>{p.amount.toLocaleString()} <small>{p.currency}</small></strong><span>To {p.payee_name}</span></div>
        <label className="field" htmlFor="language">Customer's language, for the warning</label>
        <select id="language" value={language} onChange={event => setLanguage(event.target.value)} disabled={stage === "busy"}>
          {LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <label className="field" htmlFor="note">Customer's message <span className="muted">· you can edit it</span></label>
        <textarea id="note" rows={3} maxLength={2000} value={note} disabled={stage === "busy"} onChange={event => { setNote(event.target.value); if (stage !== "idle") reset(); }} />
        {stage !== "asked" && <button className="primary simple-run" disabled={stage === "busy"} onClick={startManual}>{stage === "busy" ? "Checking payment…" : stage === "done" ? "Check again" : "Check this payment"}</button>}
        <details className="simple-payment-details"><summary>Payment details & history</summary>
          <ul className="chips">{chipsFor(p).map(chip => <li key={chip.text} className={chip.level}>{chip.text}</li>)}</ul>
          <p className="small">{SEGMENT_LABEL(scenario.customer.segment)} · Usually pays about {scenario.customer.typical_amount.toLocaleString()} {p.currency}.</p>
          <p className="small">Previous 15 days: {(p.spend_last_15d ?? 0).toLocaleString()} {p.currency} across {p.payments_last_15d ?? 0} payments.</p>
          <p className="muted small">{scenario.network ? `${scenario.network.transfers.length} synthetic account transfers supplied.` : "No account graph supplied for this case."}</p>
        </details>
      </section>
      <SimpleExecution events={events} busy={stage === "busy"} error={error} />
    </div>

    {(stage === "asked" || (stage === "busy" && first)) && <section className="card simple-followup" aria-labelledby="followup-heading">
      <p className="eyebrow">One more detail</p><h2 id="followup-heading">Last Mile Guard needs the customer's answer</h2>
      <p>{first?.questions?.join(" ")}</p>
      <label className="field" htmlFor="answer">Customer's answer</label><textarea id="answer" rows={2} maxLength={1000} value={answer} disabled={stage === "busy"} onChange={event => setAnswer(event.target.value)} />
      <div className="row"><button className="primary" disabled={stage === "busy"} onClick={() => sendAnswer(answer)}>{stage === "busy" ? "Checking answer…" : "Send answer"}</button>
        {scenario.sample_reply && <button className="ghost" disabled={stage === "busy"} onClick={() => setAnswer(scenario.sample_reply)}>Use sample answer</button>}
        <button className="ghost" disabled={stage === "busy"} onClick={() => sendAnswer("")}>Decline to answer</button></div>
    </section>}

    <section className={`card simple-result ${result?.action ?? ""}`} aria-labelledby="result-heading" aria-live="polite">
      <p className="eyebrow">3 · Understand the result</p>
      {result ? <>
        <div className="simple-result-heading"><div><h2 id="result-heading">{actionTitle}</h2><p className="muted">{result.action === "hold" ? "Hold recommended in this simulation. A person makes the final decision." : result.action === "warn" ? "Warning recommended in this simulation. Verify the situation before proceeding." : "This is a recommendation from the available evidence, not a guarantee that the payment is safe."}</p></div>
          <span className={`status ${result.action}`}>{result.action === "hold" ? "Review needed" : result.action === "warn" ? "Warning" : "No hold"}</span></div>
        {result.notice && <p className="notice">{result.notice}</p>}
        <h3 className="mini">Main reasons</h3><ul className="simple-result-reasons">{result.reasons.slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul>
        {result.reasons.length === 0 && <p className="muted">No elevated risk signals were returned by these checks.</p>}
        <div className="simple-result-next"><p>Next: inspect this case and record a human review.</p><button className="primary" onClick={onReview}>Review this case <Icon name="arrow" size={16} /></button></div>
        <details className="simple-result-details"><summary>Scores, evidence & execution details</summary>
          <p className="muted small">Rule-based risk score: {result.score}/100. This is not a calibrated fraud probability.</p>
          <EvidenceBars items={items} />{result.execution && <ExecutionSummary execution={result.execution} />}
          {result.customer_warning && (result.customer_warning_translated ? (
            <>
              <p className="warning" lang={result.warning_language} dir={isRightToLeft(result.warning_language) ? "rtl" : "ltr"}>{result.customer_warning_translated}</p>
              <details><summary>Show the English original (the record)</summary><p className="warning">{result.customer_warning}</p></details>
            </>
          ) : (
            <>
              <p className="warning">{result.customer_warning}</p>
              {language !== "en" && result.warning_language === "en" && <p className="muted small">The translation was not available, so this is the English warning.</p>}
            </>
          ))}
          {sentAnswer !== null && <p className="small">Customer answered: {sentAnswer || "Declined to answer"}</p>}
          <details><summary>Full audit record</summary><pre>{JSON.stringify(result.audit, null, 2)}</pre></details>
        </details>
      </> : <><h2 id="result-heading">{stage === "asked" ? "Waiting for the customer's answer" : stage === "busy" ? "Assessment in progress" : error ? "No final recommendation received" : "Your recommendation will appear here"}</h2><p className="muted">{error || "Last Mile Guard will explain whether to allow, warn or recommend a hold, and why."}</p></>}
    </section>

    <details className="simple-technical"><summary>See live backend activity <span>Stage map · findings · event feed</span></summary>
      <LiveExecution events={events} busy={stage === "busy"} error={error} />
    </details>
  </div>;
}
