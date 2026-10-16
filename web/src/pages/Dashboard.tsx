import { useState } from "react";
import type { Health } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { DistRow, EmptyState, PanelHead, StatCard, type Tone } from "../components/ui";
import type { CaseItem } from "../lib/cases";
import { insights } from "../lib/insights";
import type { Page } from "../lib/pages";

interface Props {
  user: string;
  cases: CaseItem[];
  health: Health | null | undefined;
  refresh: () => void;
  goTo: (page: Page) => void;
}

const SUITE: { page: Page; icon: IconName; tone: Tone; kicker: string; title: string; text: string; cta: string }[] = [
  { page: "analyzer", icon: "shield", tone: "teal", kicker: "Real-time engine", title: "Transaction Security", text: "Score a payment on amount, beneficiary, device, location and timing before it settles.", cta: "Analyse a transaction" },
  { page: "voice", icon: "mic", tone: "violet", kicker: "Social engineering", title: "Voice Phishing AI", text: "Detect OTP requests, impersonation, threats and urgency in a call transcript.", cta: "Open voice scanner" },
  { page: "analytics", icon: "chart", tone: "blue", kicker: "Intelligence", title: "Fraud Analytics", text: "Risk distribution, recommended actions, top signals and analyst feedback.", cta: "View analytics" },
  { page: "network", icon: "network", tone: "red", kicker: "Mule detection", title: "Fraud Network", text: "Follow money through linked accounts and spot fan-in and rapid onward transfers.", cta: "Explore network" },
  { page: "profile", icon: "user", tone: "amber", kicker: "Customer view", title: "User Risk Profile", text: "Devices, beneficiaries, locations and the reasons behind the customer's risk.", cta: "View risk profile" },
  { page: "geography", icon: "map", tone: "green", kicker: "Location intelligence", title: "Geographic Fraud", text: "Where assessed payments come from and which locations carry the most risk.", cta: "Open geography" },
  { page: "analyst", icon: "flag", tone: "teal", kicker: "Operations", title: "Fraud Analyst Center", text: "Review warnings and holds, then approve, keep on hold or escalate with an audit trail.", cta: "Open analyst center" },
  { page: "lab", icon: "flask", tone: "violet", kicker: "Red team", title: "Scenario Lab", text: "Replay realistic scam and genuine scenarios, or let the red team attack the engine live.", cta: "Open scenario lab" },
];

