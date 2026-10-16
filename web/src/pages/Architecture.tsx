import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";

const CHECKS: { name: string; role: string; detail: string; icon: IconName; tone: string }[] = [
  { name: "TxnGuard", role: "Payment rules", detail: "Amount, device, location, payee and recent payment history.", icon: "chart", tone: "blue" },
  { name: "ScamStop", role: "Gemini + rules", detail: "Pressure, secrecy and impersonation in the customer's story.", icon: "brain", tone: "violet" },
  { name: "MuleNet", role: "Network rules", detail: "Suspicious account links and rapid onward transfers.", icon: "server", tone: "teal" },
];

const SAFEGUARDS: { title: string; text: string; icon: IconName }[] = [
  { title: "Treat messages as evidence", text: "Customer text is separated from model instructions. Hidden orders are flagged; model output must follow a defined schema.", icon: "shield" },
  { title: "Make failures visible", text: "Request timeouts and rate limits bound the demo. If message analysis fails, the result identifies the fallback and available evidence.", icon: "warn" },
  { title: "Keep the decision explainable", text: "Rules combine the signals into a recommendation. The response includes ranked reasons, execution mode and a request ID.", icon: "list" },
];

export function Architecture() {
  const [deployment, setDeployment] = useState<"local" | "cloud">("local");
  const cloud = deployment === "cloud";

  return (
    <div className="architecture">
      <header className="architecture-heading">
        <div>
          <p className="eyebrow">Inside PaySentinel AI</p>
          <h1>Three checks.<br /><span>One explainable decision.</span></h1>
          <p className="architecture-intro">Follow the evidence from a payment request to a recommendation an analyst can inspect.</p>
        </div>
        <div className="architecture-view">
          <span className="eyebrow" id="deployment-view-label">Explore the deployment</span>
          <div className="architecture-switch" role="group" aria-labelledby="deployment-view-label">
            <button type="button" aria-pressed={!cloud} onClick={() => setDeployment("local")}><Icon name="auto" size={17} /> Local setup</button>
            <button type="button" aria-pressed={cloud} onClick={() => setDeployment("cloud")}><Icon name="cloud" size={17} /> Cloud Run</button>
          </div>
          <p>Reference views, not live deployment status.</p>
        </div>
      </header>

      <section className="architecture-map" aria-labelledby="architecture-flow-title">
        <div className="architecture-map-heading">
          <h2 id="architecture-flow-title">The assessment flow</h2>
          <span><span className="architecture-dot" /> Synthetic inputs · Real backend checks</span>
        </div>

        <div className="architecture-flow">
          <article className="architecture-node architecture-input">
            <div className="architecture-node-top"><span className="architecture-node-icon"><Icon name="list" size={23} /></span><span className="architecture-step">01 / INPUT</span></div>
            <h3>A payment starts</h3>
            <p>The browser sends the evidence available for this scenario.</p>
            <ul className="architecture-inputs">
              <li><Icon name="allow" size={16} /><span>Payment & recent history</span></li>
              <li><Icon name="allow" size={16} /><span>Customer's message</span></li>
              <li><Icon name="allow" size={16} /><span>Optional account graph</span></li>
            </ul>
            <div className="architecture-endpoint"><span className="mono">POST</span><code>/api/assess</code></div>
            <p className="architecture-caption">One request. No bank connection.</p>
          </article>

          <div className="architecture-connector" aria-hidden="true"><Icon name="arrow" size={22} /></div>

          <article className="architecture-engine">
            <div className="architecture-engine-header">
              <div><span className="architecture-step">02 / INVESTIGATION</span><h3>Evidence & risk engine</h3></div>
              <span className="architecture-runtime"><Icon name={cloud ? "cloud" : "server"} size={15} />{cloud ? "Cloud Run" : "FastAPI · local"}</span>
            </div>
            <p className="architecture-engine-intro">Three checks in one backend service.</p>
            <ol className="architecture-checks">
              {CHECKS.map((check) => <li key={check.name}>
                <span className={`architecture-check-icon ${check.tone}`}><Icon name={check.icon} size={22} /></span>
                <div><div className="architecture-check-heading"><h4>{check.name}</h4><span>{check.role}</span></div><p>{check.detail}</p></div>
              </li>)}
            </ol>
            <div className="architecture-model">
              <div className="architecture-model-title"><Icon name="brain" size={18} /><strong>{cloud ? "Gemini via Vertex AI" : "Gemini API"}</strong><span>ScamStop's model service</span></div>
              <p>Reads the note and reply; drafts follow-up questions when evidence is thin.</p>
              <span className="architecture-model-auth"><Icon name="lock" size={13} />{cloud ? "Runtime service identity" : "Server-side API key"}</span>
            </div>
            <div className="architecture-decision">
              <div><Icon name="shield" size={19} /><strong>Rules combine the evidence</strong></div>
              <div className="architecture-outcomes"><span>Allow</span><span>Warn / ask</span><span>Recommend hold</span></div>
            </div>
          </article>

          <div className="architecture-connector" aria-hidden="true"><Icon name="arrow" size={22} /></div>

          <article className="architecture-node architecture-review">
            <div className="architecture-node-top"><span className="architecture-node-icon"><Icon name="user" size={23} /></span><span className="architecture-step">03 / REVIEW</span></div>
            <h3>Evidence for a person</h3>
            <p>The result returns to the console and analyst queue.</p>
            <ul className="architecture-inputs">
              <li><Icon name="list" size={16} /><span>Ranked reasons</span></li>
              <li><Icon name="chart" size={16} /><span>Risk score & execution time</span></li>
              <li><Icon name="flag" size={16} /><span>Simulated review actions</span></li>
            </ul>
            <div className="architecture-review-note"><strong>Browser demo</strong><span>Cases live in browser memory. Refreshing resets the queue; no payment is held or released.</span></div>
          </article>
        </div>

        <div className="architecture-map-footer"><Icon name="flask" size={17} /><p>The prototype receives synthetic history and account links with each request. A banking integration would supply trusted data and enforce payment controls.</p></div>
      </section>

      <section className="architecture-deployment" aria-labelledby="architecture-deployment-title">
        <div className="architecture-deployment-copy">
          <p className="eyebrow">{cloud ? "Google Cloud configuration" : "Local configuration"}</p>
          <h2 id="architecture-deployment-title">{cloud ? "From source to service." : "One app, running locally."}</h2>
          <p>{cloud ? "Cloud Build creates the container. Cloud Run hosts the API and web app. Model calls use the configured runtime identity." : "Vite builds the interface. FastAPI serves those files and the assessment API. The backend reads the Gemini key from its local configuration."}</p>
        </div>
        <div className="architecture-deploy-steps" aria-label={cloud ? "Source to Cloud Build to Cloud Run" : "Vite build to FastAPI to browser"}>
          <div><Icon name={cloud ? "list" : "auto"} size={23} /><strong>{cloud ? "Project source" : "Vite build"}</strong><span>{cloud ? "Application code" : "React interface"}</span></div>
          <Icon name="arrow" size={20} />
          <div><Icon name="server" size={23} /><strong>{cloud ? "Cloud Build" : "FastAPI"}</strong><span>{cloud ? "Builds the container" : "Serves UI + API"}</span></div>
          <Icon name="arrow" size={20} />
          <div><Icon name={cloud ? "cloud" : "user"} size={23} /><strong>{cloud ? "Cloud Run" : "Your browser"}</strong><span>{cloud ? "Runs the service" : "Explores the demo"}</span></div>
        </div>
      </section>

      <section className="architecture-safeguards" aria-labelledby="architecture-safeguards-title">
        <div className="architecture-section-heading"><h2 id="architecture-safeguards-title">Guardrails around the intelligence.</h2><span>Built into the prototype</span></div>
        <div className="architecture-safeguard-grid">
          {SAFEGUARDS.map((item) => <article key={item.title}><span className="architecture-safeguard-icon"><Icon name={item.icon} size={21} /></span><h3>{item.title}</h3><p>{item.text}</p></article>)}
        </div>
      </section>
    </div>
  );
}
