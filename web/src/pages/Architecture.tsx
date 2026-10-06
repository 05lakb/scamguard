import { Icon } from "../components/Icon";

function Box({ x, y, w, h, title, lines, tone }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone: "plain" | "accent" | "google" }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} className={`arch-box ${tone}`} />
      <text x={x + 14} y={y + 26} className="arch-title">{title}</text>
      {lines.map((line, index) => (
        <text key={line} x={x + 14} y={y + 48 + index * 18} className="arch-line">{line}</text>
      ))}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="arch-arrow" markerEnd="url(#head)" />
      {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="arch-label">{label}</text>}
    </g>
  );
}

const GUARDRAILS = [
  { icon: "lock" as const, title: "No keys anywhere", text: "The app runs as its own service identity with one permission: call Gemini. No password or key file exists." },
  { icon: "shield" as const, title: "Customer text is untrusted", text: "Notes are screened for hidden orders, fenced off from the instructions, and answered in a fixed shape." },
  { icon: "server" as const, title: "Serverless and capped", text: "Scales to zero when idle. At most 2 copies, a per-visitor rate limit, and a cost guard on Gemini calls." },
  { icon: "flag" as const, title: "A person decides", text: "The guard only recommends. Every hold needs a person, and every decision keeps an audit record." },
];

export function Architecture() {
  return (
    <div className="architecture">
      <section className="card">
        <h2 className="eyebrow">How the pieces fit</h2>
        <svg viewBox="0 0 900 330" role="img" aria-label="Customer's browser calls a Cloud Run service. The service runs the checks and calls Gemini on Vertex AI. The analyst queue shows each decision." className="arch">
          <defs>
            <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="arch-head" />
            </marker>
          </defs>
          <Box x={10} y={20} w={190} h={92} tone="plain" title="Customer's screen" lines={["Payment and a short note", "Answers one question"]} />
          <Box x={290} y={10} w={300} h={170} tone="accent" title="Cloud Run: Last Mile Guard" lines={["1  Behaviour and 15-day history", "2  Scam pattern guide", "3  Read the customer's words", "4  Decide: allow, warn or hold", "Rate limits, input checks, cost guard"]} />
          <Box x={690} y={20} w={200} h={92} tone="google" title="Vertex AI: Gemini" lines={["Reads the note and answer", "Writes the follow-up question"]} />
          <Box x={290} y={228} w={300} h={80} tone="plain" title="Analyst queue" lines={["Ranked reasons and audit trail", "A person confirms every hold"]} />
          <Box x={10} y={228} w={200} h={80} tone="plain" title="Cloud Build" lines={["Builds the container", "from the code on GitHub"]} />
          <Box x={690} y={228} w={200} h={80} tone="google" title="Service identity" lines={["One permission: call Gemini", "No keys"]} />
          <Arrow x1={200} y1={66} x2={290} y2={66} label="note" />
          <Arrow x1={590} y1={66} x2={690} y2={66} label="reads" />
          <Arrow x1={440} y1={180} x2={440} y2={228} label="decision" />
          <Arrow x1={210} y1={268} x2={290} y2={268} />
          <Arrow x1={690} y1={268} x2={590} y2={150} />
        </svg>
        <p className="muted small">
          In a production bank, payments would stream in through Pub/Sub and history would live in BigQuery. The prototype
          sends one payment at a time to keep it simple, and the 15-day history is supplied with each request.
        </p>
      </section>

      <section aria-labelledby="guard-title">
        <h2 id="guard-title" className="eyebrow">Security and responsible AI</h2>
        <ul className="guardrails">
          {GUARDRAILS.map((item) => (
            <li key={item.title} className="card">
              <div className="step-icon"><Icon name={item.icon} size={20} /></div>
              <h3>{item.title}</h3>
              <p className="muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="eyebrow">Where Google AI is used</h2>
        <ul className="reasons">
          <li>Gemini reads the customer's note and answer and returns a structured reading: how likely a scam is, who the payee is, whether the customer met them, and whether the story is rehearsed or contradicts itself.</li>
          <li>Gemini writes the neutral follow-up question when the evidence is thin.</li>
          <li>Both calls go through Vertex AI using the service's own identity. The checks around them are plain, testable rules, so every decision can be explained.</li>
        </ul>
      </section>
    </div>
  );
}
