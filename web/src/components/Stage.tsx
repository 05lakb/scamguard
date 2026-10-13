// The stage for the live red-team run: the red agent on one side, the bank's guard on the other.
// It only shows what it is given. The scene comes from a finished test case replayed step by step.

import type { ArenaRecord } from "../api";
import { KIND_LABEL } from "../lib/cases";
import { ACTION_LABEL, SEGMENT_LABEL } from "../lib/labels";
import { CHECKS, PREP_LINES, VERDICT_TEXT, outcomeSentence, sourceLink, verdictOf, viewAt, type Step } from "../lib/stage";
import { GuardAgent, RedAgent, type GuardMood, type RedMood } from "./Agents";
import { Icon, type IconName } from "./Icon";

interface Props {
  record: ArenaRecord | null; // the scene being played, if any
  elapsed: number;
  number: number; // which call this is
  total: number;
  running: boolean; // the live run is still going
  allPlayed: boolean; // every scene of a finished run has been shown
  plan?: string | null; // the visitor's own story, when they wrote one, shown as the red agent's plan
}

const STEPS: { id: Step; label: string }[] = [
  { id: "prepare", label: "Prepare" },
  { id: "attack", label: "Attack" },
  { id: "analyse", label: "Analyse" },
  { id: "decide", label: "Decide" },
];

function redMood(record: ArenaRecord | null, step: Step, running: boolean): RedMood {
  if (!record) return running ? "prepare" : "idle";
  if (step === "prepare") return "prepare";
  if (step !== "decide") return "attack";
  if (record.label !== "scam") return "idle";
  return record.ok === false ? "slipped" : "caught";
}

function guardMood(record: ArenaRecord | null, step: Step): GuardMood {
  if (!record || step === "prepare") return "calm";
  if (step === "attack") return "alert";
  if (step === "analyse") return "scan";
  return record.ok === false ? "alert" : "relief";
}

// Cuts long text for the card, at a word where it can.
export function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

function caption(record: ArenaRecord | null, step: Step, running: boolean, allPlayed: boolean, number: number): string {
  if (!record) {
    if (allPlayed) return "Run complete. The guard has seen every call.";
    return running ? `The red agent is preparing mock call ${number}...` : "Press start to send the red agent in.";
  }
  if (step === "prepare") return "The red agent is preparing a made-up customer and payment.";
  if (step === "attack") return "The red agent makes its call and tries to get the payment through.";
  if (step === "analyse") return "The guard checks the payment, the history and the words.";
  return "The guard has decided.";
}

