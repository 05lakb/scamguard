import { useEffect, useRef, useState } from "react";
import demo from "./data/demo.json";
import { Icon } from "./components/Icon";
import { Logo } from "./components/Logo";
import type { ArenaRecord } from "./api";
import { caseFromArena, recordedCases, type CaseItem, type CaseStatus } from "./lib/cases";
import { STORY, STORY_PAUSE_MS } from "./lib/story";
import { Analyst } from "./pages/Analyst";
import { Architecture } from "./pages/Architecture";
import { type FinishedCase, type Scenario } from "./pages/Console";
import { ConsoleArea } from "./pages/ConsoleArea";
import { Evidence } from "./pages/Evidence";
import { Overview } from "./pages/Overview";

type Page = "overview" | "console" | "analyst" | "evidence" | "architecture";
type Theme = "system" | "light" | "dark";

interface StoryState {
  index: number;
  nonce: number;
  phase: "running" | "showing" | "paused" | "done";
}

const scenarios = demo as Scenario[];

const PAGES: { id: Page; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "console", label: "Live console" },
  { id: "analyst", label: "Analyst queue" },
  { id: "evidence", label: "Evidence" },
  { id: "architecture", label: "Architecture" },
];

const THEME_NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

const STATUS_TRAIL: Record<CaseStatus, string> = {
  open: "",
  approved: "Analyst approved the payment",
  held: "Analyst kept the payment on hold",
  escalated: "Analyst escalated the case",
};

const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [theme, setTheme] = useState<Theme>("system");
  const [cases, setCases] = useState<CaseItem[]>(recordedCases);
  const [story, setStory] = useState<StoryState | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!story || story.phase !== "showing") return;
    const timer = setTimeout(() => setStory((current) => (current ? advance(current) : current)), STORY_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [story?.phase, story?.index, story?.nonce]);

  function advance(current: StoryState): StoryState {
    return current.index + 1 < STORY.length
      ? { index: current.index + 1, nonce: current.nonce + 1, phase: "running" }
      : { ...current, phase: "done" };
  }

  function addCase(finished: FinishedCase) {
    counter.current += 1;
    const { decision, scenario } = finished;
    const now = clock();
    const trail = [{ when: now, text: "Payment received" }];
    if (finished.questions) {
      trail.push({ when: now, text: "The guard asked the customer a question" });
      trail.push({ when: now, text: finished.answer ? "The customer answered" : "The customer declined to answer" });
    }
    trail.push({ when: now, text: `The guard decided: ${decision.action} (risk ${decision.score})` });
    const item: CaseItem = {
      id: `LIVE-${String(counter.current).padStart(3, "0")}`,
      title: scenario.title,
      source: "live",
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
      status: "open",
      trail,
    };
    setCases((old) => [item, ...old]);
  }

  function addArenaCase(record: ArenaRecord) {
    counter.current += 1;
    const item = caseFromArena(record, counter.current, clock());
    if (item) setCases((old) => [item, ...old]);
  }

  function decide(id: string, status: CaseStatus) {
    setCases((old) =>
      old.map((item) =>
        item.id === id ? { ...item, status, trail: [...item.trail, { when: clock(), text: STATUS_TRAIL[status] }] } : item,
      ),
    );
  }

  function startStory() {
    setPage("console");
    setStory({ index: 0, nonce: Date.now(), phase: "running" });
  }

  const step = story && story.phase !== "done" ? STORY[story.index] : null;
  const autoplay = step && story ? { scenarioId: step.scenarioId, autoAnswer: step.autoAnswer, nonce: story.nonce } : null;

  return (
    <div className={`shell ${story ? "with-story" : ""}`}>
      <p className="banner">
        <Icon name="flask" size={14} /> Prototype preview · Made-up data · No real payment is made
      </p>
      <header className="top">
        <button className="brand" onClick={() => setPage("overview")} aria-label="FinGuard AI, go to the overview">
          <Logo size={38} />
          <span>
            <strong>FinGuard AI</strong>
            <small>Financial crime prevention</small>
          </span>
        </button>
        <nav aria-label="Sections">
          {PAGES.map((entry) => (
            <button key={entry.id} className={`tab ${page === entry.id ? "on" : ""}`} aria-current={page === entry.id ? "page" : undefined} onClick={() => setPage(entry.id)}>
              {entry.label}
              {entry.id === "analyst" && cases.some((item) => item.source !== "recorded") && <span className="count mono">{cases.filter((item) => item.source !== "recorded").length}</span>}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="ghost small-btn" onClick={startStory}><Icon name="play" size={14} /> 90-second story</button>
          <button className="icon-button" onClick={() => setTheme(THEME_NEXT[theme])} aria-label={`Colour theme: ${theme}. Press to change.`} title={`Theme: ${theme}`}>
            <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "auto"} size={18} />
          </button>
        </div>
      </header>

      <main>
        {page === "overview" && <Overview tryLive={() => setPage("console")} playStory={startStory} goTo={setPage} />}
        {page === "console" && <ConsoleArea scenarios={scenarios} onCase={addCase} onArenaCase={addArenaCase} autoplay={autoplay} onFinished={() => setStory((current) => (current && current.phase === "running" ? { ...current, phase: "showing" } : current))} />}
        {page === "analyst" && <Analyst cases={cases} decide={decide} />}
        {page === "evidence" && <Evidence />}
        {page === "architecture" && <Architecture />}
      </main>

      <footer className="foot">FinGuard AI · built for the Google Cloud AI Builder Cup 2026 · BFSI track</footer>

      {story && (
        <aside className="story" role="region" aria-label="Guided story" aria-live="polite">
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
                <button className="ghost small-btn" aria-label="Close the story" onClick={() => setStory(null)}><Icon name="close" size={14} /></button>
              </div>
            </>
          ) : (
            <>
              <div className="story-text">
                <span className="eyebrow">The end</span>
                <strong>That is FinGuard AI</strong>
                <p>Payment behaviour, scam signals, and synthetic account links inform a recommendation before money moves. A person stays in charge of every hold. The Evidence page shows what we tested and fixed.</p>
              </div>
              <div className="story-controls">
                <button className="ghost small-btn" onClick={() => { setStory(null); setPage("evidence"); }}>See the evidence</button>
                <button className="ghost small-btn" onClick={() => setStory(null)}>Close</button>
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
