// The two characters on the stage, drawn as plain SVG so nothing is loaded from outside.
// The red agent plays the customer in a scam test. The guard is the bank's trusted checker.
// Their faces change a little with the mood, and the page styles add the movement.

export type RedMood = "idle" | "prepare" | "attack" | "caught" | "slipped";
export type GuardMood = "calm" | "scan" | "alert" | "relief";

const RED_MOUTH: Record<RedMood, string> = {
  idle: "M29 51 Q38 49 47 51",
  prepare: "M29 51 Q38 47 47 51",
  attack: "M28 50 Q38 46 48 50",
  caught: "M29 54 Q38 47 47 54",
  slipped: "M27 48 Q38 57 49 48",
};

const GUARD_MOUTH: Record<GuardMood, string> = {
  calm: "M29 41 Q38 48 47 41",
  scan: "M31 43 H45",
  alert: "M31 44 Q38 41 45 44",
  relief: "M28 40 Q38 50 48 40",
};

export function RedAgent({ mood }: { mood: RedMood }) {
  return (
    <svg className={`agent red ${mood}`} width="96" height="96" viewBox="0 0 76 76" aria-hidden="true" focusable="false">
      <polygon className="agent-body" points="38,6 66,22 66,54 38,70 10,54 10,22" strokeWidth="2.5" strokeLinejoin="round" />
      <polygon className="agent-hood" points="38,6 66,22 10,22" strokeWidth="2.5" strokeLinejoin="round" />
      <line className="agent-line" x1="23" y1="33" x2="33" y2="37" strokeWidth="3" strokeLinecap="round" />
      <line className="agent-line" x1="53" y1="33" x2="43" y2="37" strokeWidth="3" strokeLinecap="round" />
      <circle className="agent-eye" cx="30" cy="41" r="2.4" />
      <circle className="agent-eye" cx="46" cy="41" r="2.4" />
      <path className="agent-line" d={RED_MOUTH[mood]} fill="none" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function GuardAgent({ mood }: { mood: GuardMood }) {
  return (
    <svg className={`agent guard ${mood}`} width="96" height="96" viewBox="0 0 76 76" aria-hidden="true" focusable="false">
      <circle className="agent-ring" cx="38" cy="38" r="34" fill="none" strokeWidth="1.5" strokeDasharray="3 5" />
      <path
        className="agent-body"
        d="M38 9 L60 17 V37 C60 51 51 60 38 67 C25 60 16 51 16 37 V17 Z"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle className="agent-eye" cx="31" cy="30" r="2.6" />
      <circle className="agent-eye" cx="45" cy="30" r="2.6" />
      <path className="agent-line" d={GUARD_MOUTH[mood]} fill="none" strokeWidth="2.5" strokeLinecap="round" />
      <path className="agent-check" d="M30 52 L36 57 L47 47" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