export function Stage({ record, elapsed, number, total, running, allPlayed, plan }: Props) {
  const view = record ? viewAt(record, elapsed) : null;
  const step: Step = view?.step ?? "prepare";
  const lines = view?.lines ?? 0;
  const action = record?.final_action;
  const questions = record?.questions?.join(" ");

  const caseLines: { name: string; value: string }[] = record
    ? [
        { name: "Customer", value: SEGMENT_LABEL(record.segment) },
        { name: "Payment", value: `${record.amount.toLocaleString()} ${record.currency} to ${record.payee}` },
        { name: "Plan", value: plan ? `"${shorten(plan, 150)}"` : `Play: ${KIND_LABEL[record.category] ?? record.category}` },
        { name: "Goal", value: record.label === "scam" ? "Slip the payment past the guard" : "Make an honest payment that sounds odd" },
      ]
    : [];

  return (
    <section className="card stage" aria-label="Red agent versus the bank guard">
      <div className="stage-top">
        <ol className="stepper" aria-label="Stages of this call">
          {STEPS.map((item, index) => {
            const current = STEPS.findIndex((entry) => entry.id === step);
            const state = record ? (index < current ? "done" : index === current ? "on" : "") : "";
            return (
              <li key={item.id} className={state}>
                {state === "done" ? <Icon name="allow" size={13} /> : <span className="num">{index + 1}</span>} {item.label}
              </li>
            );
          })}
        </ol>
        <span className="call-count mono">Call {Math.min(number, total || number)} of {total || "?"}</span>
      </div>

      <div className="duel">
        <div className="agent-slot">
          <RedAgent mood={redMood(record, step, running)} />
          <strong>Red agent</strong>
          <span className="muted small">Plays the customer. Test only.</span>
        </div>
        <div className={`channel ${step === "attack" ? "sending" : ""}`} aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="agent-slot">
          <GuardAgent mood={guardMood(record, step)} />
          <strong>Bank guard</strong>
          <span className="muted small">Trusted checker. A person confirms every hold.</span>
        </div>
      </div>

      <p className="stage-caption" role="status">{caption(record, step, running, allPlayed, number)}</p>

      <div className="stage-cols">
        <div className="stage-side red-side">
          <div className="stage-card">
            <h3 className="mini">Mock case the red agent prepared</h3>
            {record ? (
              <dl className="case-lines">
                {caseLines.map((line, index) => (
                  <div key={line.name} className={index < lines ? "in" : "wait"}>
                    <dt>{line.name}</dt>
                    <dd>{index < lines ? line.value : ""}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="skeleton" aria-hidden="true">
                {Array.from({ length: PREP_LINES }, (_, index) => <span key={index} className={running ? "shimmer" : ""} />)}
              </div>
            )}
            {record?.reference && lines >= PREP_LINES && (
              <p className="source">
                Modelled on a public page:{" "}
                {sourceLink(record.reference) ? (
                  <a href={sourceLink(record.reference)!} target="_blank" rel="noopener noreferrer">{record.reference.title}</a>
                ) : (
                  record.reference.title
                )}
                <span className="muted"> · {record.reference.name}</span>
              </p>
            )}
          </div>
          {record && view?.noteShown && (
            <div className="bubble customer pop"><span className="who">Red agent</span>{record.note ?? <em className="muted">No note written</em>}</div>
          )}
          {record && view?.answerShown && record.answer != null && (
            <div className="bubble customer pop"><span className="who">Red agent, after the question</span>{record.answer}</div>
          )}
        </div>

        <div className="stage-side guard-side">
          <div className="stage-card guard-card">
            <h3 className="mini">The guard is analysing</h3>
            <ul className="checklist">
              {CHECKS.map((name, index) => {
                const done = Boolean(view) && index < view!.checks;
                const active = Boolean(view) && step === "analyse" && index === view!.checks;
                return (
                  <li key={name} className={done ? "done" : active ? "active" : ""}>
                    {done ? <Icon name="allow" size={15} /> : active ? <span className="spinner small" aria-hidden="true" /> : <span className="hollow" aria-hidden="true" />}
                    {name}
                  </li>
                );
              })}
              {view?.answerShown && (
                <li className={view.verdictShown ? "done" : "active"}>
                  {view.verdictShown ? <Icon name="allow" size={15} /> : <span className="spinner small" aria-hidden="true" />}
                  Re-checking with the answer
                </li>
              )}
            </ul>
          </div>
          {record && view?.questionShown && questions && (
            <div className="bubble guard pop"><span className="who">Bank guard</span>{questions}</div>
          )}
          {record && view?.verdictShown && (
            <div className="verdict-card pop">
              {record.error ? (
                <p className="problem">{record.error}</p>
              ) : (
                <div className="verdict-row">
                  <div className={`status ${action}`}><Icon name={(action ?? "ask") as IconName} size={18} /> {ACTION_LABEL[action ?? "ask"]}</div>
                  <span className={`verdict ${verdictOf(record)}`}>{VERDICT_TEXT[verdictOf(record)]}</span>
                  <span className="muted">risk {record.score}</span>
                </div>
              )}
              <p className="small">{outcomeSentence(record)}</p>
            </div>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {record && view?.verdictShown ? `Call ${number}: ${outcomeSentence(record)} Decision: ${ACTION_LABEL[action ?? "ask"]}.` : ""}
      </p>
    </section>
  );
}
