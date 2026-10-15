import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { INDUSTRY_STATS, INSIGHTS, JOURNEY, PREVIEW_TABS } from "./homepageData";

interface Props {
  tryLive: () => void;
  goTo: (page: "evidence" | "architecture") => void;
}

const CHECKS = [
  { number: "01", name: "FraudShield", tag: "Transaction behaviour", text: "Look for unusual amounts, unfamiliar payees and changes in customer payment history." },
  { number: "02", name: "ScamStop", tag: "Customer context", text: "Look for social engineering and ask a neutral follow-up when more evidence is needed." },
  { number: "03", name: "MuleNet", tag: "Synthetic account links", text: "Analyze suspicious connections in an optional demo account graph—not a live banking network." },
];

export function OverviewDetails({ tryLive, goTo }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const journeyRef = useRef<HTMLElement | null>(null);
  const journeyStarted = useRef(false);

  // Play once when first brought into view. Keep text readable without animation
  // for visitors who prefer reduced motion; any step remains manually selectable.
  useEffect(() => {
    const element = journeyRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || journeyStarted.current) return;
      journeyStarted.current = true;
      if (!reducedMotion) setPlaying(true);
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (activeStep >= JOURNEY.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setActiveStep((current) => current + 1), 1950);
    return () => window.clearTimeout(timer);
  }, [activeStep, playing]);

  const selectStep = (index: number) => {
    setActiveStep(index);
    setPlaying(false);
  };
  const replay = () => {
    setActiveStep(0);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };
  const step = JOURNEY[activeStep];
  const preview = PREVIEW_TABS[previewIndex];

  return (
    <div className="overview">
      <section className="journey-section" ref={journeyRef} aria-labelledby="journey-title">
        <div className="section-heading journey-heading">
          <p className="eyebrow">The payment protection journey</p>
          <h2 id="journey-title">From the first payment signal to a human decision.</h2>
          <p className="muted">Follow an illustrative transaction. Select any stage to inspect what the platform checks and why it matters.</p>
        </div>
        <div className="journey-shell">
          <div className="journey-toolbar">
            <span className="journey-kicker"><span className="journey-live-dot" /> Interactive walkthrough · Synthetic transaction</span>
            <button className="ghost small-btn" onClick={replay} aria-label="Replay fraud prevention journey"><Icon name="play" size={14} /> Replay journey</button>
          </div>
          <ol className="journey-rail" aria-label="Choose a transaction investigation stage">
            {JOURNEY.map((item, index) => (
              <li key={item.id} className={index === activeStep ? "is-active" : index < activeStep ? "is-complete" : ""}>
                <button type="button" onClick={() => selectStep(index)} aria-pressed={activeStep === index} aria-label={`Stage ${index + 1}: ${item.label}`}>
                  <span className="journey-node"><Icon name={item.icon} size={21} /></span>
                  <span className="journey-step-index mono">0{index + 1}</span>
                  <span className="journey-step-label">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="journey-detail" aria-live={playing ? "off" : "polite"}>
            <div className="journey-explanation" key={step.id}>
              <div className="journey-detail-header"><span className="eyebrow">Stage {activeStep + 1} of {JOURNEY.length}</span><span className="journey-id mono">SG-DEMO-001</span></div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <div className="journey-evidence"><Icon name="flag" size={18} /><span>{step.evidence}</span></div>
              {step.limitation && <p className="journey-limitation">{step.limitation}</p>}
            </div>
            <div className="journey-signal" key={step.signal}>
              <span className="signal-head"><Icon name="shield" size={18} /> FIN GUARD / LIVE PREVIEW</span>
              <span className="signal-caption">{step.signal}</span>
              <strong>{step.labelValue}</strong>
              <span className="signal-divider" />
              <span className="signal-bottom">Simulated case <span className="mono">SG-DEMO-001</span></span>
              <span className="signal-disclosure">Illustration only, not a bank decision</span>
            </div>
          </div>
          <div className="journey-foot">
            <span className="muted small">{playing ? "Playing the investigation journey…" : "Select a stage or replay the walkthrough."}</span>
            <button className="journey-text-button" onClick={tryLive}>Open the assessment console <Icon name="arrow" size={17} /></button>
          </div>
        </div>
      </section>

      <section className="research-stats-section" aria-labelledby="why-title">
        <div className="research-stats-header">
          <div><p className="eyebrow">The evidence behind the problem</p><h2 id="why-title">The cost of scams is real.</h2></div>
          <p>Reported industry figures from public regulatory sources—not FinGuard AI results.</p>
        </div>
        <div className="research-stats-grid">
          {INDUSTRY_STATS.map((stat) => (
            <article className="research-stat" key={`${stat.number}-${stat.label}`}>
              <strong className="research-stat-number mono">{stat.number}</strong>
              <h3>{stat.label}</h3>
              <p>{stat.detail}</p>
              <a href={stat.url} target="_blank" rel="noopener noreferrer" className="research-source">{stat.source} <span aria-hidden="true">↗</span></a>
            </article>
          ))}
        </div>
        <p className="research-note">Reported losses understate total harm because not all scams are reported. RBI figures count cases reported in the financial year and may include earlier incidents. Data sets cover different geographies and must not be added together.</p>
      </section>

      <section className="simulation-section" aria-labelledby="simulation-title">
        <div className="section-heading">
          <p className="eyebrow">A product story, not just a slide</p>
          <h2 id="simulation-title">See the signals behind a suspicious transfer.</h2>
          <p className="muted">Explore a synthetic scenario, then open the actual assessment console to run a case.</p>
        </div>
        <div className="simulation-shell">
          <div className="simulation-tabs" role="group" aria-label="Choose simulation view">
            {PREVIEW_TABS.map((tab, index) => (
              <button key={tab.id} onClick={() => setPreviewIndex(index)} aria-pressed={previewIndex === index} className={previewIndex === index ? "on" : ""}>{tab.label}</button>
            ))}
          </div>
          <div className="simulation-content" key={preview.id}>
            <div className="simulation-narrative">
              <p className="eyebrow">{preview.eyebrow}</p>
              <h3>{preview.title}</h3>
              <blockquote>“{preview.quote}”</blockquote>
              <button className="primary" onClick={tryLive}>Try this in the live console <Icon name="arrow" size={16} /></button>
            </div>
            <div className="simulation-evidence">
              <div className="simulation-evidence-top"><span className="mono">SG-DEMO-001</span><span className="pill warn">Synthetic example</span></div>
              <h4>What the system considers</h4>
              <ul>{preview.lines.map((line) => <li key={line}><Icon name="allow" size={17} /> {line}</li>)}</ul>
              <p className="muted small">The example illustrates the investigation flow; no real bank payment is processed.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="checks-section" aria-labelledby="checks-title">
        <div className="section-heading"><p className="eyebrow">The solution</p><h2 id="checks-title">Three investigations. One clear decision.</h2><p className="muted">Each check contributes evidence to the same explainable risk assessment.</p></div>
        <div className="checks-grid">{CHECKS.map((check) => <article className="check-card" key={check.name}><div className="check-top"><span className="mono">{check.number}</span><span aria-hidden="true">↗</span></div><p className="eyebrow">{check.tag}</p><h3>{check.name}</h3><p>{check.text}</p></article>)}</div>
      </section>

      <section className="insights-section" aria-labelledby="insights-title">
        <div className="research-stats-header"><div><p className="eyebrow">Fraud intelligence & insights</p><h2 id="insights-title">Research, not marketing claims.</h2></div><p>Read the primary sources that inform the problem we are working to address.</p></div>
        <div className="insights-grid">
          {INSIGHTS.map((item, index) => <article className="insight-card" key={item.url}>
            <div className={`insight-visual visual-${index + 1}`} aria-hidden="true"><Icon name={index === 0 ? "shield" : index === 1 ? "chart" : "brain"} size={40} /><span className="mono">INTELLIGENCE / 0{index + 1}</span></div>
            <div className="insight-body"><div className="insight-meta">{item.category} · {item.date}</div><h3>{item.headline}</h3><p>{item.summary}</p><a href={item.url} target="_blank" rel="noopener noreferrer">Read {item.source} source <Icon name="arrow" size={17} /></a></div>
          </article>)}
        </div>
      </section>

      <section aria-labelledby="built" className="built">
        <div><h2 id="built" className="eyebrow">Built on Google Cloud</h2><ul className="badges"><li>Gemini on Vertex AI (when configured)</li><li>Cloud Run deployment</li><li>Cloud Build</li><li>Service identity, no key file</li></ul></div>
        <div className="row"><button className="ghost" onClick={() => goTo("architecture")}>See the architecture</button><button className="ghost" onClick={() => goTo("evidence")}>See the evidence</button></div>
      </section>
      <p className="honest">This is a synthetic-data prototype. There is no live bank payment integration, and the analyst queue is browser-only. The Evidence page shows what has been tested and where the prototype still has limits.</p>
    </div>
  );
}
