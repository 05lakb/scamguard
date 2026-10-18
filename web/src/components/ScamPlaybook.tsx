import { useEffect, useState } from "react";
import type { Reading } from "../core/types";
import { flagEvidence, loadPlaybook, tacticsFound, type PaymentFacts, type ScamType } from "../lib/playbook";
import { Icon } from "./Icon";

function usePlaybook() {
  const [types, setTypes] = useState<ScamType[]>([]);
  useEffect(() => {
    let live = true;
    loadPlaybook().then((list) => { if (live) setTypes(list); });
    return () => { live = false; };
  }, []);
  return types;
}

// On a payment: the scam type Gemini matched, with the red flags this payment actually shows.
export function PlaybookMatch({ reading, facts }: { reading: Reading | null; facts: PaymentFacts }) {
  const types = usePlaybook();
  const type = reading ? types.find((item) => item.id === reading.matched_typology) : undefined;
  if (!reading || !type) return null;
  const tactics = tacticsFound(type, reading);
  const shown = type.red_flags.map((flag) => ({ flag, evidence: flagEvidence(flag, facts, reading) }));
  const seen = shown.filter((item) => item.evidence).length;
  return (
    <section className="panel playbook-match" aria-label="Matched scam type from the playbook">
      <div className="playbook-match-head">
        <span className="playbook-icon"><Icon name="flag" size={18} /></span>
        <div>
          <span className="kicker">Scam playbook match</span>
          <h3>{type.name}</h3>
          <p className="muted small">{type.how_it_works}</p>
        </div>
        <span className="act hold">{seen} of {type.red_flags.length} red flags seen</span>
      </div>
      <div className="playbook-match-body">
        <div>
          <p className="sub-kicker">Red flags for this scam</p>
          <ul className="playbook-flags">
            {shown.map(({ flag, evidence }) => (
              <li key={flag} className={evidence ? "seen" : ""}>
                <Icon name={evidence ? "warn" : "check"} size={14} />
                <span>{flag}{evidence && <small>Seen here: {evidence}</small>}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="sub-kicker">Pressure tactics</p>
          <div className="tag-row">
            {type.pressure_tactics.map((tactic) => <span key={tactic} className={`playbook-tactic ${tactics.has(tactic) ? "seen" : ""}`}>{tactic}</span>)}
          </div>
          <p className="sub-kicker">What the customer is told</p>
          <p className="small" style={{ marginTop: 0 }}>{type.safe_advice}</p>
          <a className="playbook-source" href={type.source.url} target="_blank" rel="noreferrer noopener"><Icon name="arrow" size={13} /> {type.source.label}</a>
        </div>
      </div>
      <p className="muted small" style={{ margin: "10px 0 0" }}>Gemini reads the customer's words against this playbook. Only the payment's own data and Gemini's reading mark a red flag as seen; the rules make the decision.</p>
    </section>
  );
}

// The whole playbook: every scam type the message reader is given.
export function PlaybookList() {
  const types = usePlaybook();
  const [open, setOpen] = useState<string | null>(null);
  if (!types.length) return null;
  return (
    <div className="playbook-list">
      {types.map((type) => (
        <article key={type.id} className={open === type.id ? "open" : ""}>
          <button onClick={() => setOpen(open === type.id ? null : type.id)} aria-expanded={open === type.id}>
            <strong>{type.name}</strong>
            <span className="muted small">{type.red_flags.length} red flags · {type.pressure_tactics.join(", ")}</span>
            <Icon name="arrow" size={14} />
          </button>
          {open === type.id && (
            <div className="playbook-detail">
              <p>{type.how_it_works}</p>
              <ul className="playbook-flags">{type.red_flags.map((flag) => <li key={flag}><Icon name="warn" size={14} /><span>{flag}</span></li>)}</ul>
              <p className="small"><strong>Safe advice:</strong> {type.safe_advice}</p>
              <a className="playbook-source" href={type.source.url} target="_blank" rel="noreferrer noopener"><Icon name="arrow" size={13} /> {type.source.label}</a>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
