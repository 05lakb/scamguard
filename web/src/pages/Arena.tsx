import { useEffect, useRef, useState } from "react";
import { streamArena, type ArenaRecord, type ArenaSummary } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { KIND_LABEL } from "../lib/cases";
import { ACTION_LABEL } from "../lib/labels";

interface Props {
  onCase: (record: ArenaRecord, number: number) => void;
}

const verdictOf = (record: ArenaRecord) =>
  record.error ? "error" : record.ok === true ? "good" : record.ok === false ? "miss" : "unsure";

const VERDICT_TEXT = { good: "As expected", miss: "Missed", error: "Error", unsure: "Not reliable" } as const;

export function Arena({ onCase }: Props) {
  const [count, setCount] = useState(8);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [working, setWorking] = useState<{ number: number; category: string } | null>(null);
  const [records, setRecords] = useState<ArenaRecord[]>([]);
  const [summary, setSummary] = useState<ArenaSummary | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function start() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setError("");
    setRecords([]);
    setSummary(null);
    setSelected(null);
    setWorking(null);
    try {
      await streamArena(
        count,
        (event) => {
          if (event.type === "start") setTotal(event.total);
          if (event.type === "working") setWorking({ number: event.number, category: event.category });
          if (event.type === "scenario") {
            setRecords((old) => [...old, event.record]);
            setWorking(null);
            onCase(event.record, event.number);
          }
          if (event.type === "done") setSummary(event.summary);
        },
        abort.signal,
      );
    } catch (problem) {
      if ((problem as Error).name !== "AbortError") {
        setError(problem instanceof Error ? problem.message : "The live run stopped unexpectedly.");
      }
    } finally {
      setRunning(false);
      setWorking(null);
    }
  }

  function stop() {
    controller.current?.abort();
  }

  const decided = records.filter((item) => item.final_action);
  const scams = decided.filter((item) => item.label === "scam");
  const genuine = decided.filter((item) => item.label === "legit");
  const flagged = scams.filter((item) => item.final_action !== "allow").length;
  const friction = genuine.filter((item) => item.final_action !== "allow").length;
  const judged = records.filter((item) => item.ok !== null && item.ok !== undefined);
  const asExpected = judged.filter((item) => item.ok).length;
  const open = records.find((item) => item.id === selected) ?? null;

  return (
    <div className="arena">
      <section className="card">
        <div className="card-head">
          <h2 className="eyebrow">The red team versus the guard, live</h2>
          <span className="muted small">All data is made up</span>
        </div>
        <p>
          A simulated customer, played by Gemini, acts out made-up scenarios: obvious scams, quiet ones, customers
          coached to stay calm, and genuine people whose story merely sounds suspicious. <strong>The guard never sees
          the answer key.</strong> Each result appears here the moment the guard decides.
        </p>
        <div className="row">
          <label className="inline-field">
            <span>Scenarios</span>
            <select value={count} disabled={running} onChange={(event) => setCount(Number(event.target.value))}>
              {[4, 6, 8, 9].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          {!running ? (
            <button className="primary" onClick={start}>
              <Icon name="play" size={14} /> {records.length ? "Run again" : "Start a live run"}
            </button>
          ) : (
            <button className="ghost" onClick={stop}><Icon name="close" size={14} /> Stop</button>
          )}
          <span className="muted small">A run takes two to three minutes. Visitors can start a few per hour.</span>
        </div>
        {error && <p className="problem">{error}</p>}
      </section>

      {(running || records.length > 0) && (
        <div className="tiles" aria-live="polite">
          <div className="tile"><span className="muted">Played</span><strong className="mono">{records.length} / {total || count}</strong></div>
          <div className="tile hold"><span className="muted">Scams flagged</span><strong className="mono">{flagged} / {scams.length}</strong></div>
          <div className="tile allow"><span className="muted">Genuine given friction</span><strong className="mono">{friction} / {genuine.length}</strong></div>
          <div className="tile"><span className="muted">As expected</span><strong className="mono">{asExpected} / {judged.length}</strong></div>
        </div>
      )}

      {(running || records.length > 0) && (
        <div className="queue-layout">
          <section className="card" aria-labelledby="feed-title">
            <h2 id="feed-title" className="eyebrow">Live feed</h2>
            <ul className="case-list">
              {records.map((item, index) => (
                <li key={item.id}>
                  <button className={`case-row ${selected === item.id ? "on" : ""}`} onClick={() => setSelected(item.id)}>
                    <span className={`dot ${item.final_action ?? ""}`} aria-hidden="true" />
                    <span className="case-main">
                      <strong>{index + 1}. {KIND_LABEL[item.category] ?? item.category}</strong>
                      <span className="muted">{item.label === "scam" ? "Scam" : "Genuine"} · {item.amount.toLocaleString()} {item.currency} to {item.payee}</span>
                    </span>
                    <span className="case-side">
                      {item.final_action && <span className={`pill ${item.final_action}`}>{ACTION_LABEL[item.final_action]}</span>}
                      <span className={`verdict ${verdictOf(item)}`}>{VERDICT_TEXT[verdictOf(item)]}</span>
                    </span>
                  </button>
                </li>
              ))}
              {working && (
                <li className="case-row playing" role="status">
                  <div className="spinner small" aria-hidden="true" />
                  <span className="case-main">
                    <strong>{working.number}. Playing: {KIND_LABEL[working.category] ?? working.category}</strong>
                    <span className="muted">The customer is writing a note, and the guard is reading it.</span>
                  </span>
                </li>
              )}
            </ul>
          </section>

          <section className="card case-detail" aria-labelledby="exchange-title" aria-live="polite">
            <h2 id="exchange-title" className="eyebrow">What was said</h2>
            {!open ? (
              <div className="empty"><p className="muted">Select a row to see the whole conversation, the guard's reasons and what the answer should have been.</p></div>
            ) : open.error ? (
              <p className="problem">{open.error}</p>
            ) : (
              <>
                <div className="thread compact">
                  <div className="bubble customer"><span className="who">Customer</span>{open.note ?? <em className="muted">No note written</em>}</div>
                  {open.questions && <div className="bubble guard"><span className="who">Guard</span>{open.questions.join(" ")}</div>}
                  {open.answer != null && <div className="bubble customer"><span className="who">Customer</span>{open.answer}</div>}
                </div>
                <div className="verdict-row">
                  <div className={`status ${open.final_action}`}>
                    <Icon name={(open.final_action ?? "ask") as IconName} size={18} /> {ACTION_LABEL[open.final_action ?? "ask"]}
                  </div>
                  <span className="muted">risk {open.score}</span>
                </div>
                <p className="muted small">
                  The truth, revealed after the guard decided: this was a <strong>{open.label === "scam" ? "scam" : "genuine customer"}</strong>
                  ({KIND_LABEL[open.category] ?? open.category}). Good outcomes: {open.expected_actions.join(" or ")}.
                </p>
                <h3 className="mini">Why the guard decided this</h3>
                <ul className="reasons">
                  {open.reasons?.length ? open.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Nothing unusual was found.</li>}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      {summary && (
        <section className="card">
          <h2 className="eyebrow">This run in summary</h2>
          <p>
            The guard flagged <strong>{summary.scams_flagged[0]} of {summary.scams_flagged[1]}</strong> scams and put
            friction on <strong>{summary.genuine_with_friction[0]} of {summary.genuine_with_friction[1]}</strong> genuine customers.
            Overall, {summary.overall_correct[0]} of {summary.overall_correct[1]} cases ended as expected.
          </p>
          <ul className="reasons">
            {Object.entries(summary.by_category).map(([kind, [done, of]]) => (
              <li key={kind}>{KIND_LABEL[kind] ?? kind}: {done} of {of}</li>
            ))}
          </ul>
          <p className="honest">
            A "missed" row is the honest picture, not a fault in the demo. The hardest case is a victim coached to stay calm on
            an ordinary-looking payment. The Evidence page shows how often that happens across many runs and what we do about it.
          </p>
        </section>
      )}
    </div>
  );
}
