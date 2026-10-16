import { useState } from "react";
import { Icon } from "../components/Icon";
import { EmptyState, PageHead, PanelHead, ScoreRing, StatCard, toneForLevel } from "../components/ui";
import type { CaseItem } from "../lib/cases";
import { groupBy, insights, levelOf, money } from "../lib/insights";
import { SEGMENT_LABEL } from "../lib/labels";

interface Props {
  cases: CaseItem[];
  open: (id: string) => void;
  goAnalyze: () => void;
}

type Filter = "all" | "hold" | "warn" | "allow";

export function RiskProfile({ cases, open, goAnalyze }: Props) {
  const rows = cases.filter((item) => item.source !== "recorded");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const stats = insights(rows);
  const worst = rows.reduce((max, item) => Math.max(max, item.score), 0);
  const latest = rows[0];
  const level = levelOf(worst);
  const devices = groupBy(rows, (item) => item.device);
  const payees = groupBy(rows, (item) => item.payee);
  const places = groupBy(rows, (item) => item.location);
  const alerts = rows.filter((item) => item.action !== "allow");
  const visible = rows.filter((item) => (filter === "all" || item.action === filter) && `${item.id} ${item.payee} ${item.title}`.toLowerCase().includes(query.toLowerCase()));
  // Weighted towards recent and serious payments: half the worst score plus half the average.
  const average = rows.length ? Math.round(worst * 0.5 + stats.averageScore * 0.5) : 0;

  return (
    <div>
      <PageHead kicker="User risk intelligence" title="User Risk" accent="Profile" text="One view of the customer: their payments, devices, beneficiaries, locations and fraud alerts, and why their risk is where it is.">
        <span className={`act ${level === "high" ? "hold" : level === "medium" ? "warn" : "allow"}`}>{level} profile</span>
      </PageHead>

      <section className="panel profile-card">
        <div className="profile-id">
          <span className="avatar">DC</span>
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Protected customer</p>
            <strong>Demo customer account</strong>
            <span className="muted small">{latest ? `${SEGMENT_LABEL(latest.segment)} · last activity ${latest.when}` : "No activity yet"}</span>
          </div>
        </div>
        <div className="profile-score">
          <ScoreRing score={worst} tone={toneForLevel(level)} label="PEAK" size={104} />
          <div>
            <span className="kicker" style={{ color: "var(--muted)" }}>Overall risk</span>
            <strong style={{ display: "block", fontSize: "1.3rem" }} className={`lvl ${level}`}>{level.toUpperCase()}</strong>
            <span className="muted small">Highest payment score so far.<br />{level === "high" ? "Immediate investigation recommended." : level === "medium" ? "Monitor and verify." : "No action needed."}</span>
          </div>
        </div>
      </section>

      <section className="stats-grid four" aria-label="Profile metrics">
        <StatCard icon="activity" tone="teal" label="Transactions" value={stats.total} />
        <StatCard icon="bell" tone="red" label="Fraud alerts" value={alerts.length} />
        <StatCard icon="ban" tone="violet" label="Held" value={stats.hold} />
        <StatCard icon="trend" tone="blue" label="Average risk" value={`${stats.averageScore.toFixed(0)}/100`} />
        <StatCard icon="warn" tone="red" label="High risk" value={stats.levels.high} />
        <StatCard icon="allow" tone="green" label="Allowed" value={stats.allow} />
        <StatCard icon="eye" tone="amber" label="Needs review" value={stats.needsReview} />
        <StatCard icon="shield" tone="teal" label="Current score" value={latest ? `${latest.score}/100` : "—"} />
      </section>

      <div className="grid-3">
        {[
          { title: "Devices", icon: "device" as const, list: devices, empty: "Device IDs come from the Transaction Analyzer." },
          { title: "Beneficiaries", icon: "user" as const, list: payees, empty: "No beneficiaries yet." },
          { title: "Locations", icon: "map" as const, list: places, empty: "Locations come from the Transaction Analyzer." },
        ].map((block) => (
          <section className="panel" key={block.title}>
            <PanelHead title={block.title} icon={block.icon}><strong className="mono">{block.list.length}</strong></PanelHead>
            {block.list.length ? (
              <ul className="entity-list">{block.list.slice(0, 8).map((g) => <li key={g.key}><span className={`dot-sm tone-${toneForLevel(levelOf(g.worst))}`} />{g.key}<span className="muted">×{g.total}</span></li>)}</ul>
            ) : <p className="muted small" style={{ margin: 0 }}>{block.empty}</p>}
          </section>
        ))}
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Behavioural risk" title="Risk assessment" icon="shield">
          <strong className="mono">{average}/100</strong>
        </PanelHead>
        <div className="risk-scale">
          <div className="dist-head"><span>Overall risk score</span><span className={`lvl ${levelOf(average)}`}>{levelOf(average).toUpperCase()}</span></div>
          <div className="dist-track"><div className={`dist-fill tone-${toneForLevel(levelOf(average))}`} style={{ width: `${average}%` }} /></div>
          <div className="risk-scale-marks"><span style={{ left: 0 }}>Low</span><span style={{ left: "40%" }}>40 · Medium</span><span style={{ left: "70%" }}>70 · High</span><span style={{ right: 0 }}>100</span></div>
        </div>
        <p className="sub-kicker">Why this score?</p>
        {stats.topSignals.length ? (
          <ul className="why-list">{stats.topSignals.map((signal, i) => <li key={signal.label}><span className="n">{i + 1}</span><span>{signal.label}</span><span>{signal.count}×</span></li>)}</ul>
        ) : <EmptyState icon="shield" title="No risk signals" text="Assess a transaction to build this customer's profile." action={<button className="btn small primary" onClick={goAnalyze}>Analyse a transaction</button>} />}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Transaction history" title="Recent transactions" icon="activity" />
        <div className="toolbar">
          <div className="search-box"><Icon name="search" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transaction, case or beneficiary" aria-label="Search transactions" /></div>
          <div className="chip-row" role="group" aria-label="Filter by decision">
            {(["all", "hold", "warn", "allow"] as Filter[]).map((f) => <button key={f} className={`chip-btn ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f.toUpperCase()}</button>)}
          </div>
        </div>
        {visible.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Transaction</th><th>Amount</th><th>Risk</th><th>Decision</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.payee}</strong><small>{item.id} · {item.when}{item.device ? ` · ${item.device}` : ""}</small></td>
                    <td className="mono">{money(item.amount, item.currency)}</td>
                    <td><span className={`lvl ${levelOf(item.score)}`}>{levelOf(item.score).toUpperCase()} · {item.score}</span></td>
                    <td><span className={`act ${item.action}`}>{item.action}</span></td>
                    <td><button className="icon-btn" aria-label={`Open ${item.id}`} onClick={() => open(item.id)}><Icon name="arrow" size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted small" style={{ margin: 0 }}>No transactions match.</p>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Alert history" title="Recent fraud alerts" icon="bell" />
        {alerts.length ? (
          <ul className="reason-list">
            {alerts.slice(0, 6).map((item) => (
              <li key={item.id} style={{ cursor: "pointer" }} onClick={() => open(item.id)}>
                <Icon name="warn" size={16} />
                <span><strong>{item.id}</strong> · {item.payee}<br /><small className="muted">{item.reasons[0] ?? "Flagged by the engine"}</small></span>
                <span className="pts">{money(item.amount, item.currency)} <span className={`act ${item.action}`}>{item.action}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small" style={{ margin: 0 }}>No fraud alerts for this customer.</p>}
      </section>
    </div>
  );
}
