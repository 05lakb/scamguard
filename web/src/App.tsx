import { useEffect, useState } from "react";
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
type Theme = "system" | "light" | "dark";

const ACTION_LABEL: Record<string, string> = {
  allow: "Allowed",
  warn: "Warning",
  hold: "Held for review",
  ask: "A quick question",
};

const ACTION_SUMMARY: Record<string, string> = {
  allow: "This payment can go ahead.",
  warn: "Pause and double-check before paying.",
  hold: "A specialist will review this before it is sent.",
  ask: "We need a little more information first.",
};

// ---------- small building blocks ----------

function Icon({ name }: { name: "allow" | "warn" | "hold" | "ask" | "shield" | "sun" | "moon" | "auto" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "allow":
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "hold":
      return (
        <svg {...common}>
          <path d="m15 9-6 6" />
          <path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z" />
          <path d="m9 9 6 6" />
        </svg>
      );
    case "ask":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "sun":
      return (
        <svg {...common} width={18} height={18}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common} width={18} height={18}>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      );
    case "auto":
      return (
        <svg {...common} width={18} height={18}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      );
    default:
      return (
        <svg {...common} width={44} height={44} strokeWidth={1.5}>
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 512 512" role="img" aria-label="Last Mile Guard">
      <defs>
        <linearGradient id="lmgShield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14396B" />
          <stop offset="1" stopColor="#0A1F3D" />
        </linearGradient>
      </defs>
      <path d="M256 40 L440 110 V250 C440 360 360 440 256 480 C152 440 72 360 72 250 V110 Z" fill="url(#lmgShield)" />
      <circle cx="150" cy="392" r="8" fill="#2DD4BF" opacity="0.5" />
      <circle cx="182" cy="352" r="10" fill="#2DD4BF" opacity="0.65" />
      <circle cx="218" cy="318" r="12" fill="#2DD4BF" opacity="0.85" />
      <circle cx="258" cy="286" r="14" fill="#2DD4BF" />
      <circle cx="306" cy="212" r="62" fill="#0A1F3D" stroke="#2DD4BF" strokeWidth="16" />
      <path d="M280 214 L300 236 L335 190" fill="none" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Meter({ score }: { score: number }) {
  return (
    <div className="meter-wrap">
      <div className="meter" role="img" aria-label={`Risk score ${score} out of 100`}>
        <div className="fill" style={{ width: `${Math.max(score, 2)}%` }} />
      </div>
      <div className="meter-labels">
        <span>Risk score</span>
        <strong>{score} / 100</strong>
      </div>
    </div>
  );
}

function signalChips(p: Payment): string[] {
  const hour = parseInt(p.timestamp.slice(11, 13), 10);
  const chips = [p.is_new_payee ? `New payee (account ${p.payee_account_age_days} days old)` : "Known payee"];
  if (p.on_live_call) chips.push("On a phone call");
  if (p.remote_access_tool_running) chips.push("Remote-control tool running");
  if (!p.device_known) chips.push("New device");
  if (p.payments_last_24h >= 2) chips.push(`${p.payments_last_24h} payments in 24 hours`);
  if (p.payee_type === "crypto_exchange") chips.push("Crypto exchange");
  if (hour >= 1 && hour <= 5) chips.push("Night-time payment");
  return chips;
}

// ---------- the page ----------

export function App() {
  const [tab, setTab] = useState<Tab>("customer");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  function nextTheme() {
    setTheme((old) => (old === "system" ? "light" : old === "light" ? "dark" : "system"));
  }

  function remember(title: string, result: ServerDecision) {
    setHistory((old) => [{ when: new Date().toLocaleTimeString(), title, result, review: "pending" }, ...old]);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "customer", label: "Customer view" },
    { id: "analyst", label: `Analyst view${history.length ? ` (${history.length})` : ""}` },
    { id: "results", label: "Results" },
  ];

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <h1>Last Mile Guard</h1>
            <p>A second look before the money moves</p>
          </div>
        </div>
        <div className="top-right">
          <nav aria-label="Sections">
            {tabs.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "tab on" : "tab"}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button className="icon-button" onClick={nextTheme} aria-label={`Colour theme: ${theme}. Click to change.`} title={`Theme: ${theme}`}>
            <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "auto"} />
          </button>
        </div>
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
      <section className="card" aria-labelledby="step-payment">
        <h2 id="step-payment">
          <span className="step">1</span> Choose a made-up payment
        </h2>
        <label className="field" htmlFor="scenario">
          <span>Scenario</span>
        </label>
        <select id="scenario" value={index} onChange={(event) => choose(Number(event.target.value))}>
          {scenarios.map((item, position) => (
            <option key={item.id} value={position}>
              {item.title}
            </option>
          ))}
        </select>
        <p className="muted blurb">{scenario.blurb}</p>

        <div className="ticket">
          <div className="ticket-amount">
            <span className="label">Amount</span>
            <strong>
              {p.amount.toLocaleString()} <small>{p.currency}</small>
            </strong>
            <span className="muted">This customer usually pays about {scenario.customer.typical_amount}</span>
          </div>
          <dl className="ticket-facts">
            <div>
              <dt>Paying</dt>
              <dd>{p.payee_name}</dd>
            </div>
            <div>
              <dt>Customer type</dt>
              <dd>{scenario.customer.segment.replaceAll("_", " ")}</dd>
            </div>
          </dl>
          <ul className="chips" aria-label="What we can see about this payment">
            {signalChips(p).map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        </div>

        <h2 id="step-note">
          <span className="step">2</span> What the customer typed
        </h2>
        <label className="field" htmlFor="note">
          <span>Their note to the bank (optional)</span>
        </label>
        <textarea id="note" rows={4} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} />
        <button className="primary block" disabled={busy} onClick={() => submit(false)}>
          {busy && !asking ? "Checking…" : "Check this payment"}
        </button>
      </section>

      <section className="card result" aria-live="polite" aria-labelledby="step-result">
        <h2 id="step-result">
          <span className="step">3</span> What the guard says
        </h2>

        {!result && !error && !busy && (
          <div className="empty">
            <Icon name="shield" />
            <p className="lead">Ready when you are</p>
            <p className="muted">
              Pick a payment, look at the customer's note, and press <strong>Check this payment</strong>. The guard's
              decision and its reasons will appear here.
            </p>
          </div>
        )}
        {busy && !result && (
          <div className="empty" role="status">
            <p className="lead">Checking…</p>
            <p className="muted">Reading the note and the payment details. This can take a few seconds.</p>
          </div>
        )}
        {error && <p className="problem">{error}</p>}

        {result && (
          <>
            {result.notice && <p className="notice">{result.notice}</p>}
            <div className={`status ${result.action}`}>
              <Icon name={result.action as "allow" | "warn" | "hold" | "ask"} />
              <div>
                <strong>{ACTION_LABEL[result.action]}</strong>
                <span>{ACTION_SUMMARY[result.action]}</span>
              </div>
            </div>

            {!asking && <Meter score={result.score} />}

            {asking && result.questions && (
              <div className="ask">
                <p className="lead">Before this payment goes out, we have a quick question:</p>
                <ul className="questions">
                  {result.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
                <label className="field" htmlFor="answer">
                  <span>The customer's answer</span>
                </label>
                <textarea id="answer" rows={3} maxLength={1000} value={answer} onChange={(event) => setAnswer(event.target.value)} />
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
                    Customer declines to answer
                  </button>
                </div>
              </div>
            )}

            {!asking && result.customer_warning && <p className="warning">{result.customer_warning}</p>}

            {!asking && (
              <>
                <h3>Why</h3>
                <ul className="reasons">
                  {result.reasons.length ? (
                    result.reasons.map((reason) => <li key={reason}>{reason}</li>)
                  ) : (
                    <li>Nothing unusual was found.</li>
                  )}
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
    <section className="card single">
      <h2>Analyst queue</h2>
      <p className="muted">
        Every decision made in the customer view appears here, newest first. A person confirms each hold. This list
        lives in this browser tab only, for the demo.
      </p>
      {history.length === 0 && (
        <div className="empty">
          <p className="lead">Nothing in the queue yet</p>
          <p className="muted">Run a check in the customer view and it will show up here.</p>
        </div>
      )}
      <ul className="queue">
        {history.map((item, position) => (
          <li key={`${item.when}-${position}`}>
            <div className="row between">
              <div>
                <strong>{item.title}</strong>
                <div className="muted">
                  {item.when} · risk score {item.result.score}
                </div>
              </div>
              <span className={`pill ${item.result.action}`}>{ACTION_LABEL[item.result.action]}</span>
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
    <section className="card single">
      <h2>How well does it work?</h2>
      <p className="muted">All numbers come from made-up test cases. We report them honestly, including the weaker one.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Scams flagged</th>
              <th scope="col">Scams held</th>
              <th scope="col">Normal payments given friction</th>
              <th scope="col">Overall correct</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">200 cases we built, payment rules only</th>
              <td>70%</td>
              <td>n/a</td>
              <td>n/a</td>
              <td>n/a</td>
            </tr>
            <tr>
              <th scope="row">The same 200 cases, full system</th>
              <td>99%</td>
              <td>98%</td>
              <td>1%</td>
              <td>99%</td>
            </tr>
            <tr>
              <th scope="row">50 blind cases written by someone else, run once</th>
              <td>84%</td>
              <td>76%</td>
              <td>12%</td>
              <td>82%</td>
            </tr>
          </tbody>
        </table>
      </div>
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
