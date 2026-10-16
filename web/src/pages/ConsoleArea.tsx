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
  onReview: () => void;
}

export function ConsoleArea({ scenarios, onCase, onArenaCase, autoplay, onFinished, onReview }: Props) {
  const [mode, setMode] = useState<"single" | "arena">("single");
  const shown = autoplay ? "single" : mode;
  return <div>
    <header className="simple-demo-heading"><div><h1>{shown === "single" ? "See a payment check, from start to finish." : "Test Last Mile Guard against generated cases."}</h1>
      <p className="muted">{shown === "single" ? "Choose a case, watch the checks, then review the recommendation." : "Advanced testing with synthetic scam and genuine-payment scenarios."}</p></div>
      <button className="ghost small-btn" onClick={() => setMode(shown === "single" ? "arena" : "single")} disabled={Boolean(autoplay)}>{shown === "single" ? "Advanced: red-team tests" : "Back to payment demo"}</button>
    </header>
    <div hidden={shown !== "single"}><Console scenarios={scenarios} onCase={onCase} autoplay={autoplay} onFinished={onFinished} onReview={onReview} /></div>
    <div hidden={shown !== "arena"}><Arena onCase={onArenaCase} /></div>
  </div>;
}
