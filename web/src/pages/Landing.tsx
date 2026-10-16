import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { ThemePicker, type Theme } from "../components/ThemePicker";
import { ScoreRing } from "../components/ui";

interface Props {
  signedIn: boolean;
  enter: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// A made-up example, scored with the same rules the engine uses (15 + 15 + 30 + 25 = 85).
const SAMPLE = [
  { label: "New beneficiary", points: 15 },
  { label: "Receiving account only 4 days old", points: 15 },
  { label: "Amount 12× the usual payment", points: 30 },
  { label: "Customer on a live phone call", points: 25 },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "eye", title: "Explainable AI", text: "Every recommendation comes with ranked reasons and points, never a black-box score." },
  { icon: "mic", title: "Voice scam detection", text: "Paste, upload or speak a call transcript to spot OTP requests, impersonation and pressure." },
  { icon: "activity", title: "Behaviour intelligence", text: "Amount, device, location, timing and 15-day history are compared with the customer's normal." },
  { icon: "network", title: "Mule-network detection", text: "Flagged links, fan-in from many senders and fast onward transfers around the receiving account." },
];

// The three places a scam shows itself, and which PaySentinel check looks there.
const BLIND_SPOTS: { icon: IconName; where: string; title: string; text: string; answer: string }[] = [
  { icon: "activity", where: "In the payment", title: "An unusual transaction", text: "A much larger amount than usual, a brand-new payee, a new device or location, a night-time transfer or a remote-access app running.", answer: "TxnGuard behaviour checks" },
  { icon: "mic", where: "In the customer's words", title: "A coached or pressured customer", text: "Urgency, secrecy, a caller asking for an OTP, threats of arrest or account blocking, or a reason that sounds rehearsed.", answer: "ScamStop note reading and Voice AI" },
  { icon: "network", where: "In the receiving account", title: "A mule account", text: "Money arriving from many unrelated senders and leaving again within hours, or links to accounts already flagged.", answer: "MuleNet network checks" },
];

const STEPS = [
  { title: "Detect", text: "A payment arrives with its context. Behaviour, voice and network checks run before money moves." },
  { title: "Ask", text: "When the evidence is thin, one short, friendly question goes to the customer before deciding." },
  { title: "Explain", text: "Allow, warn or hold, with the strongest reasons ranked by weight and a full audit record." },
  { title: "Protect", text: "High-risk payments go to an analyst. A person confirms every hold and every release." },
];

const WHY = [
  { value: "$442B", text: "lost to scams by people in 42 countries in a single year.", source: "Global State of Scams 2025, GASA and Feedzai" },
  { value: "23%", text: "of adults lost money to a scam in the past year; another 34% were targeted.", source: "Global State of Scams 2025, GASA and Feedzai" },
  { value: "+40%", text: "growth in UK investment-scam losses in 2025, the largest authorised-payment fraud type.", source: "UK Finance Annual Fraud Report 2026" },
];

