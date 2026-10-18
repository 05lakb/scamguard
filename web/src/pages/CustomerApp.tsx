import { useEffect, useRef, useState } from "react";
import { sendVerificationAnswers, startVerification, streamAssessment, type ServerDecision } from "../api";
import { Icon, type IconName } from "../components/Icon";
import { caseReference } from "../lib/cases";
import { money } from "../lib/insights";
import { newRun, publish } from "../lib/live";
import { buildForm, CONTACTS, newPayee, PERSONAS, randomSignals, SCANS, story, STORY_LABELS, type Payee, type Persona, type Signals } from "../lib/phoneSim";
import { makeRecogniser, speak, stopSpeaking, type Recogniser } from "../lib/speech";
import { toRequest, type Form } from "./Analyzer";

// The customer's banking app, on its own page (#/customer), with no dashboard around it.
// It works like a UPI app: pick a payee, type an amount, check, enter the PIN. The phone's own signals
// are made up for each payment; the presenter panel shows them and can change them.
// The bank's dashboard, in another window of this browser, follows the same payment live.

type Screen = "home" | "contacts" | "new" | "scan" | "amount" | "review" | "pin" | "checking"
  | "sent" | "warned" | "cancelled" | "ask" | "held" | "call" | "after";
type CallPhase = "connecting" | "speaking" | "listening" | "typing" | "checking";

