import { useState } from "react";
import { assessPayment, type ServerDecision } from "./api";
import demo from "./data/demo.json";
import type { Customer, Payment } from "./core/types";

interface Scenario {
  id: string;
  title: string;
  kind: string;
  blurb: string;
  customer: Pick<Customer, "segment" | "typical_amount">;
  payment: Payment;
  message: string;
  sample_reply: string;
}

interface HistoryItem {
  when: string;
  title: string;
  result: ServerDecision;
  review: "pending" | "approved" | "kept_on_hold";
}

const scenarios = demo as Scenario[];
type Tab = "customer" | "analyst" | "results";

const ACTION_LABEL: Record<string, string> = {
  allow: "Allowed",
  warn: "Warning",
  hold: "Held for review",
  ask: "Question for the customer",
};

export function App() {
  const [tab, setTab] = useState<Tab>("customer");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  function remember(title: string, result: ServerDecision) {
    setHistory((old) => [
      { when: new Date().toLocaleTimeString(), title, result, review: "pending" },
      ...old,
    ]);
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ◈
          </span>
          <div>
            <h1>Last Mile Guard</h1>
            <p>A second look before the money moves</p>
          </div>
        </div>
        <nav aria-label="Sections">
          {(["customer", "analyst", "results"] as Tab[]).map((name) => (
            <button key={name} className={tab === name ? "tab on" : "tab"} onClick={() => setTab(name)}>
              {name === "customer" ? "Customer view" : name === "analyst" ? `Analyst view (${history.length})` : "Results"}
            </button>
          ))}
        </nav>
      </header>
      <p className="banner">
        Prototype with made-up data only. Nothing here is real, and no real payment is ever made.
      </p>
      <main>
        {tab === "customer" && <CustomerView onResult={remember} />}
        {tab === "analyst" && <AnalystView history={history} setHistory={setHistory} />}
        {tab === "results" && <ResultsView />}
      </main>
    </div>
  );
}