export function Landing({ signedIn, enter, theme, setTheme }: Props) {
  return (
    <>
    <nav className="land-nav" aria-label="Main">
      <div className="land-nav-inner">
        <button className="brand-mark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="PaySentinel AI, back to top">
          <Logo size={34} />
          <span><strong>PaySentinel AI</strong><small>Fraud intelligence</small></span>
        </button>
        <div className="links">
          <a href="#problem">The problem</a>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#why">Why it matters</a>
        </div>
        <div className="actions">
          <ThemePicker theme={theme} onChange={setTheme} />
          <button className="btn small primary" onClick={enter}>{signedIn ? "Open command centre" : "Sign in"}</button>
        </div>
      </div>
    </nav>
    <div className="landing">

      <section className="land-hero">
        <div>
          <span className="badge-pill"><Icon name="pulse" size={14} /> Real-time protection for account-to-account payments</span>
          <h1>Stop fraud <span className="grad">before money moves.</span></h1>
          <p className="lead">
            PaySentinel AI checks account-to-account transfers (UPI, IMPS, NEFT) before the money leaves, using the payment,
            the customer's own words and the receiving account's links, then explains exactly why a transfer looks risky.
          </p>
          <div className="hero-cta">
            <button className="btn primary" onClick={enter}>Protect a payment <Icon name="arrow" size={16} /></button>
            <a className="btn" href="#how">See how it works</a>
          </div>
          <ul className="ticks">
            <li><Icon name="check" size={15} /> Real-time detection</li>
            <li><Icon name="check" size={15} /> Explainable AI</li>
            <li><Icon name="check" size={15} /> Human in control</li>
          </ul>
        </div>

        <aside className="demo-card" aria-label="Example risk decision on made-up data">
          <div className="demo-card-top">
            <span className="kicker">Transaction security</span>
            <span className="act hold">High risk</span>
          </div>
          <div className="demo-amount mono">₹35,000</div>
          <div className="demo-verdict">
            <ScoreRing score={85} tone="red" label="RISK" size={112} />
            <div>
              <strong>Suspicious activity</strong>
              <span className="muted small">Multiple unusual signals detected. Hold recommended for analyst review.</span>
            </div>
          </div>
          <ul className="signal-points">
            {SAMPLE.map((row) => <li key={row.label}><span>{row.label}</span><span>+{row.points}</span></li>)}
          </ul>
          <button className="btn block" onClick={enter}><Icon name="shield" size={16} /> Review transaction</button>
          <p className="muted small" style={{ margin: "10px 0 0", textAlign: "center" }}>Example on made-up data</p>
        </aside>
      </section>

      <section className="land-section" id="problem">
        <p className="kicker">The problem we solve</p>
        <h2>The customer approves the payment. <span className="grad">The scammer wrote the script.</span></h2>
        <p className="section-sub">
          In authorised account-to-account scams the victim logs in on their own phone, passes every security check and sends a UPI, IMPS or NEFT transfer themselves,
          because a fake bank officer, "police" caller, investment adviser or online partner told them to. Password, OTP and device checks
          all pass, so traditional fraud systems see a normal payment. Within minutes the money moves on through mule accounts and is gone.
        </p>
        <div className="problem-statement">
          <Icon name="flag" size={20} />
          <p><strong>Problem statement:</strong> detect social-engineering scams in account-to-account transfers (UPI, IMPS, NEFT) in real time, before the money leaves the account,
            explain the decision clearly, and avoid blocking genuine customers.</p>
        </div>
        <div className="blind-grid">
          {BLIND_SPOTS.map((spot) => (
            <article className="blind-card" key={spot.title}>
              <span className="feature-icon"><Icon name={spot.icon} size={20} /></span>
              <p className="kicker" style={{ marginBottom: 4 }}>{spot.where}</p>
              <h3>{spot.title}</h3>
              <p>{spot.text}</p>
              <span className="blind-answer"><Icon name="check" size={14} /> {spot.answer}</span>
            </article>
          ))}
        </div>
        <p className="problem-note">
          Each warning sign lives in a different place. Looking at only one either misses the scam or stops genuine customers.
          <strong> PaySentinel AI combines all three before the payment settles, and a person confirms every hold.</strong>
        </p>
      </section>

      <section className="land-section" id="features">
        <p className="kicker">Capabilities</p>
        <h2>More than just <span className="grad">fraud detection.</span></h2>
        <p className="section-sub">Transaction intelligence, behavioural analysis and AI-powered social-engineering detection in one investigation workspace.</p>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon"><Icon name={feature.icon} size={20} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section" id="how">
        <p className="kicker">How it works</p>
        <h2>Detect. Explain. <span className="grad">Protect.</span></h2>
        <p className="section-sub">Rules score the payment, Gemini reads the customer's words, and the decision layer combines both into one recommendation.</p>
        <div className="steps-row">
          {STEPS.map((step, index) => (
            <article className="step-card" key={step.title}>
              <span className="step-no">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section" id="why">
        <p className="kicker">Why it matters</p>
        <h2>A large and fast-growing <span className="grad">loss for customers and banks.</span></h2>
        <p className="section-sub">Regulators are moving the cost of these scams onto banks, so stopping them before settlement matters to both sides.</p>
        <div className="why-grid">
          {WHY.map((row) => (
            <article className="why-card" key={row.value}>
              <strong className="grad">{row.value}</strong>
              <p>{row.text}</p>
              <small>{row.source}</small>
            </article>
          ))}
        </div>
        <div className="land-cta">
          <div>
            <h2>See it work on a live payment.</h2>
            <p>Open the command centre, run a transaction, and follow the evidence.</p>
          </div>
          <button className="btn primary" onClick={enter}>Open command centre <Icon name="arrow" size={16} /></button>
        </div>
      </section>

      <footer className="land-foot">
        <span>PaySentinel AI · synthetic-data prototype · no real payment is made</span>
        <span>Gemini on Vertex AI · Cloud Run · FastAPI · React</span>
      </footer>
    </div>
    </>
  );
}
