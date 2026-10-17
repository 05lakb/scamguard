import { useEffect, useRef, useState, type FormEvent } from "react";
import demo from "./data/demo.json";
import { addCaseNote, checkHealth, listSavedCases, saveDecision, type ArenaRecord, type CaseNote, type ConversationResult, type Health, type NoteKind, type Verification } from "./api";
import { CUSTOMER_CALL_EVENT } from "./components/HoldNotification";
import { Icon } from "./components/Icon";
import { Logo } from "./components/Logo";
import { ThemePicker, isTheme, type Theme } from "./components/ThemePicker";
import { caseFromArena, findByReference, mergeSaved, needsReview, noteTrailText, recordedCases, verificationTrailText, type CaseItem, type CaseStatus } from "./lib/cases";
import { NAV, type Page } from "./lib/pages";
import { STORY, STORY_PAUSE_MS } from "./lib/story";
import { Analyst } from "./pages/Analyst";
import { Analytics } from "./pages/Analytics";
import { Analyzer, type CaseContext } from "./pages/Analyzer";
import { Architecture } from "./pages/Architecture";
import { type FinishedCase, type Scenario } from "./pages/Console";
import { ConsoleArea } from "./pages/ConsoleArea";
import { Dashboard } from "./pages/Dashboard";
import { Evidence } from "./pages/Evidence";
import { Landing } from "./pages/Landing";
import { RiskProfile } from "./pages/RiskProfile";
import { VoiceAI } from "./pages/VoiceAI";
import type { ActiveCall } from "./components/VerificationPanel";


interface StoryState {
  index: number;
  nonce: number;
  phase: "running" | "showing" | "paused" | "done";
}

const scenarios = demo as Scenario[];
const PAGE_IDS = new Set<string>(NAV.map((entry) => entry.id));

const STATUS_TRAIL: Record<CaseStatus, string> = {
  open: "",
  approved: "Analyst approved the payment",
  held: "Analyst kept the payment on hold",
  escalated: "Analyst escalated the case",
};

const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Browser storage is a convenience only (remembered name and theme); the app works without it.
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep going */
  }
}

