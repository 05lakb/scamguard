import { EvidenceBars } from "../components/EvidenceBars";
import { Gauge } from "../components/Gauge";
import { Icon } from "../components/Icon";
import type { Contribution } from "../lib/contrib";

// A made-up sample, shown beside the headline so visitors see what the product produces.
const SAMPLE: Contribution[] = [
  { label: "The message reads like a romance scam", points: 49, why: "Pressure to pay, never met in person.", kind: "message" },
  { label: "New payee, account 18 days old", points: 15, why: "Money is going to someone new.", kind: "payment" },
  { label: "Told to keep this payment secret", points: 10, why: "Concealment from family.", kind: "message" },
];

interface Props {
  tryLive: () => void;
  playStory: () => void;
  goTo: (page: "evidence" | "architecture") => void;
}

const STEPS = [
  { icon: "list" as const, title: "A payment arrives", text: "The customer is about to send money, with a note if they wrote one." },
  { icon: "chart" as const, title: "Three investigations", text: "FraudShield checks the payment, ScamStop reads the customer's story, and MuleNet checks synthetic account links when supplied." },
  { icon: "ask" as const, title: "Ask when unsure", text: "A short, friendly question, then a second look at the answer. Never more than one round." },
  { icon: "shield" as const, title: "Decide and explain", text: "Allow, warn or hold, with ranked reasons and an audit trail. A person confirms every hold." },
];

const CHECKS = [
  { number: "01", name: "FraudShield", tag: "Transaction behaviour", text: "Spot unusual amounts, new payees, unfamiliar devices, and changes in payment history." },
  { number: "02", name: "ScamStop", tag: "Customer context", text: "Read the customer's explanation for signs of pressure or coaching, then ask when the evidence is thin." },
  { number: "03", name: "MuleNet", tag: "Account connections", text: "Look for flagged links and fast movement through receiving accounts in the synthetic demo graph." },
];

export function Overview({ tryLive, playStory, goTo }: Props) {
  return (
    <div className="overview">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Last Mile Guard · A second look before the money moves</p>
          <h1>Understand the risk <span>before money moves.</span></h1>
          <p className="hero-sub">
            One view of payment behaviour, the customer's story, and receiving-account connections.
            Get an explainable recommendation before a transfer settles.
          </p>
          <div className="row hero-actions">
            <button className="primary big" onClick={tryLive}>
              Explore a live case <Icon name="arrow" size={18} />
            </button>
            <button className="ghost big" onClick={playStory}>
              <Icon name="play" size={16} /> Watch the 90-second story
            </button>
          </div>
          <p className="hero-disclaimer">A synthetic prototype. A bank analyst would decide whether to hold a real payment.</p>
        </div>
        <div className="hero-card" aria-label="A sample risk decision using made-up data">
          <div className="hero-card-intro">
            <span className="eyebrow">One payment. Three perspectives.</span>
            <h2>Every signal has a reason.</h2>
            <p>Last Mile Guard brings the strongest evidence together so a reviewer can understand the recommendation quickly.</p>
          </div>
          <div className="hero-decision">
            <div className="card-head">
              <span className="eyebrow">Sample decision</span>
              <span className="small">Made-up case</span>
            </div>
            <div className="verdict-row">
              <Gauge score={74} action="hold" />
              <div>
                <div className="status hold"><Icon name="hold" size={18} /> Hold recommended</div>
                <p className="verdict-note">A specialist reviews the evidence before any real action.</p>
              </div>
            </div>
            <h3 className="mini">Why this payment stood out</h3>
            <EvidenceBars items={SAMPLE} />
          </div>
        </div>
      </section>

      <section className="checks-section" aria-labelledby="checks-title">
        <div className="section-heading">
          <p className="eyebrow">The solution</p>
          <h2 id="checks-title">Three investigations. One clear decision.</h2>
          <p className="muted">Each check contributes evidence to the same explainable risk assessment.</p>
        </div>
        <div className="checks-grid">
          {CHECKS.map((check) => (
            <article className="check-card" key={check.name}>
              <div className="check-top"><span className="mono">{check.number}</span><span aria-hidden="true">↗</span></div>
              <p className="eyebrow">{check.tag}</p>
              <h3>{check.name}</h3>
              <p>{check.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="why">
        <h2 id="why" className="eyebrow">Why it matters</h2>
        <div className="stats">
          <div className="stat">
            <div className="stat-number mono">$442B</div>
            <p>lost to scams by people in 42 countries in a single year.</p>
            <span className="source">Global State of Scams 2025, GASA and Feedzai</span>
          </div>
          <div className="stat">
            <div className="stat-number mono">23%</div>
            <p>of adults lost money to a scam in the past year. Another 34% were targeted and did not lose money.</p>
            <span className="source">Global State of Scams 2025, GASA and Feedzai</span>
          </div>
          <div className="stat">
            <div className="stat-number mono">+40%</div>
            <p>growth in UK investment-scam losses in 2025, now £221M, the largest authorised-payment fraud type.</p>
            <span className="source">UK Finance Annual Fraud Report 2026</span>
          </div>
        </div>
        <p className="muted wide-text">
          In these scams the customer approves the payment, so ordinary fraud checks see a valid payment from the right
          person. Regulators are moving the cost to banks: UK reimbursement rules, the EU's agreed payment-services
          regulation, and Australia's Scams Prevention Framework with penalties up to A$50 million.
        </p>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="eyebrow">How it works</h2>
        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <div className="step-icon"><Icon name={step.icon} size={20} /></div>
              <span className="step-no mono">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="built" className="built">
        <div>
          <h2 id="built" className="eyebrow">Built on Google Cloud</h2>
          <ul className="badges">
            <li>Gemini on Vertex AI</li>
            <li>Cloud Run, serverless</li>
            <li>Cloud Build</li>
            <li>Service identity, no keys</li>
          </ul>
        </div>
        <div className="row">
          <button className="ghost" onClick={() => goTo("architecture")}>See the architecture</button>
          <button className="ghost" onClick={() => goTo("evidence")}>See the evidence</button>
        </div>
      </section>

      <p className="honest">
        This is a prototype on made-up data. The Evidence page shows what works, what does not yet, and what the red-team
        tests found and fixed.
      </p>
    </div>
  );
}