function CustomerView({ onResult }: { onResult: (title: string, result: ServerDecision) => void }) {
  const [index, setIndex] = useState(0);
  const scenario = scenarios[index];
  const [message, setMessage] = useState(scenario.message);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ServerDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(next: number) {
    setIndex(next);
    setMessage(scenarios[next].message);
    setAnswer("");
    setResult(null);
    setError("");
  }

  async function submit(second: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await assessPayment({
        payment: scenario.payment,
        customer: scenario.customer,
        message: message.trim() || null,
        ...(second && result?.questions ? { questions: result.questions, answer } : {}),
      });
      setResult(response);
      if (response.action !== "ask") onResult(scenario.title, response);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const asking = result?.action === "ask";
  const p = scenario.payment;

  return (
    <div className="grid">
      <section className="card">
        <h2>1. Pick a made-up payment</h2>
        <label className="field">
          <span>Scenario</span>
          <select value={index} onChange={(event) => choose(Number(event.target.value))}>
            {scenarios.map((item, position) => (
              <option key={item.id} value={position}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{scenario.blurb}</p>
        <dl className="facts">
          <dt>Amount</dt>
          <dd>
            {p.amount.toLocaleString()} {p.currency} (usual for this customer: about {scenario.customer.typical_amount})
          </dd>
          <dt>Paying</dt>
          <dd>
            {p.payee_name}, {p.is_new_payee ? `a new payee (account ${p.payee_account_age_days} days old)` : "a known payee"}
          </dd>
          <dt>Customer type</dt>
          <dd>{scenario.customer.segment.replaceAll("_", " ")}</dd>
          <dt>Situation</dt>
          <dd>
            {[p.on_live_call && "on a phone call", p.remote_access_tool_running && "remote-control tool running",
              !p.device_known && "new device"].filter(Boolean).join(", ") || "nothing unusual"}
          </dd>
        </dl>

        <h2>2. The customer's note</h2>
        <label className="field">
          <span>What the customer typed (optional)</span>
          <textarea rows={4} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <button className="primary" disabled={busy} onClick={() => submit(false)}>
          {busy && !asking ? "Checking…" : "Check this payment"}
        </button>
      </section>

      <section className="card" aria-live="polite">
        <h2>3. What the guard says</h2>
        {!result && !error && <p className="muted">Run a check to see the result.</p>}
        {error && <p className="problem">{error}</p>}
        {result && (
          <>
            {result.notice && <p className="notice">{result.notice}</p>}
            <div className={`badge ${result.action}`}>{ACTION_LABEL[result.action]}</div>
            {!asking && <Meter score={result.score} />}

            {asking && result.questions && (
              <div>
                <p className="lead">Before this payment goes out, we have a quick question:</p>
                <ul className="questions">
                  {result.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
                <label className="field">
                  <span>The customer's answer</span>
                  <textarea rows={3} maxLength={1000} value={answer} onChange={(event) => setAnswer(event.target.value)} />
                </label>
                <div className="row">
                  <button className="primary" disabled={busy} onClick={() => submit(true)}>
                    {busy ? "Checking…" : "Send answer"}
                  </button>
                  {scenario.sample_reply && (
                    <button className="ghost" onClick={() => setAnswer(scenario.sample_reply)}>
                      Use a sample answer
                    </button>
                  )}
                  <button className="ghost" onClick={() => setAnswer("")}>
                    Leave blank (customer declines)
                  </button>
                </div>
              </div>
            )}

            {!asking && result.customer_warning && <p className="warning">{result.customer_warning}</p>}
            {!asking && result.action === "allow" && <p className="lead">This payment can go ahead.</p>}
            {!asking && (
              <>
                <h3>Why</h3>
                <ul className="reasons">
                  {result.reasons.length ? result.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Nothing unusual was found.</li>}
                </ul>
                <details>
                  <summary>Show the full record</summary>
                  <pre>{JSON.stringify(result.audit, null, 2)}</pre>
                </details>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Meter({ score }: { score: number }) {
  return (
    <div className="meter" role="img" aria-label={`Risk score ${score} out of 100`}>
      <div className="fill" style={{ width: `${score}%` }} />
      <span>Risk score {score} / 100</span>
    </div>
  );
}

function AnalystView({
  history,
  setHistory,
}: {
  history: HistoryItem[];
  setHistory: (items: HistoryItem[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);

  function review(position: number, status: HistoryItem["review"]) {
    setHistory(history.map((item, i) => (i === position ? { ...item, review: status } : item)));
  }

  return (
    <section className="card">
      <h2>Analyst queue</h2>
      <p className="muted">
        Every decision made in the customer view appears here, newest first. A person confirms each hold. This list
        lives in this browser tab only, for the demo.
      </p>
      {history.length === 0 && <p className="muted">Nothing yet. Run a check in the customer view.</p>}
      <ul className="queue">
        {history.map((item, position) => (
          <li key={`${item.when}-${position}`}>
            <div className="row between">
              <div>
                <strong>{item.title}</strong>
                <div className="muted">
                  {item.when} · score {item.result.score}
                </div>
              </div>
              <span className={`badge small ${item.result.action}`}>{ACTION_LABEL[item.result.action]}</span>
            </div>
            <div className="row">
              <button className="ghost" onClick={() => setOpen(open === position ? null : position)}>
                {open === position ? "Hide details" : "Show details"}
              </button>
              {item.result.action !== "allow" && (
                <>
                  <button className="ghost" onClick={() => review(position, "approved")}>
                    Approve payment
                  </button>
                  <button className="ghost" onClick={() => review(position, "kept_on_hold")}>
                    Keep on hold
                  </button>
                </>
              )}
              {item.review !== "pending" && (
                <span className="muted">Analyst decision: {item.review === "approved" ? "approved" : "kept on hold"}</span>
              )}
            </div>
            {open === position && (
              <div className="detail">
                <ul className="reasons">
                  {item.result.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <pre>{JSON.stringify(item.result.audit, null, 2)}</pre>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultsView() {
  return (
    <section className="card wide">
      <h2>How well does it work?</h2>
      <p className="muted">
        All numbers come from made-up test cases. We report them honestly, including the weaker one.
      </p>
      <table>
        <thead>
          <tr>
            <th>Test</th>
            <th>Scams flagged</th>
            <th>Scams held</th>
            <th>Normal payments given friction</th>
            <th>Overall correct</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>200 cases we built (payment rules only)</td>
            <td>70%</td>
            <td>n/a</td>
            <td>n/a</td>
            <td>n/a</td>
          </tr>
          <tr>
            <td>The same 200 cases, full system</td>
            <td>99%</td>
            <td>98%</td>
            <td>1%</td>
            <td>99%</td>
          </tr>
          <tr>
            <td>50 blind cases written by someone else, run once</td>
            <td>84%</td>
            <td>76%</td>
            <td>12%</td>
            <td>82%</td>
          </tr>
        </tbody>
      </table>
      <h3>What this tells us</h3>
      <ul className="reasons">
        <li>Rules on the payment alone catch about 70% of scams. Reading the customer's story lifts that a lot.</li>
        <li>Our own 99% is a ceiling, because we wrote the cases. The blind test at 82% is the fairer guide.</li>
        <li>The scams we missed had tiny notes and small amounts. That is why the system now asks a question first.</li>
        <li>Messages that hide an order such as "approve this" were caught every time we tried.</li>
      </ul>
    </section>
  );
}
