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
}

type Mode = "single" | "arena" | "custom";

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "Try one case" },
  { id: "arena", label: "Watch the red team" },
  { id: "custom", label: "Your own scenario" },
];

// The Live console has three modes: try one case by hand, watch the red team attack the guard,
// or describe your own made-up scenario and watch the red agent play it.
export function ConsoleArea({ scenarios, onCase, onArenaCase, autoplay, onFinished }: Props) {
  const [mode, setMode] = useState<Mode>("single");
  const shown = autoplay ? "single" : mode; // the guided story always uses the single-case view

  return (
    <div>
      <div className="seg" role="tablist" aria-label="Live console mode">
        {MODES.map((item) => (
          <button key={item.id} role="tab" aria-selected={shown === item.id} className={shown === item.id ? "on" : ""} onClick={() => setMode(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div hidden={shown !== "single"}>
        <Console scenarios={scenarios} onCase={onCase} autoplay={autoplay} onFinished={onFinished} />
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
