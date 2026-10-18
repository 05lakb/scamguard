import { useState } from "react";
import type { ConversationResult, Health } from "../api";
import { HOST_LABEL, hostKind } from "../lib/hosting";
import { Icon, type IconName } from "../components/Icon";
import { DistRow, EmptyState, PanelHead, StatCard, type Tone } from "../components/ui";
import { sourceLabel, type CaseItem } from "../lib/cases";
import { groupBy, insights, levelOf, money } from "../lib/insights";
import type { Page } from "../lib/pages";

interface Props {
  user: string;
  cases: CaseItem[];
  voice: ConversationResult[];
  health: Health | null | undefined;
  open: (id: string) => void;
  refresh: () => void;
  goTo: (page: Page) => void;
}

const SUITE: { page: Page; icon: IconName; tone: Tone; kicker: string; title: string; text: string; cta: string }[] = [
  { page: "analyzer", icon: "shield", tone: "teal", kicker: "Real-time engine", title: "Transaction Security", text: "Score a payment and see the whole investigation on one page: behaviour, location, the receiving-account network and the analyst decision.", cta: "Analyse a transaction" },
  { page: "voice", icon: "mic", tone: "violet", kicker: "Social engineering", title: "Voice Phishing AI", text: "Detect OTP requests, impersonation, threats and urgency in a call transcript.", cta: "Open voice scanner" },
  { page: "analyst", icon: "flag", tone: "amber", kicker: "Operations", title: "Cases", text: "Every warning and hold in one queue. Approve, keep on hold or escalate, with an audit trail.", cta: "Open cases" },
  { page: "profile", icon: "user", tone: "teal", kicker: "User intelligence", title: "User Risk Profile", text: "One customer's payments, devices, beneficiaries and locations, with an overall risk score and the reasons behind it.", cta: "View risk profile" },
];

// Where a judge sees the proof: the live red team, the measured results, and how it is built.
const PROVE: { page: Page; icon: IconName; title: string; text: string; cta: string }[] = [
  { page: "lab", icon: "flask", title: "Red Team", text: "Gemini invents new scam and genuine customers and plays them against the guard live: caught, missed or false alarm.", cta: "Watch the red team" },
  { page: "evidence", icon: "list", title: "Evidence", text: "What was measured on 50 test payments, including the weak results, with the raw data to download.", cta: "See the evidence" },
  { page: "architecture", icon: "cloud", title: "How it's built", text: "Cloud Run, Gemini on Vertex AI, Firestore and the guardrails: what decides, and what only reads.", cta: "See how it's built" },
];

const ENGINES: { id: string; icon: IconName; tone: Tone; name: string; role: string; checks: string[] }[] = [
  { id: "fraudshield", icon: "activity", tone: "teal", name: "FraudShield", role: "Payment behaviour", checks: ["Amount vs the customer's usual", "New beneficiary, device or location", "Night-time, live call, remote-access app"] },
  { id: "scamstop", icon: "brain", tone: "violet", name: "ScamStop", role: "Customer's words and calls", checks: ["Reads the payment note and answers", "Voice AI: OTP requests, impersonation", "Urgency, secrecy and coaching"] },
  { id: "mulenet", icon: "network", tone: "amber", name: "MuleNet", role: "Receiving account", checks: ["Links to flagged mule accounts", "Many senders paying one account", "Money moved straight on"] },
  { id: "decision", icon: "shield", tone: "blue", name: "Decision layer", role: "Combines and explains", checks: ["Warn from 40, hold from 70", "Asks the customer when unsure", "Ranked reasons and audit trail"] },
];

