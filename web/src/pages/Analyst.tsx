import { useEffect, useState, type FormEvent } from "react";
import { assessPayment, type AssessRequest, type NoteKind } from "../api";
import { AgentEvidence } from "../components/AgentEvidence";
import { CallbackBrief } from "../components/CallbackBrief";
import { CallNotes } from "../components/CallNotes";
import { JourneySteps } from "../components/JourneySteps";
import type { FinishedCase, Scenario } from "./Console";
import { EvidenceBars } from "../components/EvidenceBars";
import { Gauge } from "../components/Gauge";
import { Icon, type IconName } from "../components/Icon";
import { findByReference, needsReview, referenceOf, sourceLabel, type CaseItem, type CaseStatus } from "../lib/cases";
import { contributions, type Contribution } from "../lib/contrib";
import { ACTION_LABEL, SEGMENT_LABEL } from "../lib/labels";

type Filter = "review" | "hold" | "warn" | "allow" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "review", label: "Needs review" },
  { id: "hold", label: "Held" },
  { id: "warn", label: "Warnings" },
  { id: "allow", label: "Allowed" },
  { id: "all", label: "All" },
];

const STATUS_TEXT: Record<CaseStatus, string> = {
  open: "Waiting for your decision",
  approved: "Approved by analyst",
  held: "Kept on hold",
  escalated: "Escalated",
};

const SUGGESTION = { allow: "release the payment", warn: "release it with a warning", hold: "keep it on hold" } as const;

function partsAsBars(item: CaseItem): Contribution[] {
  if (item.audit) return contributions({ audit: item.audit });
  if (!item.parts) return [];
  return [
    { label: "Payment checks (behaviour and 15-day history)", points: item.parts.payment, why: "Points from how the payment looks.", kind: "payment" as const },
    { label: "What the customer wrote and said", points: item.parts.message, why: "Points from the message reading.", kind: "message" as const },
  ].filter((entry) => entry.points !== 0);
}

