import { useEffect, useState } from "react";
import { assessPayment, type AssessRequest, type ServerDecision, type Verification } from "../api";
import { HoldNotification } from "../components/HoldNotification";
import { VerificationPanel } from "../components/VerificationPanel";
import { Icon, type IconName } from "../components/Icon";
import { AgentEvidence } from "../components/AgentEvidence";
import { NetworkGraph } from "../components/NetworkGraph";
import { EmptyState, PageHead, PanelHead, ScoreRing, Toggle, toneForAction } from "../components/ui";
import type { AccountNetwork, Payment } from "../core/types";
import { caseReference, type CaseItem, type CaseStatus } from "../lib/cases";
import { contributions } from "../lib/contrib";
import { levelOf, money } from "../lib/insights";
import { ACTION_LABEL, ACTION_NOTE, networkLabel, SEGMENT_LABEL } from "../lib/labels";
import type { FinishedCase, Scenario } from "./Console";

export interface CaseContext {
  device: string;
  location: string;
  channel: string;
}

interface Props {
  scenarios: Scenario[];
  cases: CaseItem[];
  onCase: (finished: FinishedCase, context: CaseContext) => string;
  decide: (id: string, status: CaseStatus) => void;
  // A verification with the customer finished: update the case with the re-check.
  onVerified?: (caseId: string, verification: Verification) => void;
  openCase?: (caseId: string) => void;
}

type NetworkPattern = "none" | "ring" | "clean";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "beneficiary";

// Synthetic receiving-account graphs the analyst can attach so MuleNet scores the beneficiary in the same run.
function networkFor(pattern: NetworkPattern, payee: string): AccountNetwork | undefined {
  const id = slug(payee);
  if (pattern === "ring") {
    return {
      payee_account_id: id, flagged_account_ids: ["collector-77"],
      transfers: [
        { from_account_id: "victim-anita", to_account_id: id, amount: 12000, hours_ago: 6 },
        { from_account_id: "victim-farhan", to_account_id: id, amount: 9500, hours_ago: 5 },
        { from_account_id: "victim-gopal", to_account_id: id, amount: 15000, hours_ago: 4 },
        { from_account_id: "victim-meera", to_account_id: id, amount: 7000, hours_ago: 3 },
        { from_account_id: id, to_account_id: "relay-12", amount: 41000, hours_ago: 2 },
        { from_account_id: "relay-12", to_account_id: "collector-77", amount: 40000, hours_ago: 1 },
      ],
    };
  }
  if (pattern === "clean") {
    return {
      payee_account_id: id, flagged_account_ids: [],
      transfers: [
        { from_account_id: "cust-01", to_account_id: id, amount: 450, hours_ago: 20 },
        { from_account_id: "cust-02", to_account_id: id, amount: 1200, hours_ago: 9 },
        { from_account_id: id, to_account_id: "wholesale-co", amount: 600, hours_ago: 2 },
      ],
    };
  }
  return undefined;
}

const NETWORK_LABEL: Record<NetworkPattern, string> = {
  none: "No network data",
  ring: "Mule-ring pattern (synthetic)",
  clean: "Established merchant (synthetic)",
};

type Segment = "retiree" | "young_professional" | "small_business_owner" | "student" | "family";

interface Form {
  amount: string;
  currency: string;
  segment: Segment;
  typical: string;
  payee: string;
  payeeType: Payment["payee_type"];
  accountAge: string;
  device: string;
  location: string;
  channel: "mobile" | "web";
  time: string;
  recent: string;
  newPayee: boolean;
  newDevice: boolean;
  locationChanged: boolean;
  onCall: boolean;
  remote: boolean;
  note: string;
  network: NetworkPattern;
}

const now = () => new Date().toTimeString().slice(0, 5);

const BASE: Form = {
  amount: "1500", currency: "INR", segment: "young_professional", typical: "2000", payee: "Ravi Kirana Store",
  payeeType: "business", accountAge: "900", device: "dev-4821 · Pixel 8", location: "Mumbai", channel: "mobile",
  time: now(), recent: "0", newPayee: false, newDevice: false, locationChanged: false, onCall: false, remote: false, note: "", network: "none",
};

