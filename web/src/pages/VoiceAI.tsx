import { useEffect, useRef, useState } from "react";
import { analyseConversation, type ConversationResult } from "../api";
import { Icon } from "../components/Icon";
import { EmptyState, PageHead, PanelHead, ScoreRing, toneForLevel } from "../components/ui";
import { makeRecogniser, type Recogniser } from "../lib/speech";

interface Props {
  onAnalysed: (result: ConversationResult) => void;
}

const SAMPLES = [
  { label: "Bank OTP call", text: "Hello, I am calling from your bank's security department. Your account will be blocked today unless you verify your identity. Give me the OTP sent to your phone immediately." },
  { label: "Digital arrest", text: "This is Inspector Sharma from the cyber cell. A case has been registered against your Aadhaar for money laundering. Do not tell your family. Transfer the amount to the safe account within 30 minutes to avoid arrest." },
  { label: "Remote refund", text: "Sir, your refund of Rs 4,999 is pending. Please install AnyDesk so our technician can process it. Then approve the collect request on your UPI app." },
  { label: "Genuine call", text: "Hi, this is Priya from the dental clinic confirming your appointment tomorrow at 11. Please bring your old X-rays if you have them. See you then." },
];

const MAX = 4000;


export function VoiceAI({ onAnalysed }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversationResult | null>(null);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [interim, setInterim] = useState("");
  const [autoAnalyse, setAutoAnalyse] = useState(true);
  const [micError, setMicError] = useState("");
  const [over, setOver] = useState(false);
  const recogniser = useRef<Recogniser | null>(null);
  const liveRef = useRef("");
  const autoRef = useRef(autoAnalyse);
  autoRef.current = autoAnalyse;
  const supported = typeof window !== "undefined" && makeRecogniser() !== null;

  useEffect(() => () => recogniser.current?.stop(), []);

  async function analyse(transcript: string) {
    const clean = transcript.trim().slice(0, MAX);
    if (!clean) return;
    setBusy(true);
    setError("");
    try {
      const reading = await analyseConversation(clean);
      setResult(reading);
      onAnalysed(reading);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const rec = makeRecogniser();
    if (!rec) return;
    setMicError("");
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i];
        if (piece.isFinal) liveRef.current = `${liveRef.current} ${piece[0].transcript}`.trim();
        else pending += piece[0].transcript;
      }
      setLive(liveRef.current);
      setInterim(pending);
    };
    rec.onerror = (event) => setMicError(event.error === "not-allowed" ? "Microphone permission was denied." : `Speech recognition stopped (${event.error}).`);
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (autoRef.current && liveRef.current.trim()) {
        setText(liveRef.current);
        void analyse(liveRef.current);
      }
    };
    recogniser.current = rec;
    rec.start();
    setListening(true);
  }

  function stopListening() {
    recogniser.current?.stop();
  }

  function clearLive() {
    recogniser.current?.stop();
    liveRef.current = "";
    setLive("");
    setInterim("");
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|text|srt|vtt)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setError("Upload a text transcript (.txt, .srt or .vtt). Audio files need a speech-to-text step that this prototype does not include; use Live Call Detection instead.");
      return;
    }
    const content = await file.text();
    // Strip subtitle timing lines so only the spoken words remain.
    const words = content.split(/\r?\n/).filter((line) => !/^\d+$/.test(line.trim()) && !/-->/.test(line) && line.trim() !== "WEBVTT").join(" ");
    setText(words.replace(/\s+/g, " ").trim().slice(0, MAX));
    setError("");
  }

  const level = result?.risk_level ?? "low";

  return (
    <div>
      <PageHead kicker="Social-engineering detection" title="Voice Phishing" accent="AI" text="Detect impersonation, urgency, threats and OTP requests in a phone call, live from the microphone or from a transcript.">
        <span className="status-pill"><span className="dot" /> Ready</span>
      </PageHead>

      <section className="panel live-panel">
        <PanelHead kicker="Microphone speech → Last Mile Guard analysis" title="Live call detection" icon="mic">
          <span className={`act ${listening ? "hold" : "allow"}`}>{listening ? "Listening" : "Ready"}</span>
        </PanelHead>
        {supported ? (
          <>
            <div className="live-controls">
              {listening
                ? <button className="btn danger" onClick={stopListening}><span className="rec-dot" /> Stop and analyse</button>
                : <button className="btn danger" onClick={startListening}><Icon name="mic" size={16} /> Start live detection</button>}
              <button className="btn" onClick={clearLive}><Icon name="refresh" size={14} /> Clear</button>
              <label className="chip-btn" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={autoAnalyse} onChange={(e) => setAutoAnalyse(e.target.checked)} /> Automatic AI analysis when stopped
              </label>
            </div>
            <div className="transcript-live" aria-live="polite">
              {live || interim ? <>{live} <span className="interim">{interim}</span></> : <span className="muted">Press "Start live detection" and speak, or put the call on speaker near the microphone.</span>}
            </div>
            {micError && <p className="problem-box" style={{ marginTop: 10 }}>{micError}</p>}
            <p className="muted small" style={{ margin: "10px 0 0" }}>Speech is transcribed by your browser's speech recogniser. Only the text is sent for analysis; no audio is stored.</p>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Live speech recognition is not available in this browser. Use Chrome or Edge, or paste a transcript below.</p>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <PanelHead kicker="Submit a transcript" title="Conversation analysis" icon="pulse" />
          <div className="tag-row"><span className="tag-soft">Secure analysis</span><span className="tag-soft">Text only</span><span className="tag-soft">Explainable AI</span></div>

          <label className={`dropzone ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void loadFile(e.dataTransfer.files[0]); }}>
            <Icon name="upload" size={22} />
            <strong>Upload call transcript</strong>
            <small>.txt, .srt or .vtt text files</small>
            <input type="file" accept=".txt,.srt,.vtt,text/plain" className="sr-only" onChange={(e) => void loadFile(e.target.files?.[0])} />
          </label>

          <div className="or-line">OR PASTE TRANSCRIPT</div>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {SAMPLES.map((sample) => <button key={sample.label} className="chip-btn" onClick={() => setText(sample.text)}>{sample.label}</button>)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label className="f-label" htmlFor="transcript">Call transcript</label>
            <span className="muted small">{text.length} / {MAX}</span>
          </div>
          <textarea id="transcript" className="f-area" maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Example:\nHello, I am calling from your bank. Your account will be blocked today. Please share the OTP sent to your phone so I can verify your account."} />
          <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !text.trim()} onClick={() => analyse(text)}>
            {busy ? <span className="spin" /> : <Icon name="shield" size={16} />} {busy ? "Analysing" : "Analyse for phishing"}
          </button>
          {error && <p className="problem-box" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        </section>

        <section className="panel" aria-live="polite">
          <PanelHead kicker="Explainable phishing risk analysis" title="AI assessment" icon="lock" />
          {!result && <EmptyState icon="mic" title="Awaiting conversation" text="Paste a transcript on the left and run the analysis to see risk, confidence and detected indicators." />}
          {result && (
            <>
              <div className="verdict-box">
                <ScoreRing score={result.scam_likelihood} tone={toneForLevel(level)} label="SCAM RISK" />
                <div className="verdict-card">
                  <span className="kicker" style={{ color: "var(--muted)" }}>Risk level</span>
                  <div className={`big ${level === "high" ? "hold" : level === "medium" ? "warn" : "allow"}`}>{level.toUpperCase()}</div>
                  <span className="muted small">Read by {result.source === "gemini" ? "Gemini (structured reading)" : "phrase rules"}{result.duration_ms !== undefined ? ` · ${result.duration_ms} ms` : ""}</span>
                </div>
              </div>
              {result.notice && <p className="ai-note warn"><Icon name="warn" size={16} /> {result.notice}</p>}
              <p className="ai-note"><Icon name="brain" size={16} /> {result.explanation}</p>

              <PanelHead kicker="Detected indicators" title="Social-engineering tactics" />
              <ul className="reason-list">
                {result.indicators.length === 0 && result.tactics.every((t) => t === "none") && <li className="calm"><Icon name="allow" size={16} /> No known scam patterns found.</li>}
                {result.indicators.map((item) => (
                  <li key={item.tactic}><Icon name="warn" size={16} /><span>{item.label}</span><span className="pts">+{item.points}</span></li>
                ))}
                {result.source === "gemini" && result.tactics.filter((t) => t !== "none" && !result.indicators.some((i) => i.tactic === t)).map((tactic) => (
                  <li key={tactic}><Icon name="brain" size={16} /><span>AI: {tactic.replaceAll("_", " ")}</span></li>
                ))}
              </ul>

              {result.suspicious_phrases.length > 0 && (
                <>
                  <PanelHead kicker="Evidence" title="Suspicious phrases" />
                  <ul className="phrase-list">{result.suspicious_phrases.map((phrase) => <li key={phrase}>“{phrase}”</li>)}</ul>
                </>
              )}
              <p className={`ai-note ${level === "low" ? "" : "warn"}`}><Icon name="shield" size={16} /> <span><strong>Recommended action:</strong> {result.recommendation}</span></p>
            </>
          )}
        </section>
      </div>

      <div className="feature-strip">
        <div><Icon name="lock" size={16} /> Untrusted text, never obeyed</div>
        <div><Icon name="eye" size={16} /> Explainable indicators</div>
        <div><Icon name="pulse" size={16} /> Real-time threat intelligence</div>
      </div>
    </div>
  );
}