export function Dashboard({ user, cases, health, refresh, goTo }: Props) {
  const [scope, setScope] = useState<"session" | "all">("session");
  const rows = scope === "session" ? cases.filter((item) => item.source !== "recorded") : cases;
  const stats = insights(rows);
  const online = health?.ok === true;

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="kicker live"><span className="dot" /> PaySentinel security operations centre</p>
          <h1>Welcome, <span className="grad">{user}</span><br />Fraud Intelligence <span className="grad">Command Centre</span></h1>
          <p className="page-sub">Real-time transaction monitoring, AI-powered risk analysis and coordinated fraud intelligence.</p>
        </div>
        <div className="page-head-side">
          <span className={`status-pill ${online ? "" : "off"}`}><span className="dot" /> {health === undefined ? "Checking systems" : online ? "All systems operational" : "API offline"}</span>
          <button className="btn small" onClick={refresh}><Icon name="refresh" size={14} /> Sync intelligence</button>
        </div>
      </header>

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="kicker">Live telemetry</p>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Security overview</h2>
        </div>
        <div className="chip-row" role="group" aria-label="Data shown">
          <button className={`chip-btn ${scope === "session" ? "on" : ""}`} aria-pressed={scope === "session"} onClick={() => setScope("session")}>This session</button>
          <button className={`chip-btn ${scope === "all" ? "on" : ""}`} aria-pressed={scope === "all"} onClick={() => setScope("all")}>Include recorded examples</button>
        </div>
      </div>

      <section className="stats-grid" aria-label="Security overview">
        <StatCard icon="activity" tone="teal" label="Total transactions" value={stats.total} hint="Payments assessed" />
        <StatCard icon="warn" tone="red" label="Fraud alerts" value={stats.hold + stats.warn} hint="Warnings and holds" />
        <StatCard icon="trend" tone="amber" label="Needs review" value={stats.needsReview} hint="Open alerts for an analyst" />
        <StatCard icon="ban" tone="violet" label="Held" value={stats.hold} hint="Hold recommended" />
        <StatCard icon="money" tone="green" label="Amount at risk" value={stats.atRisk} hint="In flagged payments" />
        <StatCard icon="pulse" tone="blue" label="Average risk" value={stats.averageScore.toFixed(1)} hint="Across assessed payments" />
      </section>

      <div className="grid-2">
        <section className="panel">
          <PanelHead kicker="Risk distribution" title="Transaction risk" icon="shield" />
          <DistRow label="High" value={stats.levels.high} total={stats.total} tone="red" />
          <DistRow label="Medium" value={stats.levels.medium} total={stats.total} tone="amber" />
          <DistRow label="Low" value={stats.levels.low} total={stats.total} tone="green" />
          <p className="muted small" style={{ margin: 0 }}>High ≥ 70 · Medium 40–69 · Low &lt; 40. Scores are rule indicators, not probabilities.</p>
        </section>
        <section className="panel">
          <PanelHead kicker="Recommended actions" title="Transaction actions" icon="lock" />
          <div className="action-tiles">
            <div className="action-tile tone-red"><Icon name="ban" size={20} /><strong>{stats.hold}</strong><span>Hold</span></div>
            <div className="action-tile tone-amber"><Icon name="warn" size={20} /><strong>{stats.warn}</strong><span>Warn</span></div>
            <div className="action-tile tone-green"><Icon name="allow" size={20} /><strong>{stats.allow}</strong><span>Allow</span></div>
          </div>
          <div className="legend-line"><span>Hold · analyst confirms</span><span>Warn · customer verifies</span><span>Allow · proceeds</span></div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="AI explainability" title="Top risk signals" icon="pulse" />
        {stats.topSignals.length ? (
          <ol className="signal-list">
            {stats.topSignals.map((signal, index) => (
              <li key={signal.label}><span className="n">{String(index + 1).padStart(2, "0")}</span><span>{signal.label}</span><strong className="mono">{signal.count}</strong></li>
            ))}
          </ol>
        ) : (
          <EmptyState icon="pulse" title="No signals yet" text="Analyse a transaction or a call transcript and the strongest risk signals will be ranked here." action={<button className="btn small primary" onClick={() => goTo("analyzer")}>Analyse a transaction</button>} />
        )}
      </section>

      <div className="section-title"><p className="kicker">Security modules</p><h2>Fraud intelligence suite</h2></div>
      <div className="suite-grid">
        {SUITE.map((item) => (
          <article className="suite-card" key={item.page}>
            <span className={`suite-icon tone-${item.tone}`}><Icon name={item.icon} size={20} /></span>
            <div>
              <p className="kicker" style={{ fontSize: "0.62rem" }}>{item.kicker}</p>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <button className="btn small" onClick={() => goTo(item.page)}>{item.cta} <Icon name="arrow" size={14} /></button>
            </div>
          </article>
        ))}
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="System status" title="PaySentinel infrastructure">
          <span className={`status-pill ${online ? "" : "off"}`}><span className="dot" /> {online ? "Operational" : "Degraded"}</span>
        </PanelHead>
        <div className="infra-grid">
          <div className="infra-item"><Icon name="server" size={18} /><div><small>Assessment API</small><strong className={online ? "ok" : health === undefined ? "wait" : "bad"}>{online ? "Online" : health === undefined ? "Checking" : "Offline"}</strong></div></div>
          <div className="infra-item"><Icon name="shield" size={18} /><div><small>Risk engine</small><strong className={online ? "ok" : "wait"}>{online ? "Active · rules" : "Unavailable"}</strong></div></div>
          <div className="infra-item"><Icon name="brain" size={18} /><div><small>Gemini reader</small><strong className={health?.ai_configured ? "ok" : "wait"}>{health?.ai_configured ? "Configured" : "Rule fallback"}</strong></div></div>
          <div className="infra-item"><Icon name="lock" size={18} /><div><small>Case store</small><strong className="ok">Browser session</strong></div></div>
        </div>
      </section>

    </div>
  );
}