const PRESETS: { label: string; icon: IconName; form: Partial<Form> }[] = [
  { label: "Everyday payment", icon: "allow", form: {} },
  {
    label: "Bank-impersonation call", icon: "mic",
    form: { amount: "98500", payee: "Secure Holding A/c 7731", payeeType: "individual", accountAge: "3", newPayee: true, onCall: true, recent: "1",
      note: "The bank's fraud team called and said my account is compromised. They told me to move my savings to a safe account today and not to tell anyone.", network: "ring" },
  },
  {
    label: "Remote-control refund", icon: "device",
    form: { amount: "24999", payee: "QuickFix Tech Support", payeeType: "business", accountAge: "11", newPayee: true, remote: true,
      note: "Paying the technician for the antivirus renewal. He is connected on AnyDesk and helping me with the refund." },
  },
  {
    label: "Night transfer, new device", icon: "moon",
    form: { amount: "45000", payee: "Coinvault Exchange", payeeType: "crypto_exchange", accountAge: "40", newPayee: true, newDevice: true,
      locationChanged: true, location: "Unknown · VPN", device: "dev-9930 · unknown Android", time: "02:40", recent: "3" },
  },
];

function toRequest(form: Form, questions?: string[], answer?: string): AssessRequest {
  const today = new Date().toISOString().slice(0, 10);
  const payment: Payment = {
    amount: Number(form.amount),
    currency: form.currency,
    timestamp: `${today}T${form.time || "12:00"}:00`,
    payee_name: form.payee.trim() || "Unnamed beneficiary",
    payee_type: form.payeeType,
    is_new_payee: form.newPayee,
    payee_account_age_days: Math.max(0, Math.round(Number(form.accountAge) || 0)),
    channel: form.channel,
    device_known: !form.newDevice,
    payments_last_24h: Math.max(0, Math.round(Number(form.recent) || 0)),
    on_live_call: form.onCall,
    remote_access_tool_running: form.remote,
    location_changed: form.locationChanged,
  };
  const network = networkFor(form.network, payment.payee_name);
  return {
    payment,
    customer: { segment: form.segment, typical_amount: Math.max(1, Math.round(Number(form.typical) || 1)) },
    ...(network ? { network } : {}),
    message: form.note.trim() || null,
    ...(answer !== undefined ? { questions, answer } : {}),
  };
}

function scenarioOf(form: Form, request: AssessRequest): Scenario {
  return {
    id: "txn", title: `Payment to ${request.payment.payee_name}`, group: "genuine", kind: "Live", difficulty: "",
    blurb: "", customer: request.customer, payment: request.payment, message: form.note, sample_reply: "",
  };
}

function fromScenario(sc: Scenario): Form {
  const p = sc.payment;
  return {
    ...BASE,
    amount: String(p.amount), currency: p.currency, segment: sc.customer.segment as Segment, typical: String(sc.customer.typical_amount),
    payee: p.payee_name, payeeType: p.payee_type, accountAge: String(p.payee_account_age_days), channel: (p.channel === "web" ? "web" : "mobile"),
    time: p.timestamp.slice(11, 16), recent: String(p.payments_last_24h), newPayee: p.is_new_payee, newDevice: !p.device_known,
    locationChanged: false, onCall: p.on_live_call, remote: p.remote_access_tool_running, note: sc.message,
    network: sc.network ? "ring" : "none",
  };
}

// The last transaction and its result, kept while the visitor looks at other pages,
// so coming back to Transactions shows it again. Clear, or a new analysis, replaces it.
interface Remembered {
  form: Form;
  asked: ServerDecision | null;
  answer: string;
  result: ServerDecision | null;
  submitted: Form | null;
  caseId: string | null;
}
let remembered: Remembered | null = null;

