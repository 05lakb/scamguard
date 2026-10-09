// The timing of the "red agent versus bank guard" stage.
// Each finished test case is replayed as a short scene: the red agent prepares its case, sends its note,
// the guard works through its checks, may ask a question, and then the decision lands.
// All times are in milliseconds. The scene is worked out from the time that has passed, so it is easy to test.

import type { ArenaRecord } from "../api";

export const PREP_LINES = 4; // lines of the made-up case that appear one by one
export const CHECKS = ["Payment behaviour", "Last 15 days", "Reading the message", "Matching scam patterns"];

const PREP_STEP = 450;
const SEND_TIME = 1000;
const CHECK_STEP = 550;
const QUESTION_TIME = 1300;
const ANSWER_TIME = 1300;
const RECHECK_TIME = 1000;
const VERDICT_HOLD = 1900;

export type Step = "prepare" | "attack" | "analyse" | "decide";

export interface Schedule {
  sendAt: number;
  firstCheckAt: number;
  questionAt: number | null;
  answerAt: number | null;
  verdictAt: number;
  end: number;
}

export interface SceneView {
  step: Step;
  lines: number;
  noteShown: boolean;
  checks: number;
  questionShown: boolean;
  answerShown: boolean;
  verdictShown: boolean;
}

export const asked = (record: ArenaRecord) => Boolean(record.questions?.length);

export function scheduleOf(record: ArenaRecord): Schedule {
  const sendAt = PREP_LINES * PREP_STEP;
  const firstCheckAt = sendAt + SEND_TIME;
  const checksDone = firstCheckAt + CHECKS.length * CHECK_STEP;
  if (!asked(record)) {
    return { sendAt, firstCheckAt, questionAt: null, answerAt: null, verdictAt: checksDone, end: checksDone + VERDICT_HOLD };
  }
  const questionAt = checksDone;
  const answerAt = questionAt + QUESTION_TIME;
  const verdictAt = answerAt + ANSWER_TIME + RECHECK_TIME;
  return { sendAt, firstCheckAt, questionAt, answerAt, verdictAt, end: verdictAt + VERDICT_HOLD };
}

export function viewAt(record: ArenaRecord, time: number): SceneView {
  const plan = scheduleOf(record);
  const checks = Math.max(0, Math.min(CHECKS.length, Math.floor((time - plan.firstCheckAt) / CHECK_STEP) + 1));
  const verdictShown = time >= plan.verdictAt;
  let step: Step = "prepare";
  if (verdictShown) step = "decide";
  else if (time >= plan.firstCheckAt) step = "analyse";
  else if (time >= plan.sendAt) step = "attack";
  return {
    step,
    lines: Math.max(0, Math.min(PREP_LINES, Math.floor(time / PREP_STEP) + 1)),
    noteShown: time >= plan.sendAt,
    checks,
    questionShown: plan.questionAt !== null && time >= plan.questionAt,
    answerShown: plan.answerAt !== null && time >= plan.answerAt,
    verdictShown,
  };
}

// How a finished case turned out, in plain words.
export type Verdict = "good" | "miss" | "error" | "unsure";

export const verdictOf = (record: ArenaRecord): Verdict =>
  record.error ? "error" : record.ok === true ? "good" : record.ok === false ? "miss" : "unsure";

export const VERDICT_TEXT: Record<Verdict, string> = {
  good: "As expected",
  miss: "Missed",
  error: "Error",
  unsure: "Not reliable",
};

// One sentence for the end of a scene.
export function outcomeSentence(record: ArenaRecord): string {
  if (record.error) return "The guard could not finish this call.";
  const stopped = record.final_action !== "allow";
  if (record.label === "scam") {
    return stopped ? "Scam stopped before any money moved." : "This scam slipped through. The honest picture, not a fault in the demo.";
  }
  return stopped ? "A genuine customer was slowed down." : "A genuine payment went straight through.";
}

// A link to the public page a case was modelled on. Only the two named websites are ever linked.
const LINKABLE = ["https://consumer.ftc.gov/", "https://www.scamwatch.gov.au/"];

export function sourceLink(reference?: { url?: string } | null): string | null {
  const url = reference?.url ?? "";
  return LINKABLE.some((start) => url.startsWith(start)) ? url : null;
}
