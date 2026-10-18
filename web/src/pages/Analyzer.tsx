import { useEffect, useRef, useState, type ReactNode } from "react";
import { streamAssessment, type AssessmentEvent, type AssessmentStage, type AssessRequest, type ServerDecision } from "../api";
import { CallResult } from "../components/CallResult";
import { HoldNotification } from "../components/HoldNotification";
import { JourneySteps } from "../components/JourneySteps";
import type { LiveRun } from "../lib/live";
import { heldBy, whyStillHeld } from "../lib/callWhy";
import type { ActiveCall } from "../components/VerificationPanel";
import { Icon, type IconName } from "../components/Icon";
import { NetworkGraph } from "../components/NetworkGraph";
import { PlaybookMatch } from "../components/ScamPlaybook";
import { AgentInvestigation } from "../components/AgentInvestigation";
import { PageHead, ScoreRing, Toggle, toneForAction } from "../components/ui";
import type { AccountNetwork, Payment } from "../core/types";
import { caseReference, type CaseItem, type CaseStatus } from "../lib/cases";
import { contributions } from "../lib/contrib";
import { money } from "../lib/insights";
import { ACTION_LABEL, ACTION_NOTE } from "../lib/labels";
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
  // Open this payment's case on the Cases page, where the analyst decides.
  openCase?: (caseId: string) => void;
  // The customer pressed "Call fraud team": the call continues on the Voice AI page.
  onStartCall?: (call: ActiveCall) => void;
  // A payment made in the customer app, in another window: shown here as it happens.
  live?: LiveRun | null;
}

export type NetworkPattern = "none" | "ring" | "clean";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "beneficiary";