export function Dashboard({ user, cases, voice, health, refresh, goTo, open }: Props) {
  // Until the visitor picks, show their own payments, or the recorded examples when they have none yet,
  // so a first visit opens on a working overview instead of a page of zeros.
  const [picked, setScope] = useState<"session" | "all" | null>(null);
  const own = cases.filter((item) => item.source !== "recorded");
  const scope = picked ?? (own.length ? "session" : "all");
  const rows = scope === "session" ? own : cases;
  const stats = insights(rows);
  const online = health?.ok === true;
  const voiceHigh = voice.filter((v) => v.risk_level === "high").length;
  const places = groupBy(rows, (item) => item.location);
  const changed = rows.filter((item) => item.audit?.behaviour_signals.some((signal) => signal.name === "location_change")).length;

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="kicker live"><span className="dot" /> Last Mile Guard · the bank's view</p>
          <h1>Welcome, <span className="grad">{user}</span><br />Scams stopped <span className="grad">before the money moves</span></h1>
          <p className="page-sub">Every payment is checked by plain rules, its note is read by Gemini, and anything that looks like a scam waits for a person.</p>
        </div>
        <div className="page-head-side">
          <span className={`status-pill ${online ? "" : "off"}`}><span className="dot" /> {health === undefined ? "Checking the checks" : online ? "Checks online" : "API offline"}</span>
          <button className="btn small" onClick={refresh}><Icon name="refresh" size={14} /> Refresh</button>
        </div>
      </header>

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="kicker">{scope === "session" ? "Your payments" : "Your payments and recorded examples"}</p>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>What the guard did</h2>
        </div>
        <div className="chip-row" role="group" aria-label="Data shown">
          <button className={`chip-btn ${scope === "session" ? "on" : ""}`} aria-pressed={scope === "session"} onClick={() => setScope("session")}>This session</button>
          <button className={`chip-btn ${scope === "all" ? "on" : ""}`} aria-pressed={scope === "all"} onClick={() => setScope("all")}>Include recorded examples</button>
        </div>
      </div>

      <section className="prove-strip" aria-label="Prove it">
        <div><p className="kicker">Prove it</p><strong>Use the product, then see the proof.</strong></div>
        {PROVE.map((item) => (
          <button key={item.page} className="prove-card" onClick={() => goTo(item.page)}>
            <span className="prove-icon"><Icon name={item.icon} size={18} /></span>
            <span><strong>{item.title}</strong><small>{item.text}</small><em>{item.cta} →</em></span>
          </button>
        ))}
      </section>

      <section className="stats-grid four" aria-label="Security overview">
        <StatCard icon="activity" tone="teal" label="Total transactions" value={stats.total} hint="Payments assessed" />
        <StatCard icon="warn" tone="red" label="Fraud alerts" value={stats.hold + stats.warn} hint="Warnings and holds" />
        <StatCard icon="trend" tone="amber" label="Needs review" value={stats.needsReview} hint="Open alerts for an analyst" />
        <StatCard icon="ban" tone="violet" label="Held" value={stats.hold} hint="Hold recommended" />
        <StatCard icon="money" tone="green" label="Amount at risk" value={stats.atRisk} hint="In flagged payments" />
        <StatCard icon="pulse" tone="blue" label="Average risk" value={stats.averageScore.toFixed(1)} hint="Across assessed payments" />
        <StatCard icon="flag" tone="red" label="Confirmed fraud" value={stats.confirmed} hint="Analyst kept on hold or escalated" />
        <StatCard icon="mic" tone="violet" label="Voice scans" value={`${voice.length}`} hint={`${voiceHigh} high-risk calls`} />
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

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
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
        <section className="panel">
          <PanelHead kicker="Analyst feedback" title="Human review" icon="user" />
          <div className="action-tiles">
            <div className="action-tile tone-green"><Icon name="shield" size={20} /><strong>{stats.confirmed}</strong><span>Confirmed</span></div>
            <div className="action-tile tone-red"><Icon name="close" size={20} /><strong>{stats.falsePositives}</strong><span>False positive</span></div>
            <div className="action-tile tone-amber"><Icon name="warn" size={20} /><strong>{stats.needsReview}</strong><span>Pending</span></div>
          </div>
          <div className="subscores" style={{ marginTop: 14 }}>
            <div><span className="muted">Reviewed cases</span><strong className="mono">{stats.reviewed}</strong></div>
            <div><span className="muted">False-positive rate</span><strong className="mono">{stats.falsePositiveRate}%</strong></div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Location intelligence" title="Risk by location" icon="map">
          <span className="muted small">{places.length} location{places.length === 1 ? "" : "s"} · {changed} unusual-location flag{changed === 1 ? "" : "s"}</span>
        </PanelHead>
        {places.length ? (
          <div className="geo-map">
            {places.map((place) => (
              <article className={`geo-tile ${levelOf(place.worst)}`} key={place.key}>
                <strong><Icon name="map" size={14} /> {place.key}</strong>
                <span className="muted small">{place.total} payment{place.total === 1 ? "" : "s"} · worst {place.worst}/100</span>
                <div className="meter" aria-label={`${place.high} high, ${place.medium} medium, ${place.low} low`}>
                  <i style={{ width: `${(place.high / place.total) * 100}%` }} />
                  <i style={{ width: `${(place.medium / place.total) * 100}%` }} />
                  <i style={{ width: `${(place.low / place.total) * 100}%` }} />
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState icon="map" title="No locations yet" text="Locations come from the Transactions page. Analyse a payment with a location to see risk by place." />}
      </section>

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
        ) : <EmptyState icon="activity" title="No assessments in this session" text="Check a payment on Transactions, run the Red Team, or include recorded examples above." />}
      </section>

      <div className="section-title"><p className="kicker">Use it</p><h2>Fraud intelligence suite</h2></div>
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
        <PanelHead kicker="Under the hood" title="Detection engines and infrastructure">
          <span className={`status-pill ${online ? "" : "off"}`}><span className="dot" /> {online ? "Operational" : "Degraded"}</span>
        </PanelHead>
        <div className="engine-grid">
          {ENGINES.map((engine) => {
            const state = engine.id === "scamstop"
              ? (!online ? "bad" : health?.ai_configured ? "ok" : "wait")
              : online ? "ok" : "bad";
            const label = engine.id === "scamstop"
              ? (!online ? "Offline" : health?.ai_configured ? "Gemini on Vertex AI" : "Phrase-rule fallback")
              : online ? "Active" : "Offline";
            return (
              <article className="engine-card" key={engine.id}>
                <div className="engine-card-head">
                  <span className={`suite-icon tone-${engine.tone}`}><Icon name={engine.icon} size={18} /></span>
                  <span className={`status ${state}`}>● {label}</span>
                </div>
                <h3>{engine.name}</h3>
                <p className="role">{engine.role}</p>
                <ul>{engine.checks.map((check) => <li key={check}>{check}</li>)}</ul>
              </article>
            );
          })}
        </div>
        <p className="engine-flow">
          <strong>Payment</strong> <Icon name="arrow" size={13} /> FraudShield + ScamStop + MuleNet <Icon name="arrow" size={13} /> <strong>Decision layer</strong> <Icon name="arrow" size={13} /> allow · warn · hold <Icon name="arrow" size={13} /> <strong>Analyst confirms</strong>
        </p>
        <div className="infra-grid" style={{ marginTop: 14 }}>
          <div className="infra-item"><Icon name="server" size={18} /><div><small>Assessment API · FastAPI</small><strong className={online ? "ok" : health === undefined ? "wait" : "bad"}>{online ? "Online" : health === undefined ? "Checking" : "Offline"}</strong></div></div>
          <div className="infra-item"><Icon name="brain" size={18} /><div><small>Gemini · Vertex AI</small><strong className={health?.ai_configured ? "ok" : "wait"}>{health?.ai_configured ? "Configured" : "Not configured"}</strong></div></div>
            <div className="infra-item"><Icon name="cloud" size={18} /><div><small>Hosting</small><strong className={hostKind(location.hostname) === "local" ? "wait" : "ok"}>{HOST_LABEL[hostKind(location.hostname)]}</strong></div></div>
            <div className="infra-item"><Icon name="lock" size={18} /><div><small>Case store</small><strong className={health?.storage === "firestore" ? "ok" : health?.storage === "memory" ? "wait" : health?.storage === "off" ? "bad" : "wait"}>{health?.storage === "firestore" ? "Firestore · live" : health?.storage === "memory" ? "In-memory" : health?.storage === "off" ? "Persistence off" : "Checking"}</strong></div></div>
        </div>
      </section>

    </div>
  );
}
