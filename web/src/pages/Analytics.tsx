import { useState } from "react";
import type { ConversationResult, Health } from "../api";
import { Icon } from "../components/Icon";
import { DistRow, EmptyState, PageHead, PanelHead, StatCard } from "../components/ui";
import { sourceLabel, type CaseItem } from "../lib/cases";
import { insights, levelOf, money } from "../lib/insights";

interface Props {
  cases: CaseItem[];
  voice: ConversationResult[];
  health: Health | null | undefined;
  refresh: () => void;
  open: (id: string) => void;
}

export function Analytics({ cases, voice, health, refresh, open }: Props) {
  const [scope, setScope] = useState<"session" | "all">("session");
  const rows = scope === "session" ? cases.filter((item) => item.source !== "recorded") : cases;
  const stats = insights(rows);
  const voiceHigh = voice.filter((v) => v.risk_level === "high").length;

  return (
    <div>
      <PageHead kicker="Fraud intelligence center" title="Fraud" accent="Analytics" text="Real-time intelligence from transaction behaviour, AI decisions, analyst feedback and detected fraud signals.">
        <div className="chip-row" role="group" aria-label="Data shown">
          <button className={`chip-btn ${scope === "session" ? "on" : ""}`} aria-pressed={scope === "session"} onClick={() => setScope("session")}>This session</button>
          <button className={`chip-btn ${scope === "all" ? "on" : ""}`} aria-pressed={scope === "all"} onClick={() => setScope("all")}>Include recorded</button>
        </div>
        <button className="btn small" onClick={refresh}><Icon name="refresh" size={14} /> Refresh intelligence</button>
      </PageHead>

      <div className="net-banner" style={{ padding: "12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="stat-icon tone-teal"><Icon name="shield" size={18} /></span>
          <div><strong style={{ fontSize: "0.95rem", letterSpacing: 0 }}>PaySentinel AI engine</strong><span className="muted small">Analytics recompute instantly as each assessment completes.</span></div>
        </div>
        <span className={`status-pill ${health?.ok ? "" : "off"}`}><span className="dot" /> {health?.ok ? "Online" : "Offline"}</span>
      </div>

      <section className="stats-grid four" aria-label="Headline metrics">
        <StatCard icon="activity" tone="teal" label="Total transactions" value={stats.total} hint="Payments assessed" />
        <StatCard icon="warn" tone="red" label="High risk" value={stats.levels.high} hint="Score 70 or more" />
        <StatCard icon="ban" tone="amber" label="Held" value={stats.hold} hint="Hold recommended" />
        <StatCard icon="trend" tone="green" label="Average risk" value={`${stats.averageScore.toFixed(1)}/100`} hint="Mean rule score" />
      </section>
      <section className="stats-grid four" aria-label="Secondary metrics">
        <StatCard icon="bell" tone="slate" label="Total alerts" value={stats.hold + stats.warn} />
        <StatCard icon="money" tone="slate" label="Amount at risk" value={stats.atRisk} />
        <StatCard icon="flag" tone="red" label="Confirmed fraud" value={stats.confirmed} hint="Analyst kept on hold or escalated" />
        <StatCard icon="mic" tone="violet" label="Voice scans" value={`${voice.length}`} hint={`${voiceHigh} high-risk calls`} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <PanelHead kicker="Risk distribution" title="Transaction risk" icon="shield" />
          <p className="stat-value" style={{ marginTop: -6 }}>{stats.total} <small className="muted" style={{ fontSize: "0.8rem" }}>analysed transactions</small></p>
          <DistRow label="High risk" value={stats.levels.high} total={stats.total} tone="red" />
          <DistRow label="Medium risk" value={stats.levels.medium} total={stats.total} tone="amber" />
          <DistRow label="Low risk" value={stats.levels.low} total={stats.total} tone="green" />
        </section>
        <section className="panel">
          <PanelHead kicker="AI decisions" title="Transaction actions" icon="activity" />
          <div className="action-tiles">
            <div className="action-tile tone-red"><Icon name="ban" size={20} /><span>Hold</span><strong>{stats.hold}</strong></div>
            <div className="action-tile tone-amber"><Icon name="warn" size={20} /><span>Warn</span><strong>{stats.warn}</strong></div>
            <div className="action-tile tone-green"><Icon name="allow" size={20} /><span>Allow</span><strong>{stats.allow}</strong></div>
          </div>
          <p className="muted small" style={{ margin: "14px 0 0" }}>{stats.total} decisions · recommendations only, no money is moved.</p>
        </section>

        <section className="panel">
          <PanelHead kicker="AI explainability" title="Top risk signals" icon="warn" />
          {stats.topSignals.length ? (
            <ol className="signal-list">
              {stats.topSignals.map((signal, index) => <li key={signal.label}><span className="n">{String(index + 1).padStart(2, "0")}</span><span>{signal.label}</span><strong className="mono">{signal.count}</strong></li>)}
            </ol>
          ) : <EmptyState icon="pulse" title="No signals yet" text="Run assessments to see which signals fire most often." />}
        </section>
        <section className="panel">
          <PanelHead kicker="Analyst feedback" title="Human review" icon="user" />
          <div className="action-tiles">
            <div className="action-tile tone-green"><Icon name="shield" size={20} /><span>Confirmed</span><strong>{stats.confirmed}</strong></div>
            <div className="action-tile tone-red"><Icon name="close" size={20} /><span>False positive</span><strong>{stats.falsePositives}</strong></div>
            <div className="action-tile tone-amber"><Icon name="warn" size={20} /><span>Pending</span><strong>{stats.needsReview}</strong></div>
          </div>
          <div className="subscores" style={{ marginTop: 14 }}>
            <div><span className="muted">Reviewed cases</span><strong className="mono">{stats.reviewed}</strong></div>
            <div><span className="muted">False-positive rate</span><strong className="mono">{stats.falsePositiveRate}%</strong></div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Activity" title="Recent assessments" icon="list" />
        {rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Transaction</th><th>Amount</th><th>Risk</th><th>Decision</th><th>Source</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {rows.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><small>{item.id} · {item.when}</small></td>
                    <td className="mono">{money(item.amount, item.currency)}</td>
                    <td><span className={`lvl ${levelOf(item.score)}`}>{levelOf(item.score).toUpperCase()} · {item.score}</span></td>
                    <td><span className={`act ${item.action}`}>{item.action}</span></td>
                    <td className="muted">{sourceLabel(item.source)}</td>
                    <td><button className="btn small" onClick={() => open(item.id)}>Investigate <Icon name="arrow" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon="activity" title="No assessments in this session" text="Use the Transaction Analyzer or Scenario Lab, or include recorded examples above." />}
      </section>
    </div>
  );
}
