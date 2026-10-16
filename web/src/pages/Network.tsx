import { useMemo, useState } from "react";
import { assessPayment, type ServerDecision } from "../api";
import { Icon } from "../components/Icon";
import { EmptyState, PageHead, PanelHead, StatCard } from "../components/ui";
import type { AccountNetwork } from "../core/types";
import { levelOf, money } from "../lib/insights";
import type { CaseContext } from "./Analyzer";
import type { FinishedCase, Scenario } from "./Console";

interface Props {
  scenarios: Scenario[];
  onCase: (finished: FinishedCase, context: CaseContext) => void;
}

const today = () => `${new Date().toISOString().slice(0, 10)}T13:10:00`;

// Two built-in synthetic graphs in rupees, alongside any library scenario that carries a network.
function builtIns(): Scenario[] {
  const base = {
    group: "scam" as const, kind: "Network", difficulty: "Medium", message: "", sample_reply: "",
    customer: { segment: "young_professional", typical_amount: 3000 },
  };
  return [
    {
      ...base, id: "net-ring", title: "UPI mule ring (synthetic)",
      blurb: "Five unrelated accounts pay one new account within hours; it forwards almost everything to a flagged collector.",
      payment: { amount: 18000, currency: "INR", timestamp: today(), payee_name: "Rohan Traders", payee_type: "individual", is_new_payee: true, payee_account_age_days: 9, channel: "mobile", device_known: true, payments_last_24h: 0, on_live_call: false, remote_access_tool_running: false },
      network: {
        payee_account_id: "rohan-traders", flagged_account_ids: ["collector-77"],
        transfers: [
          { from_account_id: "victim-anita", to_account_id: "rohan-traders", amount: 12000, hours_ago: 6 },
          { from_account_id: "victim-farhan", to_account_id: "rohan-traders", amount: 9500, hours_ago: 5 },
          { from_account_id: "victim-gopal", to_account_id: "rohan-traders", amount: 15000, hours_ago: 4 },
          { from_account_id: "victim-meera", to_account_id: "rohan-traders", amount: 7000, hours_ago: 3 },
          { from_account_id: "victim-sunil", to_account_id: "rohan-traders", amount: 11000, hours_ago: 3 },
          { from_account_id: "rohan-traders", to_account_id: "relay-12", amount: 50000, hours_ago: 2 },
          { from_account_id: "relay-12", to_account_id: "collector-77", amount: 49000, hours_ago: 1 },
        ],
      },
    },
    {
      ...base, id: "net-clean", group: "genuine", title: "Neighbourhood grocer (synthetic)",
      blurb: "A long-standing merchant receiving ordinary payments and paying its wholesaler. No flagged links.",
      payment: { amount: 1200, currency: "INR", timestamp: today(), payee_name: "Sharma General Store", payee_type: "business", is_new_payee: false, payee_account_age_days: 2400, channel: "mobile", device_known: true, payments_last_24h: 0, on_live_call: false, remote_access_tool_running: false },
      network: {
        payee_account_id: "sharma-store", flagged_account_ids: [],
        transfers: [
          { from_account_id: "cust-01", to_account_id: "sharma-store", amount: 450, hours_ago: 20 },
          { from_account_id: "cust-02", to_account_id: "sharma-store", amount: 1200, hours_ago: 9 },
          { from_account_id: "sharma-store", to_account_id: "wholesale-co", amount: 600, hours_ago: 2 },
        ],
      },
    },
  ];
}

interface NodePos { id: string; x: number; y: number }

function layout(graph: AccountNetwork): NodePos[] {
  const payee = graph.payee_account_id;
  const ids = [...new Set(graph.transfers.flatMap((t) => [t.from_account_id, t.to_account_id]).concat(payee))];
  const inbound = ids.filter((id) => id !== payee && graph.transfers.some((t) => t.from_account_id === id && t.to_account_id === payee));
  const outbound = ids.filter((id) => id !== payee && !inbound.includes(id) && graph.transfers.some((t) => t.from_account_id === payee && t.to_account_id === id));
  const rest = ids.filter((id) => id !== payee && !inbound.includes(id) && !outbound.includes(id));
  const column = (list: string[], x: number) => list.map((id, i) => ({ id, x, y: ((i + 1) * 440) / (list.length + 1) }));
  return [{ id: payee, x: 340, y: 220 }, ...column(inbound, 90), ...column(outbound, 560), ...column(rest, 760)];
}

