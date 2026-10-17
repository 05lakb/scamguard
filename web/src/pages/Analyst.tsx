import { useEffect, useState, type FormEvent } from "react";
import { assessPayment, type AssessRequest, type NoteKind } from "../api";
import { AgentEvidence } from "../components/AgentEvidence";
import { CallbackBrief } from "../components/CallbackBrief";
import { CallNotes } from "../components/CallNotes";
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
  open: "Open",
  approved: "Approved by analyst",
  held: "Kept on hold",
  escalated: "Escalated",
};

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
  const [selectedId, setSelectedId] = useState<string | null>(focusId?.id ?? initialCaseId ?? null);

  useEffect(() => {
    if (!focusId) return;
    setFilter("all");
    setSelectedId(focusId.id);
  }, [focusId?.nonce]);
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
    setSelectedId(found.id);
    logCall?.(found.id, quoted);
    setLookup(`Opened case ${found.id}. The call is noted in its audit trail. Confirm the caller's identity before discussing it.`);
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
      setSelectedId(id);
      const execution = final.execution;
      setTestStatus(`Case ${id} created from backend response${execution ? ` ${execution.request_id} (${execution.duration_ms} ms; ${execution.message_mode})` : ""}. Review its three evidence panels below.`);
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
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const count = (test: (item: CaseItem) => boolean) => cases.filter(test).length;

  return (
    <div className="analyst">
      <header className="simple-demo-heading"><div><h1>Review the case. Decide the next step.</h1><p className="muted">Inspect the reasons and record a simulated analyst decision. No real payment is changed.</p></div></header>
      <div className="queue-layout">
        <section className="card queue" aria-labelledby="queue-title">
          <div className="card-head">
            <h2 id="queue-title" className="eyebrow">Case queue</h2>
            <span className="muted">Your payments appear first. The built-in example cases are marked "example".</span>
          </div>
          <form className="reference-search" onSubmit={findCall} aria-label="Find a case from a customer's call">
            <input className="f-input" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={20}
              placeholder="Caller's reference, e.g. LMG-7F3A2C" aria-label="Reference quoted by the caller" />
            <button className="ghost" type="submit">Find by reference</button>
          </form>
          {lookup && <p className="muted small" role="status">{lookup}</p>}
          <div className="filters" role="group" aria-label="Filter cases">
            {FILTERS.map((entry) => (
              <button key={entry.id} className={`filter ${filter === entry.id ? "on" : ""}`} aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>
                {entry.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <div className="empty">
              <Icon name="allow" size={32} />
              <p className="lead">Nothing to review</p>
              <p className="muted">Every case in this view has been handled. Try another filter.</p>
            </div>
          ) : (
            <ul className="case-list">
              {visible.map((item) => (
                <li key={item.id}>
                  <button className={`case-row ${selected?.id === item.id ? "on" : ""}`} onClick={() => setSelectedId(item.id)}>
                    <span className={`dot ${item.action}`} aria-hidden="true" />
                    <span className="case-main">
                      <strong>{item.title}</strong>
                      <span className="muted">{item.id} · {item.when} · {sourceLabel(item.source).toLowerCase()}</span>
                    </span>
                    <span className="case-side">
                      <span className="mono">{item.amount.toLocaleString()} {item.currency}</span>
                      <span className={`pill ${item.action}`}>{ACTION_LABEL[item.action]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card case-detail" aria-labelledby="case-title" aria-live="polite">
          {!selected ? (
            <div className="empty"><p className="muted">Select a case to see the evidence.</p></div>
          ) : (
            <>
              <div className="card-head">
                <h2 id="case-title" className="eyebrow">Case {selected.id}{referenceOf(selected) ? ` · Ref ${referenceOf(selected)}` : ""}</h2>
                <span className={`tag ${selected.source}`}>{sourceLabel(selected.source)}</span>
              </div>
              <h3 className="case-title">{selected.title}</h3>
              <div className="verdict-row">
                <Gauge score={selected.score} action={selected.action} />
                <div>
                  <div className={`status ${selected.action}`}>
                    <Icon name={selected.action as IconName} size={18} /> {ACTION_LABEL[selected.action]}
                  </div>
                  <p className="muted verdict-note">
                    {selected.amount.toLocaleString()} {selected.currency} to {selected.payee}, {SEGMENT_LABEL(selected.segment)}
                  </p>
                  <p className="muted verdict-note">Status: {STATUS_TEXT[selected.status]}</p>
                  {(selected.device || selected.location) && <p className="muted verdict-note">{[selected.device, selected.location].filter(Boolean).join(" · ")}</p>}
                </div>
              </div>

              {selected.action !== "allow" && selected.status === "open" && (
                <div className="row">
                  <button className="ghost" onClick={() => decide(selected.id, "approved")}>Approve payment</button>
                  <button className="ghost" onClick={() => decide(selected.id, "held")}>Keep on hold</button>
                  <button className="ghost" onClick={() => decide(selected.id, "escalated")}>Escalate</button>
                </div>
              )}
              {selected.action !== "allow" && <p className="muted small">{selected.savedId
                ? "Human review is simulated. Your decision is saved with this case, with your name and the time. Only this browser can see the case, it is deleted after 24 hours, and nothing is sent to a bank."
                : "Human review is simulated in the browser. This case was not saved on the server, so the decision stays on this page and is never sent to a bank."}</p>}
              {selected.action !== "allow" && <CallbackBrief key={selected.id} item={selected} />}
              {selected.action !== "allow" && addNote && (
                <CallNotes key={`notes-${selected.id}`} item={selected} onAdd={(kind, text) => addNote(selected.id, kind, text)} />
              )}
              <details className="simple-result-details"><summary>Detailed findings from each check</summary><AgentEvidence item={selected} /></details>

              <h3 className="mini">Why, ranked by weight</h3>
              <EvidenceBars items={partsAsBars(selected)} />
              {!selected.audit && selected.reasons.length > 0 && (
                <ul className="reasons">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              )}

              <h3 className="mini">What was said</h3>
              <div className="thread compact">
                <div className="bubble customer"><span className="who">Customer</span>{selected.message ?? <em className="muted">No note written</em>}</div>
                {selected.questions && <div className="bubble guard"><span className="who">Guard</span>{selected.questions.join(" ")}</div>}
                {selected.answer !== undefined && <div className="bubble customer"><span className="who">Customer</span>{selected.answer || <em className="muted">Declined to answer</em>}</div>}
              </div>

              <h3 className="mini">Audit trail</h3>
              <ol className="trail">
                {selected.trail.map((entry, index) => (
                  <li key={`${entry.when}-${index}`}><span className="muted mono">{entry.when}</span> {entry.text}</li>
                ))}
              </ol>

              {selected.audit && (
                <details>
                  <summary>Inspect raw backend evidence and execution trace</summary>
                  <pre>{JSON.stringify({ audit: selected.audit, execution: selected.execution }, null, 2)}</pre>
                </details>
              )}


            </>
          )}
        </section>
      </div>
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
        {testError && <p role="alert" className="problem">{testError} Check that Python backend is running at localhost:8080.</p>}
        <p className="muted small">Network test: “Same payee, paid again and again”. Gemini test: “Fake bank security call”. This tool does not use hardcoded risk outcomes, initiate bank transfers, or bypass backend scoring.</p>
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
