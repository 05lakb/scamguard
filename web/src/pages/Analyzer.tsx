import { useState } from "react";
import { assessPayment, type AssessRequest, type ServerDecision } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { EmptyState, PageHead, PanelHead, ScoreRing, Toggle, toneForAction } from "../components/ui";
import type { Payment } from "../core/types";
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
  onCase: (finished: FinishedCase, context: CaseContext) => void;
  review: () => void;
}

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
}

const now = () => new Date().toTimeString().slice(0, 5);

const BASE: Form = {
  amount: "1500", currency: "INR", segment: "young_professional", typical: "2000", payee: "Ravi Kirana Store",
  payeeType: "business", accountAge: "900", device: "dev-4821 · Pixel 8", location: "Mumbai", channel: "mobile",
  time: now(), recent: "0", newPayee: false, newDevice: false, locationChanged: false, onCall: false, remote: false, note: "",
};

const PRESETS: { label: string; icon: IconName; form: Partial<Form> }[] = [
  { label: "Everyday payment", icon: "allow", form: {} },
  {
    label: "Bank-impersonation call", icon: "mic",
    form: { amount: "98500", payee: "Secure Holding A/c 7731", payeeType: "individual", accountAge: "3", newPayee: true, onCall: true, recent: "1",
      note: "The bank's fraud team called and said my account is compromised. They told me to move my savings to a safe account today and not to tell anyone." },
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
  return {
    payment,
    customer: { segment: form.segment, typical_amount: Math.max(1, Math.round(Number(form.typical) || 1)) },
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
  };
}

export function Analyzer({ scenarios, onCase, review }: Props) {
  const [form, setForm] = useState<Form>(BASE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState<ServerDecision | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ServerDecision | null>(null);
  const [submitted, setSubmitted] = useState<Form | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((old) => ({ ...old, [key]: value }));
  const amountOk = Number(form.amount) > 0 && Number(form.amount) <= 10_000_000;

  function clear() {
    setForm({ ...BASE, time: now() });
    setResult(null);
    setAsked(null);
    setAnswer("");
    setError("");
  }

  function finish(decision: ServerDecision, used: Form, questions?: string[], reply?: string) {
    setResult(decision);
    setAsked(null);
    const request = toRequest(used);
    onCase(
      { scenario: scenarioOf(used, request), message: used.note.trim() || null, questions, answer: reply, decision },
      { device: used.device.trim(), location: used.location.trim(), channel: used.channel },
    );
  }

  async function analyse() {
    if (!amountOk) return;
    const used = { ...form };
    setBusy(true);
    setError("");
    setResult(null);
    setAsked(null);
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
      <PageHead kicker="Real-time fraud engine" title="Transaction Risk" accent="Analyzer" text="Enter the transaction context. PaySentinel evaluates behaviour, device, beneficiary, location, timing and the customer's own words before the payment completes.">
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
          <p className="muted small" style={{ marginTop: -8 }}>Provide the signals available at payment time.</p>

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
              <span className="f-help">Shown on the risk profile.</span>
            </div>
            <div>
              <label className="f-label" htmlFor="loc"><Icon name="map" size={13} /> Transaction location</label>
              <input id="loc" className="f-input" maxLength={60} value={form.location} onChange={(e) => set("location", e.target.value)} />
              <span className="f-help">Used for geographic intelligence.</span>
            </div>
            <div>
              <label className="f-label" htmlFor="age">Beneficiary account age (days)</label>
              <input id="age" className="f-input" inputMode="numeric" value={form.accountAge} onChange={(e) => set("accountAge", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label className="f-label" htmlFor="time"><Icon name="moon" size={13} /> Payment time</label>
              <input id="time" type="time" className="f-input" value={form.time} onChange={(e) => set("time", e.target.value)} />
              <span className="f-help">01:00–05:59 counts as a night payment.</span>
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
              <label className="f-label" htmlFor="note"><Icon name="brain" size={13} /> What the customer says this payment is for (optional)</label>
              <textarea id="note" className="f-area" style={{ minHeight: 90, fontFamily: "var(--font)" }} maxLength={2000} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. Paying my landlord the first month's rent. I met him and signed the agreement." />
              <span className="f-help">Read by Gemini when configured. The note is data, never an instruction.</span>
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

              <div className="subscores">
                <div><span className="muted">Behaviour engine</span><strong className="mono">{shown.audit.behaviour_score}/100</strong></div>
                <div><span className="muted">Message reading</span><strong className="mono">{shown.audit.message_reading ? `${shown.audit.message_points > 0 ? "+" : ""}${shown.audit.message_points}` : "Not requested"}</strong></div>
                <div><span className="muted">Decision thresholds</span><strong className="mono">warn {shown.audit.thresholds.warn} · hold {shown.audit.thresholds.hold}</strong></div>
              </div>

              {result?.notice && <p className="ai-note warn"><Icon name="warn" size={16} /> {result.notice}</p>}
              {result?.customer_warning && <p className="ai-note"><Icon name="shield" size={16} /> {result.customer_warning}</p>}
              {!result?.customer_warning && result?.action === "allow" && <p className="ai-note"><Icon name="allow" size={16} /> PaySentinel AI detected a low-risk transaction pattern. No major fraud indicators were identified.</p>}

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
                  {result.action !== "allow" && <button className="btn primary" onClick={review}><Icon name="flag" size={16} /> Open in analyst center</button>}
                  <details style={{ flex: 1 }}><summary className="muted small" style={{ cursor: "pointer", paddingTop: 10 }}>Full audit record</summary><pre style={{ maxHeight: 260, overflow: "auto", fontSize: "0.72rem" }}>{JSON.stringify(result.audit, null, 2)}</pre></details>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