export function Analyzer({ scenarios, cases, onCase, decide, onVerified, openCase }: Props) {
  const [form, setForm] = useState<Form>(remembered?.form ?? BASE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState<ServerDecision | null>(remembered?.asked ?? null);
  const [answer, setAnswer] = useState(remembered?.answer ?? "");
  const [result, setResult] = useState<ServerDecision | null>(remembered?.result ?? null);
  const [submitted, setSubmitted] = useState<Form | null>(remembered?.submitted ?? null);
  const [caseId, setCaseId] = useState<string | null>(remembered?.caseId ?? null);

  useEffect(() => {
    remembered = { form, asked, answer, result, submitted, caseId };
  }, [form, asked, answer, result, submitted, caseId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((old) => ({ ...old, [key]: value }));
  const amountOk = Number(form.amount) > 0 && Number(form.amount) <= 10_000_000;

  function clear() {
    setForm({ ...BASE, time: now() });
    setResult(null);
    setAsked(null);
    setAnswer("");
    setError("");
    setCaseId(null);
  }

  function finish(decision: ServerDecision, used: Form, questions?: string[], reply?: string) {
    setResult(decision);
    setAsked(null);
    const request = toRequest(used);
    const id = onCase(
      { scenario: { ...scenarioOf(used, request), ...(request.network ? { network: request.network } : {}) }, message: used.note.trim() || null, questions, answer: reply, decision },
      { device: used.device.trim(), location: used.location.trim(), channel: used.channel },
    );
    setCaseId(id);
  }

  async function analyse() {
    if (!amountOk) return;
    const used = { ...form };
    setBusy(true);
    setError("");
    setResult(null);
    setAsked(null);
    setCaseId(null);
    setSubmitted(used);
    try {
      const decision = await assessPayment(toRequest(used));
      if (decision.action === "ask") {
        setAsked(decision);
        setAnswer("");
      } else {
        finish(decision, used);
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer(text: string) {
    if (!asked || !submitted) return;
    setBusy(true);
    setError("");
    try {
      const decision = await assessPayment(toRequest(submitted, asked.questions, text));
      finish(decision, submitted, asked.questions, text);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const shown = result ?? asked;
  const items = shown ? contributions(shown) : [];
  const status = result ? result.action : asked ? "ask" : null;
  const used = submitted ?? form;

  return (
    <div>
      <PageHead kicker="Real-time fraud engine" title="Transaction Risk" accent="Analyzer" text="Enter the transaction context. Last Mile Guard evaluates behaviour, device, beneficiary, location, timing and the customer's own words before the payment completes.">
        <span className="status-pill"><span className="dot" /> Engine online</span>
      </PageHead>

      <div className="preset-row" aria-label="Quick examples">
        {PRESETS.map((preset) => (
          <button key={preset.label} className="chip-btn" onClick={() => { setForm({ ...BASE, time: preset.form.time ?? now(), ...preset.form }); setResult(null); setAsked(null); }}>
            <Icon name={preset.icon} size={14} /> {preset.label}
          </button>
        ))}
        <select className="f-select" style={{ width: "auto", minHeight: 36 }} aria-label="Load a scenario from the library" value="" onChange={(event) => { const sc = scenarios.find((s) => s.id === event.target.value); if (sc) { setForm(fromScenario(sc)); setResult(null); setAsked(null); } }}>
          <option value="">Load from scenario library…</option>
          {scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.title}</option>)}
        </select>
      </div>

      <div className="analyzer">
        <section className="panel">
          <PanelHead kicker="Step 01" title="Transaction context" icon="pulse" />

          <label className="f-label" htmlFor="amount">Transaction amount</label>
          <div className="money-input">
            <select aria-label="Currency" className="f-select" style={{ width: 86, border: 0, background: "none" }} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="INR">₹ INR</option><option value="USD">$ USD</option><option value="GBP">£ GBP</option><option value="EUR">€ EUR</option>
            </select>
            <input id="amount" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} aria-invalid={!amountOk} />
          </div>
          {!amountOk && <span className="f-help" style={{ color: "var(--hold)" }}>Enter an amount between 1 and 1,00,00,000.</span>}

          <div className="form-grid" style={{ marginTop: 14 }}>
            <div>
              <label className="f-label" htmlFor="payee"><Icon name="user" size={13} /> Beneficiary</label>
              <input id="payee" className="f-input" maxLength={80} value={form.payee} onChange={(e) => set("payee", e.target.value)} />
            </div>
            <div>
              <label className="f-label" htmlFor="ptype">Beneficiary type</label>
              <select id="ptype" className="f-select" value={form.payeeType} onChange={(e) => set("payeeType", e.target.value as Form["payeeType"])}>
                <option value="individual">Individual</option><option value="business">Business / merchant</option><option value="crypto_exchange">Crypto exchange</option>
              </select>
            </div>
            <div>
              <label className="f-label" htmlFor="device"><Icon name="device" size={13} /> Device ID</label>
              <input id="device" className="f-input" maxLength={60} value={form.device} onChange={(e) => set("device", e.target.value)} />
            </div>
            <div>
              <label className="f-label" htmlFor="loc"><Icon name="map" size={13} /> Transaction location</label>
              <input id="loc" className="f-input" maxLength={60} value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div>
              <label className="f-label" htmlFor="age">Beneficiary account age (days)</label>
              <input id="age" className="f-input" inputMode="numeric" value={form.accountAge} onChange={(e) => set("accountAge", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label className="f-label" htmlFor="time" title="01:00–05:59 counts as a night payment"><Icon name="moon" size={13} /> Payment time</label>
              <input id="time" type="time" className="f-input" value={form.time} onChange={(e) => set("time", e.target.value)} />
            </div>
          </div>

          <p className="sub-kicker">Behavioural security signals</p>
          <div className="toggle-grid">
            <Toggle id="t-payee" label="New beneficiary" hint="First payment to this payee" checked={form.newPayee} onChange={(v) => set("newPayee", v)} />
            <Toggle id="t-device" label="New device" hint="Device not seen before" checked={form.newDevice} onChange={(v) => set("newDevice", v)} />
            <Toggle id="t-loc" label="Location changed" hint="Unusual place for this user" checked={form.locationChanged} onChange={(v) => set("locationChanged", v)} />
            <Toggle id="t-call" label="On a live call" hint="Customer is on a phone call" checked={form.onCall} onChange={(v) => set("onCall", v)} />
            <Toggle id="t-remote" label="Remote-access app" hint="AnyDesk, TeamViewer and similar" checked={form.remote} onChange={(v) => set("remote", v)} />
            <div>
              <label className="f-label" htmlFor="recent">Payments in last 24 hours</label>
              <input id="recent" className="f-input" inputMode="numeric" value={form.recent} onChange={(e) => set("recent", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </div>
          </div>

          <p className="sub-kicker">Receiving account (MuleNet)</p>
          <label className="f-label" htmlFor="network">Who this beneficiary has been sending to and receiving from</label>
          <select id="network" className="f-select" value={form.network} onChange={(e) => set("network", e.target.value as NetworkPattern)}>
            <option value="none">{NETWORK_LABEL.none}</option>
            <option value="ring">{NETWORK_LABEL.ring}</option>
            <option value="clean">{NETWORK_LABEL.clean}</option>
          </select>

          <p className="sub-kicker">Customer profile</p>
          <div className="form-grid">
            <div>
              <label className="f-label" htmlFor="segment">Segment</label>
              <select id="segment" className="f-select" value={form.segment} onChange={(e) => set("segment", e.target.value as Segment)}>
                <option value="young_professional">Young professional</option><option value="retiree">Retiree</option><option value="family">Family</option>
                <option value="student">Student</option><option value="small_business_owner">Small business owner</option>
              </select>
            </div>
            <div>
              <label className="f-label" htmlFor="typical">Usual payment amount</label>
              <input id="typical" className="f-input" inputMode="numeric" value={form.typical} onChange={(e) => set("typical", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="span-2">
              <label className="f-label" htmlFor="note"><Icon name="brain" size={13} /> What the customer says this payment is for</label>
              <textarea id="note" className="f-area" style={{ minHeight: 90, fontFamily: "var(--font)" }} maxLength={2000} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Paying my landlord the first month's rent. I met him and signed the agreement." />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn primary" disabled={busy || !amountOk} onClick={analyse}>{busy ? <span className="spin" /> : <Icon name="pulse" size={16} />} {busy ? "Analysing" : "Analyse transaction"}</button>
            <button className="btn" onClick={clear}>Clear</button>
          </div>
        </section>

        <section className="panel result-panel" aria-live="polite">
          {!shown && !busy && !error && (
            <EmptyState icon="shield" title="Awaiting risk assessment" text="Complete the transaction context and run the engine. The explainable result will appear here."
              action={<ul className="checklist"><li><Icon name="check" size={14} /> Multi-signal scoring</li><li><Icon name="check" size={14} /> Rule-based evaluation</li><li><Icon name="check" size={14} /> Explainable decision</li></ul>} />
          )}
          {busy && !shown && <EmptyState icon="pulse" title="Analysing" text="Scoring behaviour signals and reading the customer's note." />}
          {error && <p className="problem-box" role="alert">{error}</p>}

          {shown && status && (
            <>
              <PanelHead kicker="Step 02 · explainable AI" title="Risk assessment">
                <span className={`act ${status}`}>{status === "hold" ? "High risk" : status === "warn" ? "Medium risk" : status === "ask" ? "Needs info" : "Low risk"}</span>
              </PanelHead>
              <div className="verdict-box">
                <ScoreRing score={shown.score} tone={toneForAction(status)} label="RISK" />
                <div className="verdict-card">
                  <span className="kicker" style={{ color: "var(--muted)" }}>Decision</span>
                  <div className={`big ${status}`}><Icon name={status as IconName} size={22} /> {ACTION_LABEL[status].toUpperCase()}</div>
                  <span className="muted small">{ACTION_NOTE[status]}</span>
                </div>
              </div>

              <div className="engine-bars" aria-label="Score from each engine">
                <EngineBar name="FraudShield" what="Payment behaviour" value={shown.audit.behaviour_score} />
                <EngineBar name="ScamStop" what="Customer's words" value={shown.audit.message_reading ? shown.audit.message_reading.scam_likelihood : null} empty="No note" />
                <EngineBar name="MuleNet" what="Receiving account" value={shown.audit.network_available ? shown.audit.network_score ?? 0 : null} empty="No data" />
                <p className="muted small">Warn from {shown.audit.thresholds.warn} · hold from {shown.audit.thresholds.hold}</p>
              </div>

              {result?.notice && <p className="ai-note warn"><Icon name="warn" size={16} /> {result.notice}</p>}
              {result?.customer_warning && <p className="ai-note"><Icon name="shield" size={16} /> {result.customer_warning}</p>}
              {result?.action === "hold" && <HoldNotification amount={Number(used.amount)} currency={used.currency} reference={caseReference(result.execution?.request_id)} />}
              {result && result.action !== "allow" && result.execution?.saved && caseId && (
                <VerificationPanel key={result.execution.request_id} caseId={result.execution.request_id} score={result.score}
                  topReason={result.reasons[0]} onDone={(verification) => onVerified?.(caseId, verification)}
                  onOpenCase={() => openCase?.(caseId)} />
              )}
              {!result?.customer_warning && result?.action === "allow" && <p className="ai-note"><Icon name="allow" size={16} /> Last Mile Guard detected a low-risk transaction pattern. No major fraud indicators were identified.</p>}

              {asked && (
                <div className="ask-box">
                  <p><strong>Before deciding, the engine asks the customer:</strong></p>
                  <p>{asked.questions?.join(" ")}</p>
                  <label className="f-label" htmlFor="reply">Customer's answer</label>
                  <textarea id="reply" className="f-area" style={{ minHeight: 70, fontFamily: "var(--font)" }} maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                  <div className="form-actions" style={{ marginTop: 10 }}>
                    <button className="btn primary small" disabled={busy} onClick={() => sendAnswer(answer)}>Send answer</button>
                    <button className="btn small" disabled={busy} onClick={() => sendAnswer("")}>Customer declines</button>
                  </div>
                </div>
              )}

              <PanelHead kicker="Why this decision?" title="Explainable risk signals" icon="eye" />
              <ul className="reason-list">
                {items.length === 0 && <li className="calm"><Icon name="allow" size={16} /> No suspicious transaction signals detected.</li>}
                {items.map((item) => (
                  <li key={item.label} className={item.points < 0 ? "calm" : ""} title={item.why}>
                    <Icon name={item.points < 0 ? "allow" : "warn"} size={16} />
                    <span>{item.label}<br /><small className="muted">{item.why}</small></span>
                    <span className="pts">{item.points > 0 ? `+${item.points}` : item.points}</span>
                  </li>
                ))}
              </ul>

              <PanelHead kicker="Transaction context" title="Signals used by the engine" />
              <div className="context-grid">
                <div><small>Amount</small><strong>{money(Number(used.amount), used.currency)}</strong></div>
                <div><small>Beneficiary</small><strong>{used.payee}</strong></div>
                <div><small>Device</small><strong>{used.device || "Not supplied"}</strong></div>
                <div><small>Location</small><strong>{used.location || "Not supplied"}</strong></div>
              </div>

              {result && (
                <div className="form-actions">
                  <details style={{ flex: 1 }}><summary className="muted small" style={{ cursor: "pointer", paddingTop: 10 }}>Full audit record</summary><pre style={{ maxHeight: 260, overflow: "auto", fontSize: "0.72rem" }}>{JSON.stringify(result.audit, null, 2)}</pre></details>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {result && submitted && caseId && (
        <Investigation result={result} used={submitted} caseId={caseId} cases={cases} decide={decide} />
      )}
    </div>
  );
}


function EngineBar({ name, what, value, empty }: { name: string; what: string; value: number | null; empty?: string }) {
  const tone = value === null ? "" : value >= 70 ? "red" : value >= 40 ? "amber" : "green";
  return (
    <div className="engine-bar">
      <span><strong>{name}</strong> <span className="muted">{what}</span></span>
      <strong className="mono">{value === null ? empty : `${value}/100`}</strong>
      <div className="dist-track"><div className={`dist-fill tone-${tone || "green"}`} style={{ width: `${value ?? 0}%` }} /></div>
    </div>
  );
}

// ---------- everything about this one transaction, on the same page ----------

const STATUS_TEXT: Record<CaseStatus, string> = {
  open: "Awaiting analyst decision",
  approved: "Approved by analyst",
  held: "Kept on hold by analyst",
  escalated: "Escalated for investigation",
};

function Investigation({ result, used, caseId, cases, decide }: {
  result: ServerDecision;
  used: Form;
  caseId: string;
  cases: CaseItem[];
  decide: (id: string, status: CaseStatus) => void;
}) {
  const item = cases.find((c) => c.id === caseId);
  const earlier = cases.filter((c) => c.id !== caseId && c.source !== "recorded");
  const sameLocation = used.location.trim() ? earlier.filter((c) => c.location === used.location.trim()) : [];
  const sameDevice = used.device.trim() ? earlier.filter((c) => c.device === used.device.trim()) : [];
  const samePayee = earlier.filter((c) => c.payee === (used.payee.trim() || "Unnamed beneficiary"));
  const worst = (list: CaseItem[]) => list.reduce((max, c) => Math.max(max, c.score), 0);
  const amount = Number(used.amount);
  const usual = Math.max(1, Number(used.typical) || 1);
  const ratio = amount / usual;
  const network = networkFor(used.network, used.payee.trim() || "Unnamed beneficiary");
  const netSignals = result.audit.network_signals ?? [];
  const netScore = result.audit.network_score ?? 0;
  const status = item?.status ?? "open";
  const statusText = status === "open" ? (result.action === "allow" ? "No review needed" : "Awaiting analyst decision") : STATUS_TEXT[status];
  const statusTone = status === "approved" || (status === "open" && result.action === "allow") ? "allow" : status === "open" ? "warn" : "hold";

  const seen = (label: string, list: CaseItem[], value: string) => (
    <div className="ctx-row">
      <span className="muted">{label}</span>
      <strong>{value || "Not supplied"}</strong>
      <span className={`lvl ${list.length ? levelOf(worst(list)) : "low"}`}>
        {list.length ? `Seen ${list.length}× before · worst ${worst(list)}` : value ? "First time in this session" : "—"}
      </span>
    </div>
  );

  return (
    <section className="investigation" aria-labelledby="investigation-title">
      <div className="section-title" style={{ marginTop: 26 }}>
        <p className="kicker">Step 03 · complete investigation</p>
        <h2 id="investigation-title">Everything about this transaction</h2>
      </div>

      <section className="panel case-file">
        <PanelHead kicker={`Case ${caseId}`} title="Case file" icon="flag">
          <span className={`act ${statusTone}`}>{statusText}</span>
        </PanelHead>
        <div className="case-file-grid">
          <div>
            <div className="case-facts">
              <div><small>Decision</small><strong className={`lvl ${levelOf(result.score)}`}>{ACTION_LABEL[result.action]} · {result.score}/100</strong></div>
              <div><small>Amount</small><strong>{money(amount, used.currency)}</strong></div>
              <div><small>Beneficiary</small><strong>{used.payee.trim() || "Unnamed beneficiary"}</strong></div>
              <div><small>Beneficiary type</small><strong>{used.payeeType === "crypto_exchange" ? "Crypto exchange" : used.payeeType === "business" ? "Business / merchant" : "Individual"} · account {used.accountAge || 0} days old</strong></div>
              <div><small>Payment time</small><strong>{used.time || "—"} · {used.channel === "web" ? "Web banking" : "Mobile app"}</strong></div>
              <div><small>Customer</small><strong>{SEGMENT_LABEL(used.segment)} · {Number(used.recent) || 0} payment{Number(used.recent) === 1 ? "" : "s"} in 24 h</strong></div>
              <div><small>Device</small><strong>{used.device.trim() || "Not supplied"}</strong></div>
              <div><small>Location</small><strong>{used.location.trim() || "Not supplied"}</strong></div>
            </div>

            <p className="sub-kicker">Analyst decision</p>
            <p className="muted small" style={{ marginTop: -4 }}>
              {result.action === "allow" ? "The engine allowed this payment. You can still escalate it if something looks wrong." : "The engine recommends a person reviews this payment before any money moves."}
            </p>
            <div className="chip-row" style={{ marginBottom: 6 }}>
              {result.action !== "allow" && <button className="btn small" disabled={status === "approved"} onClick={() => decide(caseId, "approved")}><Icon name="allow" size={14} /> Approve payment</button>}
              {result.action !== "allow" && <button className="btn small" disabled={status === "held"} onClick={() => decide(caseId, "held")}><Icon name="hold" size={14} /> Keep on hold</button>}
              <button className="btn small" disabled={status === "escalated"} onClick={() => decide(caseId, "escalated")}><Icon name="flag" size={14} /> Escalate</button>
            </div>

            <p className="sub-kicker">Audit trail</p>
            <ol className="audit-trail">
              {(item?.trail ?? []).map((entry, index) => <li key={`${entry.when}-${index}`}><span className="mono muted">{entry.when}</span> {entry.text}</li>)}
            </ol>
          </div>
          <div>{item && <AgentEvidence item={item} />}</div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <PanelHead kicker="ScamStop · customer's own words" title="Customer conversation" icon="brain" />
          <div className="thread">
            <div className="bubble customer"><span className="who">Customer note</span>{used.note.trim() || <em className="muted">No note written</em>}</div>
            {item?.questions && <div className="bubble guard"><span className="who">Engine asked</span>{item.questions.join(" ")}</div>}
            {item?.answer !== undefined && <div className="bubble customer"><span className="who">Customer answered</span>{item.answer || <em className="muted">Declined to answer</em>}</div>}
          </div>
          {result.audit.message_reading ? (
            <p className="ai-note" style={{ marginTop: 14 }}><Icon name="brain" size={16} /> <span><strong>Reading:</strong> {result.audit.message_reading.explanation} {result.audit.message_reading.tactics.filter((t) => t !== "none").length > 0 && <>Tactics: {result.audit.message_reading.tactics.filter((t) => t !== "none").map((t) => t.replaceAll("_", " ")).join(", ")}.</>}</span></p>
          ) : <p className="muted small" style={{ marginTop: 14 }}>No message reading for this payment{used.note.trim() ? " (the reader was unavailable, so payment checks decided)" : ""}.</p>}
          {result.customer_warning && <p className="ai-note warn"><Icon name="shield" size={16} /> <span><strong>Warning shown to the customer:</strong> {result.customer_warning}</span></p>}
        </section>

        <section className="panel">
          <PanelHead kicker="Behaviour, device and geography" title="Context for this customer" icon="user" />
          <div className="ctx-amount">
            <div className="dist-head"><span>This payment vs usual amount</span><strong className="mono">{ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×</strong></div>
            <div className="dist-track"><div className={`dist-fill tone-${ratio >= 5 ? "red" : ratio >= 3 ? "amber" : "green"}`} style={{ width: `${Math.min(100, (ratio / 10) * 100)}%` }} /></div>
            <small className="muted">{money(amount, used.currency)} now · usually about {money(usual, used.currency)}</small>
          </div>
          {seen("Location", sameLocation, used.location.trim())}
          {seen("Device", sameDevice, used.device.trim())}
          {seen("Beneficiary", samePayee, used.payee.trim())}
          <div className="tag-row" style={{ marginTop: 12 }}>
            {used.locationChanged && <span className="act hold">Unusual location</span>}
            {used.newDevice && <span className="act hold">New device</span>}
            {used.newPayee && <span className="act warn">New beneficiary</span>}
            {used.onCall && <span className="act hold">On a live call</span>}
            {used.remote && <span className="act hold">Remote-access app</span>}
            {!used.locationChanged && !used.newDevice && !used.newPayee && !used.onCall && !used.remote && <span className="act allow">No behavioural flags</span>}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <PanelHead kicker="Receiving account · MuleNet" title="Where the money would go" icon="network">
          {network && <span className={`act ${netScore >= 70 ? "hold" : netScore >= 40 ? "warn" : "allow"}`}>Network score {netScore}/100</span>}
        </PanelHead>
        {network ? (
          <div className="net-split">
            <div><NetworkGraph graph={network} markerId="txn-net-arrow" payment={{ label: `This payment · ${money(amount, used.currency)}` }} /></div>
            <div>
              <p className="sub-kicker" style={{ marginTop: 0 }}>How to read it</p>
              <ul className="read-guide">
                <li><span className="node-key you">You</span> The customer making this payment.</li>
                <li><span className="node-key payee">P</span> The beneficiary being paid.</li>
                <li><span className="node-key">A</span> Left: who else paid it in the last 24 h. Right: where it sent money on.</li>
                <li><span className="node-key flagged">!</span> An account already flagged as a mule.</li>
              </ul>
              <p className="sub-kicker">What MuleNet found</p>
              <ul className="reason-list">
                {netSignals.length === 0 && <li className="calm"><Icon name="allow" size={16} /> No mule-network pattern around this beneficiary.</li>}
                {netSignals.map((signal) => (
                  <li key={signal.name}><Icon name="warn" size={16} /><span>{networkLabel(signal.name)}<br /><small className="muted">{signal.reason}</small></span><span className="pts">+{signal.points}</span></li>
                ))}
              </ul>
              <p className="muted small" style={{ margin: 0 }}>{NETWORK_LABEL[used.network]}. Synthetic test data, not real bank records.</p>
            </div>
          </div>
        ) : (
          <EmptyState icon="network" title="No account-network data for this run" text="Choose a pattern under “Receiving account (MuleNet)” in the form and analyse again to check where the money would go next." />
        )}
      </section>
    </section>
  );
}
