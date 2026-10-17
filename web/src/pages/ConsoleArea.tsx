import { useState } from "react";
import type { ArenaRecord } from "../api";
import { Arena } from "./Arena";
import { Console, type Autoplay, type FinishedCase, type Scenario } from "./Console";
import { Custom } from "./Custom";

interface Props {
  scenarios: Scenario[];
  onCase: (item: FinishedCase) => void;
  onArenaCase: (record: ArenaRecord, number: number) => void;
  autoplay: Autoplay | null;
  onFinished: () => void;
  onReview: () => void;
}

type Mode = "single" | "arena" | "custom";

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "Try one case" },
  { id: "arena", label: "Watch the red team" },
  { id: "custom", label: "Your own scenario" },
];

const HEADING: Record<Mode, { title: string; text: string }> = {
  single: { title: "See a payment check, from start to finish.", text: "Choose a case, watch the checks, then review the recommendation." },
  arena: { title: "Red team: new scams against the guard, live.", text: "Gemini invents scam and genuine customers the guard has never seen and plays them against it. Each result shows caught, missed or false alarm." },
  custom: { title: "Describe your own scenario.", text: "Write any story, real or imagined, and watch the red agent play it against the guard." },
};

// The Live console has three modes: try one case by hand, watch the red team attack the guard,
// or describe your own scenario and watch the red agent play it.
export function ConsoleArea({ scenarios, onCase, onArenaCase, autoplay, onFinished, onReview }: Props) {
  const [mode, setMode] = useState<Mode>("arena"); // Red Team opens on the red-team run; the guided demo uses "single"
  const shown: Mode = autoplay ? "single" : mode; // the guided story always uses the single-case view

  return (
    <div>
      <header className="simple-demo-heading">
        <div>
          <h1>{HEADING[shown].title}</h1>
          <p className="muted">{HEADING[shown].text}</p>
        </div>
      </header>
      <div className="seg" role="tablist" aria-label="Live console mode">
        {MODES.map((item) => (
          <button key={item.id} role="tab" aria-selected={shown === item.id} className={shown === item.id ? "on" : ""} disabled={Boolean(autoplay)} onClick={() => setMode(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div hidden={shown !== "single"}>
        <Console scenarios={scenarios} onCase={onCase} autoplay={autoplay} onFinished={onFinished} onReview={onReview} />
      </div>
      <div hidden={shown !== "arena"}>
        <Arena onCase={onArenaCase} />
      </div>
      <div hidden={shown !== "custom"}>
        <Custom />
      </div>
    </div>
  );
}