export function CustomerApp() {
  const [persona, setPersona] = useState<Persona>(PERSONAS[0]);
  const [signals, setSignals] = useState<Signals>(() => randomSignals());
  const [screen, setScreen] = useState<Screen>("home");
  const [payee, setPayee] = useState<Payee | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [newKind, setNewKind] = useState<"upi" | "bank">("upi");
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newIfsc, setNewIfsc] = useState("");
  const [pin, setPin] = useState("");
  const [sentForm, setSentForm] = useState<Form | null>(null);
  const [decision, setDecision] = useState<ServerDecision | null>(null);
  const [asked, setAsked] = useState<ServerDecision | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [questions, setQuestions] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [hearing, setHearing] = useState("");
  const [typed, setTyped] = useState<string[]>(["", ""]);
  const [panel, setPanel] = useState(false);
  const run = useRef("");
  const recogniser = useRef<Recogniser | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "charcoal");
    const previousTitle = document.title;
    document.title = "Your Bank · Last Mile Guard demo";
    return () => { cancelled.current = true; recogniser.current?.stop(); stopSpeaking(); document.title = previousTitle; };
  }, []);

  const pay = money(Number(amount) || 0, "INR");
  const serverId = decision?.execution?.saved ? decision.execution.request_id : null;
  const reference = caseReference(decision?.execution?.request_id);

  function home() {
    cancelled.current = true;
    recogniser.current?.stop();
    stopSpeaking();
    setScreen("home"); setPayee(null); setAmount(""); setNote(""); setPin(""); setDecision(null); setAsked(null);
    setReply(""); setError(""); setQuestions([]); setTyped(["", ""]); setHearing(""); setSentForm(null);
    setSignals(randomSignals());
  }

  function choosePayee(next: Payee, preset?: { amount: string; note: string }) {
    setPayee(next);
    setAmount(preset?.amount ?? "");
    setNote(preset?.note ?? "");
    setScreen("amount");
  }

  function playStory(label: string) {
    const s = story(label);
    if (!s) return;
    home();
    setPayee(s.payee); setAmount(s.amount); setNote(s.note); setSignals(s.signals);
    setScreen("review");
    setPanel(false);
  }

  function scan() {
    setScreen("scan");
    window.setTimeout(() => {
      const found = SCANS[Math.random() < 0.5 ? 0 : 1];
      choosePayee(found.payee, { amount: found.amount, note: found.note });
    }, 1400);
  }

  function key(digit: string) {
    setError("");
    if (digit === "back") { setAmount((a) => a.slice(0, -1)); return; }
    setAmount((a) => (a.length >= 8 || (a === "" && digit === "0") ? a : a + digit));
  }

  function pinKey(digit: string) {
    if (digit === "back") { setPin((p) => p.slice(0, -1)); return; }
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) window.setTimeout(() => { setPin(""); void check(); }, 250);
  }

  async function check(questionsAsked?: string[], answer?: string) {
    if (!payee) return;
    setError("");
    setScreen("checking");
    const form = answer === undefined ? buildForm(persona, payee, amount, note.trim(), signals) : sentForm!;
    if (answer === undefined) {
      setSentForm(form);
      run.current = newRun();
      publish({ type: "payment", run: run.current, form });
    } else {
      publish({ type: "answered", run: run.current, answer });
    }
    const id = run.current;
    try {
      const result = await streamAssessment(toRequest(form, questionsAsked, answer), (event) => publish({ type: "stage", run: id, event }));
      if (result.action === "ask" && answer === undefined) {
        setAsked(result);
        publish({ type: "asked", run: id, decision: result });
        setScreen("ask");
        return;
      }
      setDecision(result);
      publish({ type: "result", run: id, decision: result, questions: questionsAsked, answer });
      setScreen(result.action === "allow" ? "sent" : result.action === "warn" ? "warned" : "held");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The payment could not be checked.");
      setScreen("review");
    }
  }

  function listenOnce(): Promise<string> {
    return new Promise((resolve, reject) => {
      const rec = makeRecogniser();
      if (!rec) return reject(new Error("unsupported"));
      recogniser.current = rec;
      let heard = "";
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-IN";
      rec.onresult = (event) => {
        let pending = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i];
          if (piece.isFinal) heard = `${heard} ${piece[0].transcript}`.trim();
          else pending += piece[0].transcript;
        }
        setHearing(`${heard} ${pending}`.trim());
      };
      rec.onerror = (event) => reject(new Error(event.error));
      rec.onend = () => resolve(heard);
      rec.start();
    });
  }

  async function startCall() {
    if (!serverId) { setError("This payment was not saved, so the call cannot start."); return; }
    cancelled.current = false;
    setError(""); setScreen("call"); setPhase("connecting");
    const voiceWorks = makeRecogniser() !== null;
    try {
      const started = (await startVerification(serverId, voiceWorks ? "voice" : "typed")).verification;
      if (!started) throw new Error("The call could not start.");
      setQuestions(started.questions);
      publish({ type: "call", run: run.current, questions: started.questions, answers: [] });
      if (!voiceWorks) { setPhase("typing"); return; }
      setPhase("speaking");
      await speak(`Hello, this is your bank's fraud desk, an automated assistant. Your payment of ${pay} is paused to protect you. We will never ask for your PIN or a one-time code. Please answer two short questions.`);
      const heard: string[] = [];
      for (let index = 0; index < started.questions.length; index += 1) {
        if (cancelled.current) return;
        setCurrent(index); setHearing(""); setPhase("speaking");
        await speak(started.questions[index]);
        setPhase("listening");
        let answer = "";
        try {
          answer = await listenOnce();
          if (!answer) answer = await listenOnce();
        } catch {
          setTyped(started.questions.map((_, i) => heard[i] ?? ""));
          setPhase("typing");
          return;
        }
        heard.push(answer);
        publish({ type: "call", run: run.current, questions: started.questions, answers: [...heard] });
      }
      await finishCall(heard, started.questions);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The call could not start.");
      setScreen("held");
    }
  }

  async function finishCall(final: string[], asked2: string[] = questions) {
    if (!serverId) return;
    setPhase("checking");
    publish({ type: "call", run: run.current, questions: asked2, answers: final });
    void speak("Thank you. A specialist will confirm what happens to your payment.");
    try {
      const done = (await sendVerificationAnswers(serverId, final.map((answer) => answer || "(no answer)"))).verification;
      if (done) publish({ type: "verified", run: run.current, verification: done });
      setScreen("after");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The answers could not be checked.");
      setPhase("typing");
    }
  }

  const back = (to: Screen) => <button className="phone-back" onClick={() => setScreen(to)} aria-label="Back"><Icon name="back" size={16} /></button>;
  const keypad = (onKey: (d: string) => void) => (
    <div className="phone-keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((d, i) => (
        d === "" ? <span key={i} /> : <button key={i} onClick={() => onKey(d)} aria-label={d === "back" ? "Delete" : d}>{d === "back" ? <Icon name="back" size={16} /> : d}</button>
      ))}
    </div>
  );
  const initials = (name: string) => name.replace(/\(.*\)/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const presenter = (
    <div className="presenter">
      <div className="presenter-head">
        <strong>Presenter controls</strong>
        <button className="presenter-close" onClick={() => setPanel(false)} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>
      <p className="muted small">Not part of the customer's app. These are what a real phone and bank would know.</p>
      <label className="presenter-row"><span>Customer</span>
        <select value={persona.id} onChange={(e) => setPersona(PERSONAS.find((p) => p.id === e.target.value) ?? PERSONAS[0])}>
          {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <p className="presenter-sub">Phone signals for the next payment</p>
      {([["onCall", "On a phone call"], ["remote", "Screen-sharing app running"], ["newDevice", "New device"], ["locationChanged", "Unusual location"]] as const).map(([k, label]) => (
        <label key={k} className="presenter-row"><span>{label}</span>
          <input type="checkbox" checked={signals[k]} onChange={(e) => setSignals({ ...signals, [k]: e.target.checked })} />
        </label>
      ))}
      <label className="presenter-row"><span>Time</span>
        <input type="time" value={signals.time} onChange={(e) => setSignals({ ...signals, time: e.target.value })} />
      </label>
      <label className="presenter-row"><span>Payments in last 24 h</span>
        <input type="number" min={0} max={9} value={signals.recent} onChange={(e) => setSignals({ ...signals, recent: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })} />
      </label>
      <button className="btn small" onClick={() => setSignals(randomSignals())}><Icon name="refresh" size={13} /> Randomise signals</button>
      {payee && (
        <>
          <p className="presenter-sub">What the bank knows about {payee.name}</p>
          <p className="small presenter-facts">
            {payee.known ? "Paid before" : "New payee"} · {payee.type === "crypto_exchange" ? "crypto exchange" : payee.type} · account {payee.ageDays} days old · {payee.network === "ring" ? "linked to a mule ring" : payee.network === "clean" ? "established account" : "no network data"}
          </p>
        </>
      )}
      <p className="presenter-sub">Ready-made scam stories</p>
      <div className="presenter-stories">
        {STORY_LABELS.map((label) => <button key={label} className="chip-btn" onClick={() => playStory(label)}>{label}</button>)}
      </div>
    </div>
  );

  return (
    <div className="customer-page">
      <div className="customer-aside">
        <p className="kicker">Customer app · simulated</p>
        <h1>Your Bank</h1>
        <p className="muted">What the customer sees on their phone. Open the bank's dashboard (Transactions) in another window of this browser to watch the agent work on the same payment, live.</p>
        {presenter}
      </div>
      {panel && <div className="presenter-sheet" role="dialog" aria-label="Presenter controls">{presenter}</div>}

      <div className="phone-frame customer-phone" aria-label="Your Bank app">
        <div className="phone-notch" aria-hidden="true" />
        <div className="phone-status">
          <span>{signals.time}</span>
          <span>{signals.onCall ? <><Icon name="mic" size={11} /> On a call</> : signals.remote ? "Screen shared" : ""}</span>
          <button className="phone-demo-btn" onClick={() => setPanel(true)} aria-label="Presenter controls">Demo</button>
        </div>
        <div className="phone-app-bar"><Icon name="shield" size={16} /> Your Bank</div>
        <div className="phone-body">
          {screen === "home" && (
            <div className="phone-screen">
              <div className="phone-balance"><small>Savings account ···· 4821</small><strong>{money(persona.balance, "INR")}</strong></div>
              <div className="phone-actions">
                {([["Pay contact", "user", "contacts"], ["To UPI ID", "arrow", "new-upi"], ["To bank account", "home", "new-bank"], ["Scan & pay", "grid", "scan"]] as [string, IconName, string][]).map(([label, icon, to]) => (
                  <button key={label} onClick={() => {
                    if (to === "scan") scan();
                    else if (to === "contacts") setScreen("contacts");
                    else { setNewKind(to === "new-bank" ? "bank" : "upi"); setNewName(""); setNewId(""); setNewIfsc(""); setScreen("new"); }
                  }}><span><Icon name={icon} size={18} /></span>{label}</button>
                ))}
              </div>
              <p className="phone-label">Recent</p>
              <div className="phone-contacts">
                {CONTACTS.slice(0, 3).map((c) => (
                  <button key={c.handle} onClick={() => choosePayee(c)}><span className="phone-avatar-sm">{initials(c.name)}</span>{c.name.split(" (")[0]}</button>
                ))}
              </div>
            </div>
          )}
          {screen === "contacts" && (
            <div className="phone-screen">
              <div className="phone-title">{back("home")}<h3>Pay a contact</h3></div>
              {CONTACTS.map((c) => (
                <button key={c.handle} className="phone-row" onClick={() => choosePayee(c)}>
                  <span className="phone-avatar-sm">{initials(c.name)}</span>
                  <span><strong>{c.name}</strong><small>{c.handle}</small></span>
                </button>
              ))}
            </div>
          )}
          {screen === "new" && (
            <div className="phone-screen">
              <div className="phone-title">{back("home")}<h3>{newKind === "upi" ? "Pay to UPI ID" : "Pay to bank account"}</h3></div>
              <label className="phone-label">Name</label>
              <input className="phone-input" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Name on the account" />
              <label className="phone-label">{newKind === "upi" ? "UPI ID" : "Account number"}</label>
              <input className="phone-input" value={newId} maxLength={60} onChange={(e) => setNewId(e.target.value)} placeholder={newKind === "upi" ? "name@bank" : "e.g. 50100234567890"} />
              {newKind === "bank" && (
                <>
                  <label className="phone-label">IFSC</label>
                  <input className="phone-input" value={newIfsc} maxLength={11} onChange={(e) => setNewIfsc(e.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" />
                </>
              )}
              <p className="phone-small">New payee. Your bank checks who you are paying.</p>
              <button className="phone-btn primary" disabled={!newName.trim() || !newId.trim()}
                onClick={() => choosePayee(newPayee(newName, newKind === "bank" ? `${newId} · ${newIfsc}` : newId))}>Continue</button>
            </div>
          )}
          {screen === "scan" && (
            <div className="phone-screen center phone-scanning"><div className="phone-viewfinder"><Icon name="grid" size={46} /></div><h3>Scanning QR code…</h3><p>Point the camera at a QR code.</p></div>
          )}
          {screen === "amount" && payee && (
            <div className="phone-screen">
              <div className="phone-title">{back("home")}<h3>Paying {payee.name}</h3></div>
              <p className="phone-small center">{payee.handle}{payee.known ? " · paid before" : " · new payee"}</p>
              <div className="phone-amount-big">₹{amount ? Number(amount).toLocaleString("en-IN") : "0"}</div>
              <input className="phone-input" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (what is this for?)" />
              {keypad(key)}
              <button className="phone-btn primary" disabled={!amount} onClick={() => setScreen("review")}>Next</button>
            </div>
          )}
          {screen === "review" && payee && (
            <div className="phone-screen">
              <div className="phone-title">{back("amount")}<h3>Check and pay</h3></div>
              <div className="phone-review">
                <div><span>To</span><strong>{payee.name}</strong></div>
                <div><span>{payee.handle.includes("@") ? "UPI ID" : "Account"}</span><strong>{payee.handle}</strong></div>
                <div><span>Amount</span><strong>{pay}</strong></div>
                <div><span>From</span><strong>Savings ···· 4821</strong></div>
                <div><span>Note</span><strong>{note || "None"}</strong></div>
              </div>
              {error && <p className="phone-error">{error}</p>}
              <button className="phone-btn primary" onClick={() => { setPin(""); setScreen("pin"); }}>Pay {pay}</button>
            </div>
          )}
          {screen === "pin" && (
            <div className="phone-screen">
              <div className="phone-title">{back("review")}<h3>Enter UPI PIN</h3></div>
              <p className="phone-small center">Paying {pay} to {payee?.name}. Demo: any 4 digits.</p>
              <div className="phone-pin">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? "on" : ""} />)}</div>
              {keypad(pinKey)}
            </div>
          )}
          {screen === "checking" && (
            <div className="phone-screen center"><span className="spin big" /><h3>Processing</h3><p>This takes a few seconds.</p></div>
          )}
          {screen === "ask" && asked && (
            <div className="phone-screen">
              <div className="phone-badge ask"><Icon name="ask" size={18} /></div>
              <h3>One quick question</h3>
              <p>Before we send {pay}, please tell us:</p>
              <p className="phone-question">{asked.questions?.join(" ")}</p>
              <textarea className="phone-input" rows={3} maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="phone-btn primary" disabled={!reply.trim()} onClick={() => check(asked.questions, reply)}>Send answer</button>
              <button className="phone-btn" onClick={() => check(asked.questions, "")}>Skip</button>
            </div>
          )}
          {screen === "sent" && (
            <div className="phone-screen center"><div className="phone-badge allow"><Icon name="allow" size={26} /></div><h3>Payment sent</h3><p>{pay} to {payee?.name}.</p><button className="phone-btn" onClick={home}>Done</button></div>
          )}
          {screen === "warned" && decision && (
            <div className="phone-screen">
              <div className="phone-badge warn"><Icon name="warn" size={22} /></div>
              <h3>Please check before you send</h3>
              <p>{decision.customer_warning ?? "This payment looks unusual. Make sure you know who you are paying."}</p>
              <button className="phone-btn primary" onClick={() => setScreen("cancelled")}>Cancel payment</button>
              <button className="phone-btn" onClick={() => setScreen("sent")}>Send anyway</button>
            </div>
          )}
          {screen === "cancelled" && (
            <div className="phone-screen center"><div className="phone-badge allow"><Icon name="check" size={24} /></div><h3>Payment cancelled</h3><p>Your money has not moved.</p><button className="phone-btn" onClick={home}>Done</button></div>
          )}
          {screen === "held" && (
            <div className="phone-screen">
              <div className="phone-notice"><Icon name="bell" size={14} /> Your Bank · now</div>
              <h3>We've paused your payment to protect you</h3>
              <p>Your {pay} payment has not been sent. Please talk to our fraud team before it goes anywhere{reference ? <>, reference <strong className="mono">{reference}</strong></> : null}.</p>
              <p className="phone-small">We will never ask you to move money to keep it safe, or for your PIN or a one-time code.</p>
              {error && <p className="phone-error">{error}</p>}
              <button className="phone-btn primary" onClick={startCall}><Icon name="mic" size={15} /> Call fraud team</button>
              <button className="phone-btn" onClick={home}>Later</button>
            </div>
          )}
          {screen === "call" && (
            <div className="phone-screen phone-call">
              <div className="phone-caller"><span className="phone-avatar"><Icon name="shield" size={26} /></span><strong>Fraud desk</strong><small>AI agent · in this app</small></div>
              {phase === "connecting" && <p className="center">Connecting…</p>}
              {(phase === "speaking" || phase === "listening") && questions[current] && (
                <>
                  <p className="phone-question">{questions[current]}</p>
                  <p className={`phone-listening ${phase}`}>{phase === "speaking" ? "The agent is speaking…" : <><span className="dot" /> Listening… {hearing}</>}</p>
                </>
              )}
              {phase === "typing" && (
                <>
                  <p className="phone-small">Type your answers (voice needs Chrome or Edge and the microphone).</p>
                  {questions.map((question, index) => (
                    <div key={question}>
                      <p className="phone-question small">{question}</p>
                      <textarea className="phone-input" rows={2} maxLength={500} value={typed[index] ?? ""} onChange={(e) => setTyped(typed.map((t, i) => (i === index ? e.target.value : t)))} />
                    </div>
                  ))}
                  <button className="phone-btn primary" disabled={!typed.some((t) => t.trim())} onClick={() => finishCall(typed)}>Send answers</button>
                </>
              )}
              {phase === "checking" && <p className="center"><span className="spin" /> Checking your answers…</p>}
              {error && <p className="phone-error">{error}</p>}
            </div>
          )}
          {screen === "after" && (
            <div className="phone-screen center">
              <div className="phone-badge hold"><Icon name="hold" size={24} /></div>
              <h3>Thank you</h3>
              <p>Your payment stays paused while a specialist checks it. We will message you here. If someone is telling you what to say, end that call now.</p>
              <button className="phone-btn" onClick={home}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
