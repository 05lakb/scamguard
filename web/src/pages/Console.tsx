import { useEffect, useRef, useState } from "react";
import { assessPayment, type AssessRequest, type ServerDecision } from "../api";
import { EvidenceBars } from "../components/EvidenceBars";
import { Gauge } from "../components/Gauge";
import { Icon, type IconName } from "../components/Icon";
import type { AccountNetwork, Customer, Payment } from "../core/types";
import { contributions } from "../lib/contrib";
import { ACTION_LABEL, ACTION_NOTE, SEGMENT_LABEL } from "../lib/labels";

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

function requestFor(sc: Scenario, note: string, questions?: string[], answer?: string): AssessRequest {
  return {
    payment: sc.payment,
    ...(sc.network ? { network: sc.network } : {}),
    customer: sc.customer,
    message: note.trim() || null,
    ...(answer !== undefined ? { questions, answer } : {}),
  };
}

export function Console({ scenarios, onCase, autoplay, onFinished }: Props) {
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const scenario = scenarios.find((item) => item.id === selectedId) ?? scenarios[0];
  const [note, setNote] = useState(scenario.message);
  const [answer, setAnswer] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [first, setFirst] = useState<ServerDecision | null>(null);
  const [result, setResult] = useState<ServerDecision | null>(null);
  const [sentAnswer, setSentAnswer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const runId = useRef(0);
  const auto = useRef(false);

  function reset() {
    runId.current += 1;
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
      const r1 = await assessPayment(requestFor(sc, text));
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
    try {
      const r2 = await assessPayment(requestFor(sc, text, asked.questions, reply));
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
    setSelectedId(next.id);
    setNote(next.message);
    setAnswer("");
    auto.current = true;
    void run(next, next.message, autoplay.autoAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay?.nonce]);

  const p = scenario.payment;
  const usual15 = scenario.customer.typical_spend_15d ?? scenario.customer.typical_amount * 8;
  const spent15 = p.spend_last_15d ?? 0;
  const with15 = spent15 + p.amount;
  const scale15 = Math.max(usual15, with15, 1);
  const shown = result ?? first;
  const status = result ? result.action : stage === "asked" ? "ask" : null;
  const items = shown ? contributions(shown) : [];
  const asking = stage === "asked" || (stage === "busy" && first !== null);

  return (
    <div className="console">
      <aside className="picker" aria-label="Choose a case">
        {(["scam", "genuine"] as const).map((group) => (
          <div key={group}>
            <h2 className="eyebrow">{group === "scam" ? "Scams" : "Genuine customers"}</h2>
            <ul>
              {scenarios
                .filter((item) => item.group === group)
                .map((item) => (
                  <li key={item.id}>
                    <button
                      className={`scenario ${item.id === selectedId ? "on" : ""}`}
                      aria-pressed={item.id === selectedId}
                      onClick={() => choose(item.id)}
                    >
                      <span className="scenario-title">{item.title}</span>
                      <span className="scenario-meta">
                        <span className={`tag ${item.group}`}>{item.kind}</span>
                        <span className="muted">{item.difficulty}</span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </aside>

      <div className="workspace">
        <section className="card" aria-labelledby="casefile">
          <div className="card-head">
            <h2 id="casefile" className="eyebrow">Case file</h2>
            <span className="muted mono">{scenario.id.toUpperCase()}</span>
          </div>
          <h3 className="case-title">{scenario.title}</h3>
          <p className="muted">{scenario.blurb}</p>

          <div className="amount-row">
            <div className="amount mono">
              {p.amount.toLocaleString()} <small>{p.currency}</small>
            </div>
            <div className="payee">
              <span className="muted">Paying</span>
              <strong>{p.payee_name}</strong>
              <span className="muted">{SEGMENT_LABEL(scenario.customer.segment)}, usually pays about {scenario.customer.typical_amount}</span>
            </div>
          </div>

          <ul className="chips" aria-label="What the guard can see">
            {chipsFor(p).map((chip) => (
              <li key={chip.text} className={chip.level}>{chip.text}</li>
            ))}
          </ul>

          <div className="spend" aria-label="Spending over the last 15 days">
            <div className="spend-head">
              <span className="muted">Last 15 days</span>
              {p.payee_count_15d ? (
                <span className="muted">{p.payee_count_15d} earlier payments to this payee ({(p.payee_total_15d ?? 0).toLocaleString()})</span>
              ) : (
                <span className="muted">{p.payments_last_15d ?? 0} payments</span>
              )}
            </div>
            <div className="spend-row">
              <span>Usual</span>
              <div className="spend-track"><div className="spend-fill usual" style={{ width: `${(usual15 / scale15) * 100}%` }} /></div>
              <span className="mono">{usual15.toLocaleString()}</span>
            </div>
            <div className="spend-row">
              <span>With this</span>
              <div className="spend-track"><div className={`spend-fill now ${with15 > usual15 * 2 ? "high" : ""}`} style={{ width: `${(with15 / scale15) * 100}%` }} /></div>
              <span className="mono">{with15.toLocaleString()}</span>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="convo">
          <div className="card-head">
            <h2 id="convo" className="eyebrow">Conversation</h2>
          </div>
          <div className="thread">
            <div className="bubble customer">
              <span className="who">Customer</span>
              {note.trim() ? note : <em className="muted">No note written</em>}
            </div>
            {first?.questions && (
              <div className="bubble guard">
                <span className="who">Guard</span>
                {first.questions.join(" ")}
              </div>
            )}
            {sentAnswer !== null && (
              <div className="bubble customer">
                <span className="who">Customer</span>
                {sentAnswer.trim() ? sentAnswer : <em className="muted">Declined to answer</em>}
              </div>
            )}
          </div>

          {stage !== "asked" && (
            <>
              <label className="field" htmlFor="note">What the customer types (you can edit it)</label>
              <textarea id="note" rows={3} maxLength={2000} value={note} onChange={(event) => { setNote(event.target.value); if (stage !== "idle") reset(); }} />
              <button className="primary" disabled={stage === "busy"} onClick={startManual}>
                {stage === "busy" && !asking ? "Checking" : stage === "done" ? "Run again" : "Check this payment"}
              </button>
            </>
          )}

          {stage === "asked" && (
            <>
              <label className="field" htmlFor="answer">The customer's answer</label>
              <textarea id="answer" rows={3} maxLength={1000} value={answer} onChange={(event) => setAnswer(event.target.value)} />
              <div className="row">
                <button className="primary" onClick={() => sendAnswer(answer)}>Send answer</button>
                {scenario.sample_reply && <button className="ghost" onClick={() => setAnswer(scenario.sample_reply)}>Use a sample answer</button>}
                <button className="ghost" onClick={() => sendAnswer("")}>Customer declines</button>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card decision" aria-live="polite" aria-labelledby="verdict">
        <div className="card-head">
          <h2 id="verdict" className="eyebrow">Decision</h2>
          {shown && <span className="muted">Round {stage === "asked" ? 1 : result?.round ?? 1}</span>}
        </div>

        {!shown && stage !== "busy" && !error && (
          <div className="empty">
            <Icon name="shield" size={40} />
            <p className="lead">Ready when you are</p>
            <p className="muted">Pick a case on the left and press Check this payment. The decision, and the reasons ranked by weight, appear here.</p>
          </div>
        )}
        {stage === "busy" && !shown && (
          <div className="empty" role="status">
            <div className="spinner" aria-hidden="true" />
            <p className="lead">Checking</p>
            <p className="muted">Reading the payment and the customer's words.</p>
          </div>
        )}
        {error && <p className="problem">{error}</p>}

        {shown && status && (
          <>
            {result?.notice && <p className="notice">{result.notice}</p>}
            <div className="verdict-row">
              {status !== "ask" ? <Gauge score={result?.score ?? 0} action={status} /> : <div className="gauge-ask"><Icon name="ask" size={44} /></div>}
              <div>
                <div className={`status ${status}`}>
                  <Icon name={status as IconName} size={18} />
                  {ACTION_LABEL[status]}
                </div>
                <p className="muted verdict-note">{ACTION_NOTE[status]}</p>
              </div>
            </div>

            {status === "ask" && <p className="muted">Preliminary view, before the customer answers:</p>}
            <h3 className="mini">Why, ranked by weight</h3>
            <EvidenceBars items={items} />

            {result?.customer_warning && <p className="warning">{result.customer_warning}</p>}

            {result && (
              <details>
                <summary>Show the full record</summary>
                <pre>{JSON.stringify(result.audit, null, 2)}</pre>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
