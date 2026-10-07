import { useState } from "react";
import { EvidenceBars } from "../components/EvidenceBars";
import { Gauge } from "../components/Gauge";
import { Icon, type IconName } from "../components/Icon";
import { needsReview, sourceLabel, type CaseItem, type CaseStatus } from "../lib/cases";
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

export function Analyst({ cases, decide }: { cases: CaseItem[]; decide: (id: string, status: CaseStatus) => void }) {
  const [filter, setFilter] = useState<Filter>("review");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = cases.filter((item) => {
    if (filter === "all") return true;
    if (filter === "review") return needsReview(item);
    return item.action === filter;
  });
  const selected = cases.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const count = (test: (item: CaseItem) => boolean) => cases.filter(test).length;

  return (
    <div className="analyst">
      <div className="tiles">
        <div className="tile"><span className="muted">Needs review</span><strong className="mono">{count(needsReview)}</strong></div>
        <div className="tile hold"><span className="muted">Held</span><strong className="mono">{count((c) => c.action === "hold")}</strong></div>
        <div className="tile warn"><span className="muted">Warnings</span><strong className="mono">{count((c) => c.action === "warn")}</strong></div>
        <div className="tile allow"><span className="muted">Allowed</span><strong className="mono">{count((c) => c.action === "allow")}</strong></div>
      </div>

      <div className="queue-layout">
        <section className="card queue" aria-labelledby="queue-title">
          <div className="card-head">
            <h2 id="queue-title" className="eyebrow">Case queue</h2>
            <span className="muted">Recorded cases come from our own test runs. Live and test-run cases appear as you use the console.</span>
          </div>
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
                      <span className="mono">{item.amount.toLocaleString()}</span>
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
                <h2 id="case-title" className="eyebrow">Case {selected.id}</h2>
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
                </div>
              </div>

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

              {selected.action !== "allow" && (
                <div className="row">
                  <button className="ghost" onClick={() => decide(selected.id, "approved")}>Approve payment</button>
                  <button className="ghost" onClick={() => decide(selected.id, "held")}>Keep on hold</button>
                  <button className="ghost" onClick={() => decide(selected.id, "escalated")}>Escalate</button>
                </div>
              )}
              {selected.action !== "allow" && <p className="muted small">A person confirms every hold. The guard only recommends.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
