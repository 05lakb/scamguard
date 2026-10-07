import { useState } from "react";
import type { ArenaRecord } from "../api";
import { Arena } from "./Arena";
import { Console, type Autoplay, type FinishedCase, type Scenario } from "./Console";

interface Props {
  scenarios: Scenario[];
  onCase: (item: FinishedCase) => void;
  onArenaCase: (record: ArenaRecord, number: number) => void;
  autoplay: Autoplay | null;
  onFinished: () => void;
}

// The Live console has two modes: try one case by hand, or watch the red team attack the guard.
export function ConsoleArea({ scenarios, onCase, onArenaCase, autoplay, onFinished }: Props) {
  const [mode, setMode] = useState<"single" | "arena">("single");
  const shown = autoplay ? "single" : mode; // the guided story always uses the single-case view

  return (
    <div>
      <div className="seg" role="tablist" aria-label="Live console mode">
        <button role="tab" aria-selected={shown === "single"} className={shown === "single" ? "on" : ""} onClick={() => setMode("single")}>
          Try one case
        </button>
        <button role="tab" aria-selected={shown === "arena"} className={shown === "arena" ? "on" : ""} onClick={() => setMode("arena")}>
          Watch the red team
        </button>
      </div>
      <div hidden={shown !== "single"}>
        <Console scenarios={scenarios} onCase={onCase} autoplay={autoplay} onFinished={onFinished} />
      </div>
      <div hidden={shown !== "arena"}>
        <Arena onCase={onArenaCase} />
      </div>
    </div>
  );
}