// Synthetic receiving-account graphs the analyst can attach so MuleNet scores the beneficiary in the same run.
export function networkFor(pattern: NetworkPattern, payee: string): AccountNetwork | undefined {
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

export type Segment = "retiree" | "young_professional" | "small_business_owner" | "student" | "family";

export interface Form {
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

export const now = () => new Date().toTimeString().slice(0, 5);

export const BASE: Form = {
  amount: "1500", currency: "INR", segment: "young_professional", typical: "2000", payee: "Ravi Kirana Store",
  payeeType: "business", accountAge: "900", device: "dev-4821 · Pixel 8", location: "Mumbai", channel: "mobile",
  time: now(), recent: "0", newPayee: false, newDevice: false, locationChanged: false, onCall: false, remote: false, note: "", network: "none",
};

export const PRESETS: { label: string; icon: IconName; form: Partial<Form> }[] = [
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

export function toRequest(form: Form, questions?: string[], answer?: string): AssessRequest {
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

export function scenarioOf(form: Form, request: AssessRequest): Scenario {
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
  stages: Stages;
}
type Stages = Partial<Record<AssessmentStage, AssessmentEvent>>;
let remembered: Remembered | null = null;

export function Analyzer({ scenarios, cases, onCase, openCase, onStartCall, live }: Props) {
  const [form, setForm] = useState<Form>(remembered?.form ?? BASE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState<ServerDecision | null>(remembered?.asked ?? null);
  const [answer, setAnswer] = useState(remembered?.answer ?? "");
  const [result, setResult] = useState<ServerDecision | null>(remembered?.result ?? null);
  const [submitted, setSubmitted] = useState<Form | null>(remembered?.submitted ?? null);
  const [caseId, setCaseId] = useState<string | null>(remembered?.caseId ?? null);
  // Stage events from the server, shown one by one as the checks run.
  const [stages, setStages] = useState<Stages>(remembered?.stages ?? {});
  // Which ready-made scenario filled the form, if any.
  const [picked, setPicked] = useState("");
  const queue = useRef<AssessmentEvent[]>([]);
  const draining = useRef<number | null>(null);

  useEffect(() => {
    remembered = { form, asked, answer, result, submitted, caseId, stages };
  }, [form, asked, answer, result, submitted, caseId, stages]);
  useEffect(() => () => { if (draining.current !== null) window.clearTimeout(draining.current); }, []);

  // A proxy can deliver the stage events in one burst; showing them a beat apart keeps the order readable.
  // The times shown are the server's own.
  function drain() {
    const next = queue.current.shift();
    if (!next) { draining.current = null; return; }
    setStages((old) => ({ ...old, [next.stage]: next }));
    draining.current = window.setTimeout(drain, 280);
  }
  function onStage(event: AssessmentEvent) {
    queue.current.push(event);
    if (draining.current === null) drain();
  }
  const settled = () => new Promise<void>((resolve) => {
    const check = () => (queue.current.length || draining.current !== null ? window.setTimeout(check, 80) : resolve());
    check();
  });
  async function run(request: AssessRequest) {
    const decision = await streamAssessment(request, onStage);
    await settled();
    return decision;
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((old) => ({ ...old, [key]: value }));
  const amountOk = Number(form.amount) > 0 && Number(form.amount) <= 10_000_000;

  // Following a payment from the customer app. Running a payment here stops following it.
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const leftRun = useRef<string | null>(null);
  const shownRun = useRef<{ run: string; result: boolean; call: boolean } | null>(null);
  useEffect(() => {
    if (!live || live.run === leftRun.current) return;
    const seen = shownRun.current?.run === live.run ? shownRun.current : null;
    setLiveRun(live.run);
    setForm(live.form);
    setSubmitted(live.form);
    setStages(live.stages);
    setAsked(live.result ? null : live.asked);
    setResult(live.result);
    setCaseId(live.caseId);
    setBusy(!live.result && (!live.asked || live.answer !== null));
    setError("");
    const target = !seen ? "flow-2" : live.result && !seen.result ? "flow-3" : live.call && !seen.call ? "flow-4" : null;
    if (target) window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    shownRun.current = { run: live.run, result: Boolean(live.result), call: Boolean(live.call) };
  }, [live]);
  const following = liveRun !== null && live?.run === liveRun;
  function stopFollowing() {
    if (liveRun) leftRun.current = liveRun;
    setLiveRun(null);
  }
  function openCustomerApp() {
    window.open(`${window.location.pathname}#/customer`, "lmg-customer", "width=430,height=900");
  }

  function clear() {
    stopFollowing();
    setForm({ ...BASE, time: now() });
    setResult(null);
    setAsked(null);
    setAnswer("");
    setError("");
    setCaseId(null);
    setStages({});
    setPicked("");
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
    stopFollowing();
    const used = { ...form };
    setBusy(true);
    setError("");
    setResult(null);
    setAsked(null);
    setCaseId(null);
    setStages({});
    setSubmitted(used);
    window.setTimeout(() => document.getElementById("flow-2")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    try {
      const decision = await run(toRequest(used));
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
      const decision = await run(toRequest(submitted, asked.questions, text));
      finish(decision, submitted, asked.questions, text);
      window.setTimeout(() => document.getElementById("flow-3")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
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
  // The customer's call: possible once a warned or held payment was saved; its result comes back on the case.
  const currentCase = caseId ? cases.find((item) => item.id === caseId) : undefined;
  const serverId = result?.execution?.saved ? result.execution.request_id : null;
  const canCall = Boolean(result && result.action !== "allow" && serverId && caseId);
  const callDone = Boolean(currentCase?.verification?.outcome);
  function startCall() {
    if (!result || !serverId || !caseId) return;
    onStartCall?.({
      caseId, serverId, reference: caseReference(serverId), amount: Number(used.amount), currency: used.currency,
      payee: used.payee || "the payee", score: result.score, topReason: result.reasons[0],
    });
  }
  const stage = callDone ? 3 : canCall ? 2 : 1;
  // Coming back from the call: show its result straight away.
  useEffect(() => {
    if (callDone) window.setTimeout(() => document.getElementById("flow-4")?.scrollIntoView({ block: "start" }), 150);
  }, []);

  const started = busy || Boolean(shown) || Object.keys(stages).length > 0;
  const network = submitted ? networkFor(submitted.network, submitted.payee.trim() || "Unnamed beneficiary") : undefined;
  const amount = Number(used.amount);
  const usual = Math.max(1, Number(used.typical) || 1);
  const step = (n: number): FlowState => {
    if (n === 1) return started ? "done" : "active";
    if (n === 2) return shown ? "done" : started ? "active" : "waiting";
    if (n === 3) return result ? "done" : asked ? "active" : "waiting";
    if (n === 4) return !result ? "waiting" : result.action === "allow" ? "skipped" : callDone ? "done" : "active";
    return !result ? "waiting" : result.action === "allow" ? "skipped" : currentCase && currentCase.status !== "open" ? "done" : callDone ? "active" : "waiting";
  };

  return (
    <div>
      <JourneySteps current={stage} />
      <PageHead kicker="Real-time fraud engine" title="Transaction Risk" accent="Analyzer" text="Follow one payment from top to bottom: the details, how each check reads it, the decision, the customer's call and the analyst.">
        <button className="btn small" onClick={openCustomerApp}><Icon name="device" size={14} /> Open the customer app</button>
        <span className="status-pill"><span className="dot" /> Engine online</span>
      </PageHead>

      {following && (
        <div className="live-banner" role="status">
          <span className="dot" /> <strong>Live from the customer app:</strong> {money(Number(used.amount), used.currency)} to {used.payee}. This page follows the payment as the customer makes it.
        </div>
      )}

      <ol className="flow" aria-label="The steps for one payment">
        {/* ---------- 1. the payment ---------- */}
        <FlowStep n={1} state={step(1)} title="Payment details" sub="The transfer the customer is about to make, and what they wrote about it.">
          <div className="scenario-bar" role="group" aria-label="Ready-made scenarios">
            <div className="scenario-bar-head">
              <span className="scenario-bar-icon"><Icon name="flask" size={18} /></span>
              <div>
                <strong>Try a ready-made scenario</strong>
                <span className="muted small">Pick one to fill in the payment below, then press Analyse transaction. Or type your own.</span>
              </div>
            </div>
            <div className="scenario-bar-options">
              {PRESETS.map((preset) => (
                <button key={preset.label} className={`chip-btn ${picked === preset.label ? "on" : ""}`} aria-pressed={picked === preset.label}
                  onClick={() => { setForm({ ...BASE, time: preset.form.time ?? now(), ...preset.form }); setPicked(preset.label); setResult(null); setAsked(null); setStages({}); }}>
                  <Icon name={preset.icon} size={14} /> {preset.label}
                </button>
              ))}
              <select className="f-select preset-select" aria-label="More scenarios from the library" value="" onChange={(event) => { const sc = scenarios.find((s) => s.id === event.target.value); if (sc) { setForm(fromScenario(sc)); setPicked(sc.title); setResult(null); setAsked(null); setStages({}); } }}>
                <option value="">More scenarios…</option>
                {scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.title}</option>)}
              </select>
            </div>
          </div>

          <section className="panel">
            <div className="fields-4" style={{ marginTop: 0 }}>
              <div>
                <label className="f-label" htmlFor="amount">Transaction amount</label>
                <div className="money-input">
                  <select aria-label="Currency" className="f-select" style={{ width: 86, border: 0, background: "none" }} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="INR">₹ INR</option><option value="USD">$ USD</option><option value="GBP">£ GBP</option><option value="EUR">€ EUR</option>
                  </select>
                  <input id="amount" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} aria-invalid={!amountOk} />
                </div>
                {!amountOk && <span className="f-help" style={{ color: "var(--hold)" }}>Enter an amount between 1 and 1,00,00,000.</span>}
              </div>
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
                <label className="f-label" htmlFor="age">Beneficiary account age (days)</label>
                <input id="age" className="f-input" inputMode="numeric" value={form.accountAge} onChange={(e) => set("accountAge", e.target.value.replace(/\D/g, ""))} />
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
                <label className="f-label" htmlFor="time" title="01:00–05:59 counts as a night payment"><Icon name="moon" size={13} /> Payment time</label>
                <input id="time" type="time" className="f-input" value={form.time} onChange={(e) => set("time", e.target.value)} />
              </div>
              <div>
                <label className="f-label" htmlFor="recent">Payments in last 24 hours</label>
                <input id="recent" className="f-input" inputMode="numeric" value={form.recent} onChange={(e) => set("recent", e.target.value.replace(/\D/g, "").slice(0, 2))} />
              </div>
            </div>

            <p className="sub-kicker">Behavioural security signals</p>
            <div className="toggle-row">
              <Toggle id="t-payee" label="New beneficiary" hint="First payment to this payee" checked={form.newPayee} onChange={(v) => set("newPayee", v)} />
              <Toggle id="t-device" label="New device" hint="Device not seen before" checked={form.newDevice} onChange={(v) => set("newDevice", v)} />
              <Toggle id="t-loc" label="Location changed" hint="Unusual place for this user" checked={form.locationChanged} onChange={(v) => set("locationChanged", v)} />
              <Toggle id="t-call" label="On a live call" hint="Customer is on a phone call" checked={form.onCall} onChange={(v) => set("onCall", v)} />
              <Toggle id="t-remote" label="Remote-access app" hint="AnyDesk, TeamViewer and similar" checked={form.remote} onChange={(v) => set("remote", v)} />
            </div>

            <div className="fields-4" style={{ marginTop: 14 }}>
              <div>
                <label className="f-label" htmlFor="segment">Customer segment</label>
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
                <label className="f-label" htmlFor="network"><Icon name="network" size={13} /> Receiving account (MuleNet): who it sends to and receives from</label>
                <select id="network" className="f-select" value={form.network} onChange={(e) => set("network", e.target.value as NetworkPattern)}>
                  <option value="none">{NETWORK_LABEL.none}</option>
                  <option value="ring">{NETWORK_LABEL.ring}</option>
                  <option value="clean">{NETWORK_LABEL.clean}</option>
                </select>
              </div>
            </div>

            <div className="note-row">
              <div>
                <label className="f-label" htmlFor="note"><Icon name="brain" size={13} /> What the customer says this payment is for</label>
                <textarea id="note" className="f-area" style={{ minHeight: 76, fontFamily: "var(--font)" }} maxLength={2000} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Paying my landlord the first month's rent. I met him and signed the agreement." />
              </div>
              <div className="note-actions">
                <button className="btn primary" disabled={busy || !amountOk} onClick={analyse}>{busy ? <span className="spin" /> : <Icon name="pulse" size={16} />} {busy ? "Analysing" : "Analyse transaction"}</button>
                <button className="btn" onClick={clear}>Clear</button>
              </div>
            </div>
          </section>
        </FlowStep>

        {/* ---------- 2. the checks, as the server runs them ---------- */}
        <FlowStep n={2} state={step(2)} title="How Last Mile Guard checks it" sub="Three checks run on the server, in this order. Each one adds points with a written reason." id="flow-2"
          waiting="Runs when you press Analyse transaction.">
          {error && <p className="problem-box" role="alert">{error}</p>}
          <div className="engine-cards">
            <EngineCard name="FraudShield" what="Payment behaviour" icon="activity" event={stages.behaviour}
              score={shown ? shown.audit.behaviour_score : null}
              lines={items.filter((item) => item.kind === "payment" && item.points > 0)}
              extra={shown ? `${money(amount, used.currency)} now · usually about ${money(usual, used.currency)} (${amount / usual >= 10 ? Math.round(amount / usual) : (amount / usual).toFixed(1)}×)` : null} />
            <EngineCard name="MuleNet" what="Receiving account" icon="network" event={stages.network}
              score={shown && shown.audit.network_available ? shown.audit.network_score ?? 0 : null}
              lines={items.filter((item) => item.kind === "network" && item.points > 0)}
              empty={shown && !shown.audit.network_available ? "No account-network data was supplied for this payment." : null} />
            <EngineCard name="ScamStop · Gemini" what="The customer's words" icon="brain" event={stages.message}
              score={shown?.audit.message_reading ? shown.audit.message_reading.scam_likelihood : null}
              lines={items.filter((item) => item.kind === "message")}
              extra={shown?.audit.message_reading?.explanation ?? null}
              tags={(shown?.audit.message_reading?.tactics ?? []).filter((t) => t !== "none").map((t) => t.replaceAll("_", " "))}
              empty={shown && !shown.audit.message_reading ? (used.note.trim() ? "The reader was unavailable, so the payment checks decided." : "No note was written, so there was nothing to read.") : null} />
          </div>

          <AgentInvestigation investigation={result?.investigation} running={stages.investigate} />

          {shown?.audit.message_reading && (
            <PlaybookMatch reading={shown.audit.message_reading} facts={{ onCall: used.onCall, newPayee: used.newPayee, remote: used.remote }} />
          )}

          {network && shown && (
            <section className="panel net-panel">
              <div className="net-panel-head">
                <div>
                  <span className="kicker">Receiving account · MuleNet</span>
                  <h3>Where the money would go</h3>
                </div>
                <span className={`act ${(shown.audit.network_score ?? 0) >= 70 ? "hold" : (shown.audit.network_score ?? 0) >= 40 ? "warn" : "allow"}`}>Network score {shown.audit.network_score ?? 0}/100</span>
              </div>
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
                  <p className="muted small" style={{ margin: 0 }}>{NETWORK_LABEL[submitted!.network]}. Synthetic test data, not real bank records.</p>
                </div>
              </div>
            </section>
          )}
        </FlowStep>

        {/* ---------- 3. the decision, and what the customer is told ---------- */}
        <FlowStep n={3} state={step(3)} title="Decision" sub="The rules add the points up: warn from 40, hold from 70. Gemini explains; it never decides." id="flow-3"
          waiting="Appears once the three checks finish.">
          {shown && status && (
            <div className="decision-split">
              <section className="panel">
                <div className="verdict-box">
                  <ScoreRing score={shown.score} tone={toneForAction(status)} label="RISK" />
                  <div className="verdict-card">
                    <span className="kicker" style={{ color: "var(--muted)" }}>Recommendation</span>
                    <div className={`big ${status}`}><Icon name={status as IconName} size={22} /> {ACTION_LABEL[status].toUpperCase()}</div>
                    <span className="muted small">{ACTION_NOTE[status]}</span>
                  </div>
                </div>
                {shown.audit.message_reading && (
                  <p className="ai-note" style={{ marginTop: 14 }}><Icon name="brain" size={16} /> <span><strong>AI explanation:</strong> {shown.audit.message_reading.explanation}</span></p>
                )}
                {result?.notice && <p className="ai-note warn"><Icon name="warn" size={16} /> {result.notice}</p>}
                <p className="sub-kicker">How the score adds up</p>
                <ScoreSum items={items} score={shown.score} warn={shown.audit.thresholds.warn} hold={shown.audit.thresholds.hold} />
              </section>

              <section className="panel side-panel">
                <span className="kicker">{asked ? "Asked before deciding" : "Sent to the customer"}</span>
                {asked && following && (
                  <div className="ask-box">
                    <p><strong>The customer was asked on their phone:</strong></p>
                    <p>{asked.questions?.join(" ")}</p>
                    <p className="muted small">{live?.answer !== null && live?.answer !== undefined ? `They answered: "${live.answer || "(skipped)"}". Checking again.` : "Waiting for their answer."}</p>
                  </div>
                )}
                {asked && !following && (
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
                {result?.action === "hold" && (
                  <>
                    {following ? (
                      <p className="ai-note"><Icon name="device" size={16} /> <span><strong>Shown on the customer's phone:</strong> "We've paused your payment to protect you", with reference {caseReference(result.execution?.request_id)} and a Call fraud team button.</span></p>
                    ) : (
                      <HoldNotification amount={amount} currency={used.currency} reference={caseReference(result.execution?.request_id)}
                        onCall={canCall && !callDone ? startCall : undefined} />
                    )}
                    {result.customer_warning && <p className="ai-note"><Icon name="shield" size={16} /> {result.customer_warning}</p>}
                  </>
                )}
                {result?.action === "warn" && (
                  <p className="ai-note warn"><Icon name="shield" size={16} /> <span><strong>Warning shown before sending:</strong> {result.customer_warning ?? "Please check this payment before you send it."}</span></p>
                )}
                {result?.action === "allow" && (
                  <p className="ai-note"><Icon name="allow" size={16} /> Payment sent. Nothing for the customer to do, and no review needed.</p>
                )}
              </section>
            </div>
          )}
        </FlowStep>

        {/* ---------- 4. the customer's call ---------- */}
        <FlowStep n={4} state={step(4)} title="The customer's call with the AI agent" id="flow-4"
          sub="The customer taps Call fraud team. The AI agent asks two questions; Gemini and Voice AI read the answers and recommend."
          waiting={result?.action === "allow" ? "Not needed: the payment was allowed." : "Starts when the customer taps Call fraud team."}>
          {result && result.action !== "allow" && (
            callDone || result.action === "warn" ? (
              <CallResult verification={currentCase?.verification} onCall={startCall} onOpenCase={() => openCase?.(caseId!)} why={whyStillHeld(currentCase?.verification?.outcome, heldBy(items))} />
            ) : (
              following && live?.call ? (
                <section className="panel">
                  <p className="kicker" style={{ marginTop: 0 }}><span className="spin" /> The call is happening on the customer's phone</p>
                  <ol className="call-log">
                    {live.call.questions.map((question, index) => (
                      <li key={question}><span className="muted small">AI agent: {question}</span><strong>{live.call!.answers[index] ? `Customer: ${live.call!.answers[index]}` : "Listening…"}</strong></li>
                    ))}
                  </ol>
                </section>
              ) : (
                <div className="flow-wait live"><span className="spin" /> {following ? "Waiting for the customer to tap Call fraud team on their phone." : "Waiting for the customer to call. They use the Call fraud team button on the notice above."}</div>
              )
            )
          )}
        </FlowStep>

        {/* ---------- 5. the analyst ---------- */}
        <FlowStep n={5} state={step(5)} title="Analyst decides" sub="Only a person can release a held payment. The decision is made on the Cases page."
          waiting={result?.action === "allow" ? "Not needed: the payment was allowed." : "After the call, the case goes to the analyst."}>
          {result && result.action !== "allow" && caseId && (
            <section className="panel analyst-panel">
              <div className="analyst-head">
                <div>
                  <span className={`act ${currentCase?.status === "approved" ? "allow" : currentCase && currentCase.status !== "open" ? "hold" : "warn"}`}>
                    {currentCase?.status && currentCase.status !== "open" ? STATUS_TEXT[currentCase.status] : "Awaiting analyst decision"}
                  </span>
                  <p className="muted small" style={{ margin: "8px 0 0" }}>Case {caseId}{serverId ? ` · reference ${caseReference(serverId)}` : ""}</p>
                </div>
                {openCase && !callDone && <button className="btn primary small" onClick={() => openCase(caseId)}><Icon name="flag" size={14} /> Open the case (analyst)</button>}
              </div>
              <p className="sub-kicker">Audit trail</p>
              <ol className="stream-log">
                {(currentCase?.trail ?? []).map((entry, index) => <li key={`${entry.when}-${index}`}><span className="mono">{entry.when}</span> {entry.text}</li>)}
              </ol>
            </section>
          )}
        </FlowStep>
      </ol>

      {shown && (
        <details className="tech-details">
          <summary>Technical details: every signal, the transaction context and the full audit record</summary>
          <div className="tech-grid">
            <div>
              <p className="sub-kicker" style={{ marginTop: 0 }}>Every signal</p>
              <ul className="reason-list compact">
                {items.map((item) => (
                  <li key={item.label} className={item.points < 0 ? "calm" : ""}>
                    <Icon name={item.points < 0 ? "allow" : "warn"} size={16} />
                    <span>{item.label}<br /><small className="muted">{item.why}</small></span>
                    <span className="pts">{item.points > 0 ? `+${item.points}` : item.points}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="sub-kicker" style={{ marginTop: 0 }}>Full audit record</p>
              <pre className="audit-json">{JSON.stringify(shown.audit, null, 2)}</pre>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

type FlowState = "waiting" | "active" | "done" | "skipped";

function FlowStep({ n, state, title, sub, id, waiting, children }: {
  n: number; state: FlowState; title: string; sub: string; id?: string; waiting?: string; children?: ReactNode;
}) {
  return (
    <li className={`flow-step ${state}`} id={id} aria-current={state === "active" ? "step" : undefined}>
      <div className="flow-rail" aria-hidden="true">
        <span className="flow-no">{state === "done" ? <Icon name="check" size={16} /> : n}</span>
        <span className="flow-line" />
      </div>
      <div className="flow-body">
        <div className="flow-head">
          <div>
            <span className="kicker">Step {String(n).padStart(2, "0")}</span>
            <h2>{title}</h2>
            <p className="muted small">{sub}</p>
          </div>
          <span className={`flow-state ${state}`}>{state === "done" ? "Done" : state === "active" ? "In progress" : state === "skipped" ? "Not needed" : "Waiting"}</span>
        </div>
        {state === "waiting" || state === "skipped" ? <div className="flow-wait">{waiting}</div> : children}
      </div>
    </li>
  );
}

// The decision in one line: each check's points, the total, and the threshold it crossed.
function ScoreSum({ items, score, warn, hold }: { items: { kind: string; points: number }[]; score: number; warn: number; hold: number }) {
  const parts = [
    { name: "FraudShield", kind: "payment" }, { name: "MuleNet", kind: "network" }, { name: "ScamStop", kind: "message" }, { name: "Checked by the customer", kind: "credit" },
  ].map((part) => ({ ...part, points: items.filter((item) => item.kind === part.kind).reduce((sum, item) => sum + item.points, 0) }))
    .filter((part) => part.points !== 0);
  const total = parts.reduce((sum, part) => sum + part.points, 0);
  const band = score >= hold ? `at or above ${hold}: hold` : score >= warn ? `${warn} to ${hold - 1}: warn` : `below ${warn}: allow`;
  return (
    <div className="score-sum">
      {parts.length === 0 && <span className="score-part">No risk points</span>}
      {parts.map((part, index) => (
        <span key={part.kind} className="score-part">
          {index > 0 && <em>{part.points < 0 ? "−" : "+"}</em>}
          <strong className="mono">{Math.abs(part.points)}</strong> {part.name}
        </span>
      ))}
      <span className="score-part total">= <strong className="mono">{total}</strong>{total > 100 ? ", capped at 100" : ""}</span>
      <span className={`score-band ${score >= hold ? "hold" : score >= warn ? "warn" : "allow"}`}>Risk {score}, {band}</span>
    </div>
  );
}

const STAGE_TEXT: Record<AssessmentEvent["status"], string> = { running: "Checking", complete: "Done", skipped: "Skipped", failed: "Unavailable" };

function EngineCard({ name, what, icon, event, score, lines, extra, tags, empty }: {
  name: string; what: string; icon: IconName; event?: AssessmentEvent; score: number | null;
  lines: { label: string; points: number; why: string }[]; extra?: string | null; tags?: string[]; empty?: string | null;
}) {
  const tone = score === null ? "" : score >= 70 ? "red" : score >= 40 ? "amber" : "green";
  const state = event?.status ?? "waiting";
  const mode = event?.mode === "live" ? "Gemini, live" : event?.mode === "cached" ? "Gemini, saved reading" : null;
  return (
    <article className={`engine-card ${state}`}>
      <header>
        <span className="engine-card-icon"><Icon name={icon} size={18} /></span>
        <span className="engine-card-name"><strong>{name}</strong><small>{what}</small></span>
        <span className={`engine-card-state ${state}`}>
          {state === "running" && <span className="spin" />}
          {state === "waiting" ? "Waiting" : STAGE_TEXT[state as AssessmentEvent["status"]]}
          {event && event.status !== "running" ? ` · ${(event.elapsed_ms / 1000).toFixed(1)} s` : ""}
        </span>
      </header>
      {score !== null ? (
        <div className="engine-card-score">
          <strong className="mono">{score}<small>/100</small></strong>
          <div className="dist-track"><div className={`dist-fill tone-${tone}`} style={{ width: `${score}%` }} /></div>
        </div>
      ) : (
        <p className="muted small engine-card-detail">{empty ?? event?.detail ?? "Waiting for the previous check."}</p>
      )}
      {mode && <span className="tag">{mode}</span>}
      {lines.length > 0 && (
        <ul className="engine-card-lines">
          {lines.slice(0, 4).map((line) => <li key={line.label} title={line.why}><span>{line.label.replace(/^MuleNet: /, "")}</span><em>{line.points > 0 ? `+${line.points}` : line.points}</em></li>)}
        </ul>
      )}
      {tags && tags.length > 0 && <div className="tag-row">{tags.map((t) => <span key={t} className="act warn">{t}</span>)}</div>}
      {extra && <p className="muted small engine-card-extra">{extra}</p>}
    </article>
  );
}

const STATUS_TEXT: Record<CaseStatus, string> = {
  open: "Awaiting analyst decision",
  approved: "Approved by analyst",
  held: "Kept on hold by analyst",
  escalated: "Escalated for investigation",
};
