import { useState } from "react";
import type { Contribution } from "../lib/contrib";
import { EvidenceBars } from "./EvidenceBars";
import { Icon, type IconName } from "./Icon";

const ENGINES: { kind: Contribution["kind"]; name: string; what: string; icon: IconName }[] = [
  { kind: "message", name: "ScamStop · Gemini", what: "What the customer wrote and said", icon: "brain" },
  { kind: "payment", name: "FraudShield", what: "How the payment looks", icon: "activity" },
  { kind: "network", name: "MuleNet", what: "The receiving account", icon: "network" },
];
const SHOWN = 3;

// Why a payment was stopped, grouped by the check that found it: a total and the top reasons for each,
// with every signal (and its bar) one click away.
export function ReasonsByEngine({ items }: { items: Contribution[] }) {
  const [all, setAll] = useState(false);
  const lowered = items.filter((item) => item.kind === "credit" || item.points < 0);
  const groups = ENGINES.map((engine) => ({ ...engine, list: items.filter((item) => item.kind === engine.kind && item.points > 0) }))
    .filter((group) => group.list.length > 0);
  if (!items.length) return <p className="muted small">No risk signals were recorded for this case.</p>;
  return (
    <>
      <div className="engine-reasons">
        {groups.map((group) => {
          const total = group.list.reduce((sum, item) => sum + item.points, 0);
          const top = [...group.list].sort((a, b) => b.points - a.points);
          return (
            <article key={group.kind} className={`engine-reason ${group.kind}`}>
              <header>
                <span className="engine-reason-icon"><Icon name={group.icon} size={16} /></span>
                <span><strong>{group.name}</strong><small>{group.what}</small></span>
                <b>+{total}</b>
              </header>
              <ul>
                {top.slice(0, SHOWN).map((item) => <li key={item.label} title={item.why}><span>{item.label.replace(/^MuleNet: /, "")}</span><em>+{item.points}</em></li>)}
              </ul>
              {top.length > SHOWN && <small className="muted">and {top.length - SHOWN} more</small>}
            </article>
          );
        })}
      </div>
      {lowered.length > 0 && (
        <p className="small engine-lowered"><Icon name="allow" size={14} /> Lowered the risk: {lowered.map((item) => `${item.label} (${item.points})`).join(", ")}</p>
      )}
      <button className="btn link small" onClick={() => setAll(!all)}>{all ? "Hide the detail" : `Show all ${items.length} signals with their weights`}</button>
      {all && <EvidenceBars items={items} />}
    </>
  );
}