export function Network({ scenarios, onCase }: Props) {
  const samples = useMemo(() => [...builtIns(), ...scenarios.filter((s) => s.network)], [scenarios]);
  const [id, setId] = useState(samples[0].id);
  const sample = samples.find((s) => s.id === id) ?? samples[0];
  const [flags, setFlags] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ServerDecision | null>(null);

  const original = sample.network as AccountNetwork;
  const graph: AccountNetwork = { ...original, flagged_account_ids: flags[sample.id] ?? original.flagged_account_ids };
  const nodes = layout(graph);
  const pos = (account: string) => nodes.find((n) => n.id === account)!;
  const flagged = new Set(graph.flagged_account_ids);
  const total = graph.transfers.reduce((sum, t) => sum + t.amount, 0);
  const inbound = graph.transfers.filter((t) => t.to_account_id === graph.payee_account_id).length;
  const outbound = graph.transfers.filter((t) => t.from_account_id === graph.payee_account_id).length;
  const match = query.trim().toLowerCase();
  const width = nodes.some((n) => n.x > 700) ? 840 : 660;

  function choose(next: string) {
    setId(next);
    setResult(null);
    setError("");
    setQuery("");
  }

  function toggleFlag(account: string) {
    const current = new Set(graph.flagged_account_ids);
    if (current.has(account)) current.delete(account);
    else current.add(account);
    setFlags((old) => ({ ...old, [sample.id]: [...current] }));
    setResult(null);
  }

  async function assess() {
    setBusy(true);
    setError("");
    try {
      const request = { payment: sample.payment, customer: sample.customer, network: graph, message: null };
      const decision = await assessPayment(request);
      setResult(decision);
      // With no customer note the engine may want to ask first; record its provisional view for the analyst.
      const recorded = decision.action === "ask" ? { ...decision, action: decision.provisional_action ?? "warn", notice: "Provisional: the engine would ask the customer a question before deciding." } : decision;
      onCase({ scenario: { ...sample, network: graph }, message: null, decision: recorded }, { device: "", location: "", channel: sample.payment.channel });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const netScore = result?.audit.network_score ?? null;
  const netLevel = netScore === null ? null : levelOf(netScore);

  return (
    <div>
      <PageHead kicker="Fraud intelligence network" title="Fraud" accent="Network" text="Investigate connections between accounts and transfers. Click any account to flag or unflag it, then run the mule-network engine.">
        <select className="f-select" style={{ width: "auto" }} aria-label="Network sample" value={sample.id} onChange={(e) => choose(e.target.value)}>
          {samples.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </PageHead>

      <button className="btn primary block" style={{ marginBottom: 16 }} disabled={busy} onClick={assess}>
        {busy ? <span className="spin" /> : <Icon name="refresh" size={16} />} {busy ? "Assessing network" : "Assess network risk"}
      </button>
      {error && <p className="problem-box" role="alert">{error}</p>}

      <div className={`net-banner ${netLevel ?? ""}`}>
        <div>
          <span className="kicker" style={{ color: "var(--muted)" }}>Network risk</span>
          <strong>{netLevel ? netLevel.toUpperCase() : "NOT ASSESSED"}</strong>
          <span className="muted small">{result ? `Mule-network score ${netScore}/100 · overall payment decision: ${result.action === "ask" ? `${result.provisional_action ?? "warn"} (provisional, would ask the customer)` : result.action} · score ${result.score}` : "Run the engine to calculate risk from the supplied transfers."}</span>
        </div>
        <Icon name="network" size={34} />
      </div>

      <section className="stats-grid five" aria-label="Network metrics">
        <StatCard icon="activity" tone="teal" label="Transfers" value={graph.transfers.length} />
        <StatCard icon="network" tone="blue" label="Accounts" value={nodes.length} />
        <StatCard icon="flag" tone="red" label="Flagged" value={flagged.size} />
        <StatCard icon="arrow" tone="amber" label="In / out of payee" value={`${inbound} / ${outbound}`} />
        <StatCard icon="money" tone="green" label="Value moved" value={money(total, sample.payment.currency)} />
      </section>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
        <section className="panel">
          <PanelHead kicker="Investigation tools" title="Search network entities" icon="search" />
          <div className="search-box" style={{ marginBottom: 14 }}>
            <Icon name="search" size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Account ID, e.g. relay or victim" aria-label="Search accounts" />
          </div>
          <svg className="net-graph" viewBox={`0 0 ${width} 440`} role="img" aria-label="Synthetic account graph. The adjacent panel lists every transfer.">
            <defs>
              <marker id="net-arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className="arrow-head" d="M0 0 10 5 0 10z" /></marker>
            </defs>
            {graph.transfers.map((t, i) => {
              const a = pos(t.from_account_id);
              const b = pos(t.to_account_id);
              const hot = flagged.has(t.from_account_id) || flagged.has(t.to_account_id);
              return <line key={i} className={hot ? "hot" : ""} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#net-arrow)" />;
            })}
            {nodes.map((n) => {
              const isPayee = n.id === graph.payee_account_id;
              const dim = match && !n.id.toLowerCase().includes(match);
              const kind = flagged.has(n.id) ? "flagged" : isPayee ? "payee" : "";
              return (
                <g key={n.id} className={`node ${kind} ${dim ? "dim" : ""}`} role="button" tabIndex={0} aria-label={`${n.id}${flagged.has(n.id) ? ", flagged" : ""}. Press to toggle flag.`}
                  onClick={() => toggleFlag(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFlag(n.id); } }} style={{ cursor: "pointer" }}>
                  <circle cx={n.x} cy={n.y} r={isPayee ? 26 : 20} />
                  <text className="node-glyph" x={n.x} y={n.y + 5} textAnchor="middle">{flagged.has(n.id) ? "!" : isPayee ? "P" : "A"}</text>
                  <text x={n.x} y={n.y + (isPayee ? 44 : 36)} textAnchor="middle">{n.id}</text>
                </g>
              );
            })}
          </svg>
          <div className="legend">
            <span><i style={{ borderColor: "var(--accent-2)" }} /> Payment recipient</span>
            <span><i style={{ borderColor: "var(--hold)" }} /> Flagged account</span>
            <span><i style={{ borderColor: "var(--accent)" }} /> Other account</span>
            <span>Arrows show transfer direction</span>
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <PanelHead kicker="Engine evidence" title="Mule-network signals" icon="warn" />
            {!result && <EmptyState icon="network" title="Not assessed yet" text="Run the engine to see which mule patterns fire on this graph." />}
            {result && (
              <ul className="reason-list">
                {(result.audit.network_signals ?? []).length === 0 && <li className="calm"><Icon name="allow" size={16} /> No mule-network pattern found.</li>}
                {(result.audit.network_signals ?? []).map((signal) => (
                  <li key={signal.name}><Icon name="warn" size={16} /><span>{signal.name.replaceAll("_", " ")}<br /><small className="muted">{signal.reason}</small></span><span className="pts">+{signal.points}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <PanelHead kicker={sample.title} title="Transfers" icon="list" />
            <p className="muted small" style={{ marginTop: -8 }}>{sample.blurb}</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>From → to</th><th>Amount</th><th>When</th></tr></thead>
                <tbody>
                  {graph.transfers.map((t, i) => (
                    <tr key={i}><td><strong>{t.from_account_id}</strong><small>→ {t.to_account_id}</small></td><td className="mono">{money(t.amount, sample.payment.currency)}</td><td className="muted">{t.hours_ago} h ago</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>Synthetic test inputs, not discovered bank records.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
