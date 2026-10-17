import { useState } from "react";
import type { Health } from "../api";
import { Icon } from "../components/Icon";
import { HOST_LABEL, hostKind } from "../lib/hosting";

type Mode = "live" | "delivery";

const ENDPOINTS = [
  { route: "POST /api/assess", label: "Score a payment", icon: "chart" as const },
  { route: "POST /api/assess/stream", label: "Stream check stages", icon: "list" as const },
  { route: "POST /api/conversation", label: "Read a call transcript", icon: "brain" as const },
  { route: "POST /api/cases/{id}/verification", label: "Customer's call: questions, answers, re-check", icon: "mic" as const },
  { route: "GET /api/cases · POST /api/cases/{id}/decision", label: "Load cases · save analyst action", icon: "user" as const },
];

const WORKSPACES = [
  { name: "Dashboard", detail: "Engine health & fraud overview" },
  { name: "Transactions", detail: "Payment analysis & case file" },
  { name: "Voice AI", detail: "The customer's call · transcript analysis" },
  { name: "Cases", detail: "Analyst review & decision" },
  { name: "Risk Profile · Analytics", detail: "Session-scoped investigation views" },
  { name: "Red Team", detail: "Generated scams vs the guard · own scenarios" },
];

export function Architecture({ health }: { health?: Health | null }) {
  const [mode, setMode] = useState<Mode>("live");
  const host = hostKind(location.hostname);
  const runtime = HOST_LABEL[host];
  const boundary = host === "local" ? "Local server · same code as Cloud Run" : `Google Cloud · ${runtime}`;
  const store = health?.storage === "firestore" ? "Firestore · confirmed by /api/health"
    : health?.storage === "memory" ? "In-memory case store · confirmed by /api/health"
      : health?.storage === "off" ? "Case persistence off · confirmed by /api/health"
        : "Case-store mode unavailable";
  const model = health?.ai_configured === true ? "Gemini configured · confirmed by /api/health"
    : health?.ai_configured === false ? "Gemini not configured · rules remain available"
      : "Gemini configuration unavailable";

  return <div className="arch-page">
    <header className="arch-page-head">
      <div><p className="kicker">Inside Last Mile Guard</p><h1>One service. A traceable path<br /><span>from payment to analyst.</span></h1>
        <p className="page-sub">This diagram follows the app that is running now. Each connection names the real service or API boundary.</p></div>
      <div className="arch-mode"><span className="kicker">View</span><div role="group" aria-label="Architecture view"><button aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live request path</button><button aria-pressed={mode === "delivery"} onClick={() => setMode("delivery")}>How it is delivered</button></div><p>{mode === "live" ? "Runtime facts update from this app's health check." : "Build path from the checked-in deployment configuration."}</p></div>
    </header>

    {mode === "live" ? <>
      <section className="arch-live-status" aria-label="Live deployment status">
        <span className={`arch-status-light ${health?.ok ? "online" : ""}`} />
        <strong>{runtime}</strong><span>GET /api/health</span>
        <span className="arch-status-divider" />
        <span><b>API</b> {health?.ok ? "Online" : health === null ? "Unreachable" : "Checking"}</span>
        <span><b>AI</b> {health?.ai_configured === true ? "Configured" : health?.ai_configured === false ? "Fallback available" : "Unknown"}</span>
        <span><b>Cases</b> {health?.storage === "firestore" ? "Firestore" : health?.storage ?? "Unknown"}</span>
      </section>

      <section className="arch-map" aria-labelledby="arch-live-heading">
        <div className="arch-map-title"><div><p className="kicker">01 · Live request path</p><h2 id="arch-live-heading">What happens when someone checks a payment</h2></div><span className="arch-synthetic"><Icon name="flask" size={15} /> Synthetic demo · no bank rail</span></div>

        <div className="arch-flow">
          <article className="arch-card arch-actors">
            <span className="arch-index">CLIENT</span><span className="arch-icon"><Icon name="user" size={22} /></span>
            <h3>Browser workspace</h3><p>React interface served by the same FastAPI service.</p>
            <ul><li>Use it: Dashboard · Transactions · Voice AI · Cases · Risk Profile · Analytics</li><li>Prove it: Red Team · Evidence · How it's built</li></ul>
            <div className="arch-mini-note"><Icon name="lock" size={14} /> Display name + per-browser session key; no bank login</div>
          </article>

          <div className="arch-link" aria-label="HTTPS request and response"><span>HTTPS · JSON / event stream</span><i /><b>›</b></div>

          <section className="arch-cloud-boundary" aria-label="Last Mile Guard Cloud Run service">
            <div className="arch-cloud-heading"><span><Icon name="cloud" size={18} /> {boundary}</span><small>Single container · FastAPI + built React app</small></div>
            <div className="arch-request-grid">
              <article className="arch-api">
                <span className="arch-index">02 · API BOUNDARY</span><h3>FastAPI service</h3>
                <p>Validates bounded inputs, applies per-visitor limits, and runs the assessment.</p>
                <div className="arch-endpoints">{ENDPOINTS.map(item => <div key={item.route}><Icon name={item.icon} size={16} /><span><code>{item.route}</code><small>{item.label}</small></span></div>)}</div>
              </article>
              <div className="arch-down-link"><i /><span>Validated payment +<br />optional graph / message</span><b>↓</b></div>
              <section className="arch-engine" aria-label="Explainable assessment pipeline">
                <div className="arch-engine-head"><span>03 · ASSESSMENT PIPELINE</span><small>Three independent checks · combined by the decision rules</small></div>
                <div className="arch-stage-row">
                  <article className="arch-stage"><span className="arch-stage-number">01</span><Icon name="chart" size={20} /><h4>FraudShield</h4><p>Rules: amount, timing, device, beneficiary & history</p><b>Deterministic</b></article>
                  <article className="arch-stage"><span className="arch-stage-number">02</span><Icon name="brain" size={20} /><h4>ScamStop</h4><p>Gemini reads note / answer; rules provide a fallback</p><b>AI extraction</b></article>
                  <article className="arch-stage"><span className="arch-stage-number">03</span><Icon name="server" size={20} /><h4>MuleNet</h4><p>Rules check an optional synthetic transfer graph</p><b>Deterministic</b></article>
                </div>
                <div className="arch-decision"><div><Icon name="shield" size={19} /><span><strong>Decision rules</strong><small>Combine evidence · rank reasons · issue request ID</small></span></div><div className="arch-outcomes"><span>Allow</span><span>Warn / ask once</span><span>Recommend hold</span></div></div>
              </section>
            </div>
            <div className="arch-outgoing"><span><Icon name="user" size={16} /> Result + streamed stages return to the browser</span><i /><b>›</b><span>Human analyst reviews warnings and holds</span></div>
          </section>
        </div>

        <div className="arch-integrations">
          <div className="arch-integration-line"><span>Server service identity</span><i /><b>›</b></div>
          <article className="arch-service arch-gemini"><span className="arch-icon"><Icon name="brain" size={20} /></span><div><strong>Gemini · Vertex AI</strong><p>{model}. Structured reading and follow-up questions; never makes the payment decision.</p></div><span className="arch-connection-tag">Model call</span></article>
          <article className="arch-service arch-firestore"><span className="arch-icon"><Icon name="server" size={20} /></span><div><strong>Firestore</strong><p>{store}. Cases, decisions and notes; browser session ownership is stored as a hash, with a 24-hour expiry.</p></div><span className="arch-connection-tag">Case storage</span></article>
          <article className="arch-service arch-twilio"><span className="arch-icon"><Icon name="user" size={20} /></span><div><strong>Customer's call · in the app</strong><p>On a hold, the customer calls the fraud desk inside the app: the AI agent speaks two questions and the browser turns the answers into text. An optional Twilio phone path is built, signature-checked and switched off until configured.</p></div><span className="arch-connection-tag">Conditional</span></article>
        </div>

        <div className="arch-browser-voice"><Icon name="user" size={18} /><p><strong>Voice AI microphone path:</strong> the browser transcribes speech, then sends text to <code>/api/conversation</code>. Call audio is not uploaded or stored by this path.</p><span>Browser speech recognition → transcript → FastAPI</span></div>
        <div className="arch-map-note"><Icon name="flask" size={16} /><p>There is no connection to a bank ledger or payment network. Amount, behaviour and account links are synthetic inputs; “allow” and “hold” are recommendations only.</p></div>
      </section>

      <section className="arch-workspaces"><div className="arch-section-head"><div><p className="kicker">02 · Product surface</p><h2>The tabs are views into the same service</h2></div><span>Evidence and How it's built are documentation pages.</span></div><div className="arch-workspace-grid">{WORKSPACES.map((page, index) => <article key={page.name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{page.name}</strong><small>{page.detail}</small></article>)}</div></section>

      <section className="arch-trust-grid"><article><Icon name="lock" size={20} /><div><strong>Session-scoped cases</strong><p>Random browser key; its hash binds saved cases and decisions to that browser. Records expire after 24 hours.</p></div></article><article><Icon name="brain" size={20} /><div><strong>AI does not decide</strong><p>Gemini extracts structured signals. Testable code combines evidence and sets allow, warn and hold recommendations.</p></div></article><article><Icon name="warn" size={20} /><div><strong>Fallbacks stay visible</strong><p>If the model is unavailable or limited, payment rules still run and the result identifies the fallback mode.</p></div></article></section>
    </> : <>
      <section className="arch-map arch-delivery" aria-labelledby="arch-delivery-heading"><div className="arch-map-title"><div><p className="kicker">Build and deployment</p><h2 id="arch-delivery-heading">From source to the live URL</h2></div><span className="arch-synthetic"><Icon name="flask" size={15} /> Configuration reference, not a live deploy-status probe</span></div>
        <div className="arch-build-flow">{[
          ["01", "GitHub source", "Repository · develop branch"], ["02", "Cloud Build", "Cloud Run source build"], ["03", "Artifact Registry", "Built container image"], ["04", "Cloud Run", "FastAPI + React · public HTTPS URL"],
        ].map(([number, name, detail], i) => <div className="arch-build-wrap" key={number}><article><span>{number}</span><Icon name={i === 3 ? "cloud" : i === 1 ? "chart" : "server"} size={21} /><strong>{name}</strong><small>{detail}</small></article>{i < 3 && <div className="arch-build-arrow"><i /><b>›</b></div>}</div>)}</div>
        <div className="arch-hosting-alias"><Icon name="cloud" size={18} /><p><strong>Optional Firebase Hosting alias</strong><br /><code>firebase.json</code> rewrites its hosting traffic to Cloud Run. The public link reviewed here is the direct <code>.run.app</code> URL.</p><span>Configured alternate entry</span></div>
        <div className="arch-identity"><Icon name="lock" size={20} /><div><strong>Runtime identity & secrets</strong><p>The deploy script uses a Cloud Run service account for Vertex AI. It does not pass a Gemini key in the deployment command. Optional Twilio credentials are needed only for outbound phone verification.</p></div></div>
      </section>
      <section className="arch-deploy-config"><p className="kicker">Settings in infra/deploy.sh</p><h2>Capacity and cost limits</h2><div><span><strong>0–2</strong><small>instances</small></span><span><strong>20</strong><small>requests per instance</small></span><span><strong>512 MiB</strong><small>memory per instance</small></span><span><strong>300 s</strong><small>request timeout</small></span></div><p>These are the checked-in deployment defaults, not a live Cloud Run configuration readback.</p></section>
    </>}
  </div>;
}