// The address bar mirrors the page (#/dashboard), so refresh and back/forward work.
function pageFromHash(): Page | null {
  const id = window.location.hash.replace(/^#\/?/, "");
  return PAGE_IDS.has(id) ? (id as Page) : null;
}

export function App() {
  const [theme, setTheme] = useState<Theme>(() => { const saved = load("ps-theme"); return isTheme(saved) ? saved : "charcoal"; });
  const [user, setUser] = useState<string | null>(load("ps-user"));
  const [page, setPageState] = useState<Page | null>(() => (load("ps-user") ? pageFromHash() : null));
  const [signIn, setSignIn] = useState<{ then: Page } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [cases, setCases] = useState<CaseItem[]>(recordedCases);
  const [voice, setVoice] = useState<ConversationResult[]>([]);
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [story, setStory] = useState<StoryState | null>(null);
  const counter = useRef(0);
  const [reviewCaseId, setReviewCaseId] = useState<string | null>(null);
  // A customer's call to the fraud desk, started on Transactions and taking place on the Voice AI page.
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  useEffect(() => { if (page !== "voice") setActiveCall(null); }, [page]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    save("ps-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onHash = () => setPageState(user ? pageFromHash() : null);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [user]);

  useEffect(() => {
    void refreshHealth();
    // Cases saved on the server (Firestore) join the queue, so it survives a refresh.
    void listSavedCases().then((saved) => setCases((old) => mergeSaved(old, saved)));
  }, []);

  // The customer pressed "Call fraud team" on a hold notification: log the call on that case.
  const casesNow = useRef(cases);
  casesNow.current = cases;
  useEffect(() => {
    const onCall = (event: Event) => {
      const reference = (event as CustomEvent<string>).detail;
      const found = findByReference(casesNow.current, reference);
      if (found) addNote(found.id, "call", `Customer called the fraud team quoting ${reference}`, "customer");
    };
    window.addEventListener(CUSTOMER_CALL_EVENT, onCall);
    return () => window.removeEventListener(CUSTOMER_CALL_EVENT, onCall);
  }, []);

  useEffect(() => {
    if (!story || story.phase !== "showing") return;
    const timer = setTimeout(() => setStory((current) => (current ? advance(current) : current)), STORY_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [story?.phase, story?.index, story?.nonce]);

  async function refreshHealth() {
    setHealth(undefined);
    setHealth(await checkHealth());
  }

  function setPage(next: Page | null) {
    setPageState(next);
    const hash = next ? `#/${next}` : "#";
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    window.scrollTo({ top: 0 });
  }

  function enter(target: Page = "dashboard") {
    if (user) setPage(target);
    else {
      setNameDraft("");
      setSignIn({ then: target });
    }
  }

  function completeSignIn(event: FormEvent) {
    event.preventDefault();
    const name = nameDraft.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name || !signIn) return;
    setUser(name);
    save("ps-user", name);
    const target = signIn.then;
    setSignIn(null);
    setPage(target);
  }

  function signOut() {
    setUser(null);
    save("ps-user", null);
    setStory(null);
    setPage(null);
  }

  function advance(current: StoryState): StoryState {
    return current.index + 1 < STORY.length
      ? { index: current.index + 1, nonce: current.nonce + 1, phase: "running" }
      : { ...current, phase: "done" };
  }

  function addCase(finished: FinishedCase, context?: CaseContext, source: CaseItem["source"] = "live"): string {
    counter.current += 1;
    const { decision, scenario } = finished;
    const now = clock();
    const trail = [{ when: now, text: "Synthetic payment assessed by the FastAPI backend" }];
    if (finished.questions) {
      trail.push({ when: now, text: "The engine asked the customer a question" });
      trail.push({ when: now, text: finished.answer ? "The customer answered" : "The customer declined to answer" });
    }
    if (decision.notice) trail.push({ when: now, text: decision.notice });
    trail.push({ when: now, text: `The engine decided: ${decision.action} (risk ${decision.score})` });
    const item: CaseItem = {
      id: `${source === "test" ? "TEST" : "TXN"}-${String(counter.current).padStart(3, "0")}`,
      title: scenario.title,
      source,
      when: now,
      amount: scenario.payment.amount,
      currency: scenario.payment.currency,
      payee: scenario.payment.payee_name,
      segment: scenario.customer.segment,
      message: finished.message,
      questions: finished.questions,
      answer: finished.answer,
      action: decision.action as CaseItem["action"],
      score: decision.score,
      reasons: decision.reasons,
      audit: decision.audit,
      execution: decision.execution,
      status: "open",
      trail,
      device: context?.device || undefined,
      location: context?.location || undefined,
      channel: context?.channel ?? scenario.payment.channel,
      timestamp: Date.now(),
      savedId: decision.execution?.saved ? decision.execution.request_id : undefined,
    };
    if (item.savedId) trail.splice(1, 0, { when: now, text: `Case saved ${storePlace}` });
    setCases((old) => [item, ...old]);
    setReviewCaseId(item.id);
    return item.id;
  }

  function addArenaCase(record: ArenaRecord) {
    counter.current += 1;
    const item = caseFromArena(record, counter.current, clock());
    if (item) setCases((old) => [item, ...old]);
  }

  const storePlace = health?.storage === "firestore" ? "to Firestore" : "on the server";

  function addTrail(id: string, text: string) {
    setCases((old) => old.map((item) => (item.id === id ? { ...item, trail: [...item.trail, { when: clock(), text }] } : item)));
  }

  // Adds to a case's call log, and saves it with the case on the server when the case was saved.
  function addNote(id: string, kind: NoteKind, text: string, author: string) {
    const note: CaseNote = { kind, text, author, at: new Date().toISOString() };
    setCases((old) => old.map((item) => (item.id === id
      ? { ...item, notes: [...(item.notes ?? []), note], trail: [...item.trail, { when: clock(), text: noteTrailText(note) }] }
      : item)));
    const savedId = casesNow.current.find((item) => item.id === id)?.savedId;
    if (savedId) {
      void addCaseNote(savedId, kind, text, author).then((ok) => {
        if (!ok) addTrail(id, "That call-log entry could not be saved on the server; it is kept on this page only");
      });
    }
  }

  // The customer spoke to the AI agent after a hold: the case keeps its decision, gains the call and the
  // agent's recommendation, and stays in the review queue until the analyst decides.
  function verified(id: string, verification: Verification) {
    if (!verification.outcome) return;
    setCases((old) => old.map((item) => (item.id === id
      ? { ...item, verification, trail: [...item.trail, { when: clock(), text: verificationTrailText(verification) }] }
      : item)));
  }

  function navButton(entry: (typeof NAV)[number]) {
    return (
      <button key={entry.id} className={page === entry.id ? "on" : ""} aria-current={page === entry.id ? "page" : undefined}
        onClick={(event) => {
          if (entry.id !== "lab") setStory(null);
          if (entry.id === "analyst") setFocus(null);
          event.currentTarget.closest("details")?.removeAttribute("open");
          setPage(entry.id);
        }}>
        <Icon name={entry.icon} size={15} /> {entry.label}
        {entry.id === "analyst" && pending > 0 && <span className="badge">{pending}</span>}
      </button>
    );
  }

  function decide(id: string, status: CaseStatus) {
    setCases((old) =>
      old.map((item) => (item.id === id ? { ...item, status, trail: [...item.trail, { when: clock(), text: STATUS_TRAIL[status] }] } : item)),
    );
    // Saved cases also keep the decision on the server, with the analyst's name, for the audit trail.
    const savedId = cases.find((item) => item.id === id)?.savedId;
    if (savedId && status !== "open") {
      void saveDecision(savedId, status, user ?? "analyst").then((ok) =>
        addTrail(id, ok ? `Decision saved ${storePlace}` : "The decision could not be saved on the server; it is kept on this page only"),
      );
    }
  }

  function openCase(id?: string) {
    if (id) setFocus({ id, nonce: Date.now() });
    else {
      const latest = cases.find((item) => item.source !== "recorded");
      setFocus(latest ? { id: latest.id, nonce: Date.now() } : null);
    }
    setPage("analyst");
  }

  function startStory() {
    setPage("lab");
    setStory({ index: 0, nonce: Date.now(), phase: "running" });
  }

  const step = story && story.phase !== "done" ? STORY[story.index] : null;
  const autoplay = step && story ? { scenarioId: step.scenarioId, autoAnswer: step.autoAnswer, nonce: story.nonce } : null;
  const pending = cases.filter((item) => item.source !== "recorded" && needsReview(item)).length;

  const dialog = signIn && (
    <div className="modal-back" role="presentation" onClick={() => setSignIn(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={(event) => event.stopPropagation()}>
        <Logo size={44} />
        <h2 id="signin-title">Get started</h2>
        <p>Enter your name to open the command centre. It only personalises the workspace and stays in this browser.</p>
        <form onSubmit={completeSignIn}>
          <div>
            <label className="f-label" htmlFor="analyst-name">Your name</label>
            <input id="analyst-name" className="f-input" autoFocus maxLength={40} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Enter your name" />
          </div>
          <button className="btn primary" type="submit" disabled={!nameDraft.trim()}>Continue <Icon name="arrow" size={16} /></button>
          <button className="btn" type="button" onClick={() => setSignIn(null)}>Cancel</button>
        </form>
      </div>
    </div>
  );

  if (!user || !page) {
    return (
      <>
        <Landing signedIn={Boolean(user)} enter={(target) => enter(target ?? "dashboard")} theme={theme} setTheme={setTheme} />
        {dialog}
      </>
    );
  }

  return (
    <div>
      <p className="proto-strip"><Icon name="flask" size={13} /> Prototype · synthetic data · no real payment is made · a person confirms every hold</p>
      <header className="topbar">
        <div className="topbar-inner">
        <button className="brand-mark" onClick={() => setPage("dashboard")} aria-label="Last Mile Guard dashboard">
          <Logo size={34} />
          <span><strong>Last Mile Guard</strong><small>Real-time fraud defence</small></span>
        </button>
        <nav className="topnav" aria-label="Command centre">
          {NAV.filter((entry) => entry.group === "use").map(navButton)}
          <span className="topnav-divider" aria-hidden="true" />
          <span className="topnav-prove" role="group" aria-label="Prove it">
            {NAV.filter((entry) => entry.group === "prove").map(navButton)}
          </span>
        </nav>
        <details className="topnav-more">
          <summary aria-label="More pages: Red Team, Evidence, How it's built">More</summary>
          <div className="topnav-more-menu">
            {NAV.filter((entry) => entry.group === "prove").map(navButton)}
          </div>
        </details>
        <div className="top-right">
          <button className="icon-btn" onClick={startStory} aria-label="Play the guided demo" title="Guided demo"><Icon name="play" size={15} /></button>
          <button className="icon-btn" onClick={() => openCase()} aria-label={`${pending} alerts awaiting review`} title="Alerts">
            <Icon name="bell" size={16} />{pending > 0 && <span className="ping" />}
          </button>
          <ThemePicker theme={theme} onChange={setTheme} />
          <span className="user-chip"><span className="avatar">{user.slice(0, 1).toUpperCase()}</span><span>{user}</span></span>
          <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button>
        </div>
        </div>
      </header>

      <main className="app-main">
        {page !== "dashboard" && <button className="back-link" onClick={() => setPage("dashboard")}><Icon name="back" size={12} /> Dashboard</button>}
        {page === "dashboard" && <Dashboard user={user} cases={cases} health={health} refresh={refreshHealth} goTo={(p) => setPage(p)} />}
        {page === "analyzer" && <Analyzer scenarios={scenarios} cases={cases} onCase={addCase} decide={decide} openCase={openCase}
          onStartCall={(call) => { setActiveCall(call); setPage("voice"); }} />}
        {page === "voice" && <VoiceAI onAnalysed={(result) => setVoice((old) => [result, ...old])} call={activeCall}
          onCallDone={(verification) => { if (activeCall) verified(activeCall.caseId, verification); }}
          onBackToPayment={() => { setActiveCall(null); setPage("analyzer"); }} />}
        {page === "profile" && <RiskProfile cases={cases} open={openCase} goAnalyze={() => setPage("analyzer")} />}
        {page === "analytics" && <Analytics cases={cases} voice={voice} health={health} refresh={refreshHealth} open={openCase} />}
        {page === "analyst" && <Analyst initialCaseId={reviewCaseId} focusId={focus} cases={cases} decide={decide} scenarios={scenarios} onTestCase={(finished) => addCase(finished, undefined, "test")} logCall={(id, reference) => addTrail(id, `Analyst opened the case from the caller's reference ${reference}`)} addNote={(id, kind, text) => addNote(id, kind, text, user ?? "analyst")} />}
        {page === "lab" && (
          <>
            <header className="page-head"><div><p className="kicker live"><span className="dot" /> Prove it · live test</p><h1>Red <span className="grad">Team</span></h1><p className="page-sub">Watch generated scams attack the live engine, try one case step by step, or write your own scenario.</p></div><div className="page-head-side"><button className="btn small primary" onClick={startStory}><Icon name="play" size={14} /> Guided demo</button></div></header>
            {story && (
              <aside className="story story-docked" role="region" aria-label="Guided demo" aria-live="polite">
                {step ? (
                  <>
                    <div className="story-text">
                      <span className="eyebrow">Step {story.index + 1} of {STORY.length}</span>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </div>
                    <div className="story-controls">
                      <button className="ghost small-btn" aria-label="Previous step" disabled={story.index === 0} onClick={() => setStory({ index: story.index - 1, nonce: Date.now(), phase: "running" })}><Icon name="back" size={14} /></button>
                      {story.phase === "paused" ? (
                        <button className="ghost small-btn" onClick={() => setStory({ ...story, phase: "showing" })}><Icon name="play" size={14} /> Resume</button>
                      ) : (
                        <button className="ghost small-btn" onClick={() => setStory({ ...story, phase: "paused" })}><Icon name="pause" size={14} /> Pause</button>
                      )}
                      <button className="ghost small-btn" aria-label="Next step" onClick={() => setStory((current) => (current ? advance(current) : current))}><Icon name="next" size={14} /></button>
                      <button className="ghost small-btn" aria-label="Close the guided demo" onClick={() => setStory(null)}><Icon name="close" size={14} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="story-text">
                      <span className="eyebrow">The end</span>
                      <strong>That is Last Mile Guard</strong>
                      <p>Payment behaviour, scam signals and account links inform a recommendation before money moves. A person stays in charge of every hold.</p>
                    </div>
                    <div className="story-controls">
                      <button className="ghost small-btn" onClick={() => { setStory(null); setPage("analytics"); }}>See the analytics</button>
                      <button className="ghost small-btn" onClick={() => setStory(null)}>Close</button>
                    </div>
                  </>
                )}
              </aside>
            )}
            <ConsoleArea onReview={() => { setStory(null); openCase(); }} scenarios={scenarios} onCase={(finished) => { addCase(finished); }} onArenaCase={addArenaCase} autoplay={autoplay} onFinished={() => { setStory((current) => (current && current.phase === "running" ? { ...current, phase: "showing" } : current)); }} />
          </>
        )}
        {page === "evidence" && <Evidence />}
        {page === "architecture" && <Architecture health={health} />}
      </main>

      <footer className="app-foot">
        <span>Last Mile Guard · fraud intelligence command centre</span>
        <span className="chip-row">
          <button className="btn link small" onClick={() => setPage("evidence")}>Evidence</button>
          <button className="btn link small" onClick={() => setPage("architecture")}>How it's built</button>
          <span>Recommendations only · synthetic data</span>
        </span>
      </footer>

      {dialog}
    </div>
  );
}