export function Analyst({ cases, decide, scenarios, onTestCase, initialCaseId, focusId, logCall, addNote }: {
  initialCaseId?: string | null;
  // Another page asked to open a specific case (changes nonce each time).
  focusId?: { id: string; nonce: number } | null;
  cases: CaseItem[];
  decide: (id: string, status: CaseStatus) => void;
  scenarios: Scenario[];
  onTestCase: (item: FinishedCase) => string;
  // The customer phoned the fraud team and quoted this case's reference.
  logCall?: (id: string, reference: string) => void;
  // Adds to the case's call log: notes from the call, or a Voice AI check of them.
  addNote?: (id: string, kind: NoteKind, text: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>(initialCaseId || focusId ? "all" : "review");
  // The case being reviewed. None: the queue fills the page. One: the queue narrows to the left.
  const [openId, setOpenId] = useState<string | null>(focusId?.id ?? initialCaseId ?? null);

  useEffect(() => {
    if (!focusId) return;
    setFilter("all");
    setOpenId(focusId.id);
  }, [focusId?.nonce]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [openId]);
  const [scenarioId, setScenarioId] = useState("d2");
  const [running, setRunning] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [testError, setTestError] = useState("");
  const [reference, setReference] = useState("");
  const [lookup, setLookup] = useState("");

  function findCall(event: FormEvent) {
    event.preventDefault();
    const found = findByReference(cases, reference);
    if (!found) {
      setLookup("No case with that reference in this browser's queue. Check the reference with the caller.");
      return;
    }
    const quoted = referenceOf(found) ?? found.id;
    setFilter("all");
    setOpenId(found.id);
    logCall?.(found.id, quoted);
    setLookup(`Opened case ${found.id}. Confirm the caller's identity before discussing it.`);
    setReference("");
  }

  async function runBackendScenario() {
    if (running) return;
    const scenario = scenarios.find((entry) => entry.id === scenarioId);
    if (!scenario) return;
    setRunning(true);
    setTestError("");
    setTestStatus("POST /api/assess · Round 1 · awaiting backend response...");
    const request: AssessRequest = {
      customer: scenario.customer,
      payment: scenario.payment,
      message: scenario.message || null,
      ...(scenario.network ? { network: scenario.network } : {}),
    };
    try {
      const initial = await assessPayment(request);
      let final = initial;
      let answered: string | undefined;
      let questions: string[] | undefined;
      if (initial.action === "ask") {
        questions = initial.questions;
        answered = scenario.sample_reply || "";
        setTestStatus("POST /api/assess · Round 2 · using the scenario's synthetic sample reply...");
        final = await assessPayment({ ...request, questions, answer: answered });
      }
      if (final.action === "ask") throw new Error("Assessment requires another answer; open Live Console to answer manually.");
      const id = onTestCase({ scenario, message: scenario.message || null, questions, answer: answered, decision: final });
      setFilter("all");
      setOpenId(id);
      const execution = final.execution;
      setTestStatus(`Case ${id} created from backend response${execution ? ` ${execution.request_id} (${execution.duration_ms} ms; ${execution.message_mode})` : ""}.`);
    } catch (error) {
      setTestStatus("");
      setTestError(error instanceof Error ? error.message : "Backend assessment failed.");
    } finally {
      setRunning(false);
    }
  }

  const visible = cases.filter((item) => {
    if (filter === "all") return true;
    if (filter === "review") return needsReview(item);
    return item.action === filter;
  });
  const selected = cases.find((item) => item.id === openId) ?? null;
  const count = (test: (item: CaseItem) => boolean) => cases.filter(test).length;
  const filterCount = (id: Filter) => (id === "all" ? cases.length : id === "review" ? count(needsReview) : count((item) => item.action === id));

  const filters = (
    <div className="filters" role="group" aria-label="Filter cases">
      {FILTERS.map((entry) => (
        <button key={entry.id} className={`filter ${filter === entry.id ? "on" : ""}`} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
          {entry.label} <span className="filter-count">{filterCount(entry.id)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="analyst">
      <JourneySteps current={4} />
      <header className="simple-demo-heading">
        <div>
          <h1>{selected ? "Review the case. Make the decision." : "Cases waiting for an analyst"}</h1>
          <p className="muted">The AI checks, calls and recommends. You decide. No real payment is changed.</p>
        </div>
      </header>

      {!selected ? (
        <section className="card queue-full" aria-labelledby="queue-title">
          <div className="queue-toolbar">
            <h2 id="queue-title" className="eyebrow">Case queue</h2>
            <form className="reference-search" onSubmit={findCall} aria-label="Find a case from a customer's call">
              <input className="f-input" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={20}
                placeholder="Caller's reference, e.g. LMG-7F3A2C" aria-label="Reference quoted by the caller" />
              <button className="ghost" type="submit">Find by reference</button>
            </form>
          </div>
          {lookup && <p className="muted small" role="status">{lookup}</p>}
          {filters}
          {visible.length === 0 ? (
            <div className="empty">
              <Icon name="allow" size={32} />
              <p className="lead">Nothing to review</p>
              <p className="muted">Every case in this view has been handled. Try another filter.</p>
            </div>
          ) : (
            <div className="case-table-wrap">
              <table className="case-table">
                <thead>
                  <tr><th>Case</th><th>Payee</th><th className="num">Amount</th><th>Engine</th><th>Customer call</th><th>Status</th><th>When</th></tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id} tabIndex={0} onClick={() => setOpenId(item.id)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenId(item.id); } }}>
                      <td><strong>{item.title}</strong><span className="muted small">{item.id} · {sourceLabel(item.source).toLowerCase()}</span></td>
                      <td>{item.payee}</td>
                      <td className="num mono">{item.amount.toLocaleString()} {item.currency}</td>
                      <td><span className={`pill ${item.action}`}>{ACTION_LABEL[item.action]}</span></td>
                      <td>{item.verification?.outcome ? <span className={`pill ${item.verification.outcome.action}`}>AI: {SUGGESTION[item.verification.outcome.action]}</span> : <span className="muted small">{item.action === "allow" ? "Not needed" : "Not yet"}</span>}</td>
                      <td>{STATUS_TEXT[item.status]}</td>
                      <td className="muted small">{item.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div className="review-layout">
          <aside className="card queue-side" aria-label="Other cases">
            <button className="btn small" onClick={() => setOpenId(null)}><Icon name="back" size={14} /> All cases</button>
            {filters}
            <ul className="case-list">
              {visible.map((item) => (
                <li key={item.id}>
                  <button className={`case-row ${selected.id === item.id ? "on" : ""}`} onClick={() => setOpenId(item.id)}>
                    <span className={`dot ${item.action}`} aria-hidden="true" />
                    <span className="case-main">
                      <strong>{item.title}</strong>
                      <span className="muted">{item.amount.toLocaleString()} {item.currency} · {ACTION_LABEL[item.action]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="card case-review" aria-labelledby="case-title" aria-live="polite">
            <div className="card-head">
              <h2 id="case-title" className="eyebrow">Case {selected.id}{referenceOf(selected) ? ` · Ref ${referenceOf(selected)}` : ""}</h2>
              <span className={`tag ${selected.source}`}>{sourceLabel(selected.source)}</span>
            </div>
            <div className="review-summary">
              <Gauge score={selected.score} action={selected.action} />
              <div>
                <h3 className="case-title">{selected.title}</h3>
                <div className={`status ${selected.action}`}><Icon name={selected.action as IconName} size={18} /> {ACTION_LABEL[selected.action]}</div>
                <p className="muted verdict-note">{selected.amount.toLocaleString()} {selected.currency} to {selected.payee}, {SEGMENT_LABEL(selected.segment)}
                  {(selected.device || selected.location) ? ` · ${[selected.device, selected.location].filter(Boolean).join(" · ")}` : ""}</p>
              </div>
            </div>

            {selected.action !== "allow" && (
              <div className={`decision-bar ${selected.status}`}>
                <div>
                  <span className="kicker">AI suggestion</span>
                  <strong>
                    {selected.verification?.outcome
                      ? `After the call, the AI agent suggests you ${SUGGESTION[selected.verification.outcome.action]}. You decide.`
                      : `The engine recommends: ${ACTION_LABEL[selected.action].toLowerCase()}. You decide.`}
                  </strong>
                  <span className="muted small">Status: {STATUS_TEXT[selected.status]}</span>
                </div>
                {selected.status === "open" ? (
                  <div className="row">
                    <button className="btn small primary" onClick={() => decide(selected.id, "approved")}><Icon name="allow" size={14} /> Approve payment</button>
                    <button className="btn small" onClick={() => decide(selected.id, "held")}><Icon name="hold" size={14} /> Keep on hold</button>
                    <button className="btn small" onClick={() => decide(selected.id, "escalated")}><Icon name="flag" size={14} /> Escalate</button>
                  </div>
                ) : <span className={`pill ${selected.status === "approved" ? "allow" : "hold"}`}>{STATUS_TEXT[selected.status]}</span>}
              </div>
            )}

            <div className="review-section">
              <h3 className="review-heading"><span className="review-no">1</span> Why the payment was stopped</h3>
              <EvidenceBars items={partsAsBars(selected)} />
              {!selected.audit && selected.reasons.length > 0 && (
                <ul className="reasons">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              )}
              <div className="thread compact">
                <div className="bubble customer"><span className="who">Customer's note</span>{selected.message ?? <em className="muted">No note written</em>}</div>
                {selected.questions && <div className="bubble guard"><span className="who">Guard asked</span>{selected.questions.join(" ")}</div>}
                {selected.answer !== undefined && <div className="bubble customer"><span className="who">Customer</span>{selected.answer || <em className="muted">Declined to answer</em>}</div>}
              </div>
            </div>

            {selected.action !== "allow" && (
              <div className="review-section">
                <h3 className="review-heading"><span className="review-no">2</span> Customer's call with the AI agent</h3>
                {selected.verification ? (
                  <>
                    <ol className="call-log">
                      {selected.verification.questions.map((question, index) => (
                        <li key={question}>
                          <span className="muted small">AI agent: {question}</span>
                          <span>Customer: {selected.verification?.answers[index] || "(no answer)"}</span>
                        </li>
                      ))}
                    </ol>
                    {selected.verification.outcome && (
                      <p className="small">
                        {selected.verification.outcome.reading
                          ? <>Gemini: scam likelihood {selected.verification.outcome.reading.scam_likelihood ?? "?"}/100{selected.verification.outcome.reading.coached ? ", sounds coached" : ""}{selected.verification.outcome.reading.secrecy === "concealment" ? ", told to keep it secret" : ""}. </>
                          : <>Gemini could not read the answers. </>}
                        {selected.verification.outcome.voice && <>Voice AI: {selected.verification.outcome.voice.risk_level} risk{selected.verification.outcome.voice.tactics.length && selected.verification.outcome.voice.tactics[0] !== "none" ? ` (${selected.verification.outcome.voice.tactics.join(", ")})` : ""}. </>}
                        Risk {selected.verification.outcome.before_score} → {selected.verification.outcome.score}.
                        {selected.verification.outcome.kept_hold && <> Held regardless: {selected.verification.outcome.kept_hold}</>}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted small">The customer has not called yet. When they do, the conversation and the AI's analysis appear here.</p>
                )}
              </div>
            )}

            {selected.action !== "allow" && (
              <div className="review-section">
                <h3 className="review-heading"><span className="review-no">3</span> Your call with the customer (optional)</h3>
                <CallbackBrief key={selected.id} item={selected} />
                {addNote && <CallNotes key={`notes-${selected.id}`} item={selected} onAdd={(kind, text) => addNote(selected.id, kind, text)} />}
              </div>
            )}

            <div className="review-section">
              <h3 className="review-heading"><span className="review-no">{selected.action !== "allow" ? 4 : 2}</span> Audit trail</h3>
              <ol className="trail">
                {selected.trail.map((entry, index) => (
                  <li key={`${entry.when}-${index}`}><span className="muted mono">{entry.when}</span> {entry.text}</li>
                ))}
              </ol>
              <p className="muted small">{selected.savedId
                ? "Your decision is saved with this case, with your name and the time. Only this browser can see the case, it is deleted after 24 hours, and nothing is sent to a bank."
                : "This case was not saved on the server, so the decision stays on this page. Nothing is sent to a bank."}</p>
            </div>

            <details className="simple-result-details">
              <summary>Technical details: each engine's findings and the raw record</summary>
              <AgentEvidence item={selected} />
              {selected.audit && <pre>{JSON.stringify({ audit: selected.audit, execution: selected.execution }, null, 2)}</pre>}
            </details>
          </section>
        </div>
      )}

      <details className="simple-technical"><summary>Advanced: run another test & view queue totals</summary>
      <section className="card scenario-tester" aria-label="Run one real backend test">
        <div>
          <h2 className="case-title">Run a single backend scenario</h2>
          <p className="muted small">Choose synthetic input, then run the real FastAPI assessment. FraudShield/MuleNet rules run on the backend; ScamStop uses Gemini, cached Gemini output, or an explicitly labelled fallback.</p>
        </div>
        <div className="scenario-controls">
          <label htmlFor="scenario-select">Test scenario</label>
          <select id="scenario-select" value={scenarioId} disabled={running} onChange={(event) => setScenarioId(event.target.value)}>
            {scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}{item.network ? " · MuleNet graph" : ""}</option>)}
          </select>
          <button className="primary" onClick={() => void runBackendScenario()} disabled={running}>
            {running ? "Running backend..." : "Run test scenario"}
          </button>
        </div>
        {testStatus && <p role="status" className="scenario-status">{testStatus}</p>}
        {testError && <p role="alert" className="problem">{testError}</p>}
      </section>

      <div className="tiles">
        <div className="tile"><span className="muted">Needs review</span><strong className="mono">{count(needsReview)}</strong></div>
        <div className="tile hold"><span className="muted">Hold recommended</span><strong className="mono">{count((c) => c.action === "hold")}</strong></div>
        <div className="tile warn"><span className="muted">Warnings</span><strong className="mono">{count((c) => c.action === "warn")}</strong></div>
        <div className="tile allow"><span className="muted">Allowed</span><strong className="mono">{count((c) => c.action === "allow")}</strong></div>
      </div>

      </details>
    </div>
  );
}
