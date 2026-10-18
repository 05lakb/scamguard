// The customer app and the bank's dashboard run in separate windows of the same browser.
// The customer app announces each step of a payment here, and the dashboard's Transactions page shows it live.

import type { AssessmentEvent, AssessmentStage, ServerDecision, Verification } from "../api";
import type { Form } from "../pages/Analyzer";

export type LiveMessage =
  | { type: "payment"; run: string; form: Form }
  | { type: "stage"; run: string; event: AssessmentEvent }
  | { type: "asked"; run: string; decision: ServerDecision }
  | { type: "answered"; run: string; answer: string }
  | { type: "result"; run: string; decision: ServerDecision; questions?: string[]; answer?: string }
  | { type: "call"; run: string; questions: string[]; answers: string[] }
  | { type: "verified"; run: string; verification: Verification };

// What the dashboard knows about the payment in progress on the customer's phone.
export interface LiveRun {
  run: string;
  form: Form;
  stages: Partial<Record<AssessmentStage, AssessmentEvent>>;
  asked: ServerDecision | null;
  answer: string | null;
  result: ServerDecision | null;
  caseId: string | null;
  call: { questions: string[]; answers: string[] } | null;
}

const NAME = "lmg-live";

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
  } catch {
    return null;
  }
}

let sender: BroadcastChannel | null | undefined;

export function publish(message: LiveMessage) {
  if (sender === undefined) sender = channel();
  sender?.postMessage(message);
}

export function subscribe(listener: (message: LiveMessage) => void): () => void {
  const receiver = channel();
  if (!receiver) return () => {};
  receiver.onmessage = (event: MessageEvent<LiveMessage>) => listener(event.data);
  return () => receiver.close();
}

export const newRun = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// Applies one message to the run in progress. A new payment starts a new run; messages for other runs are ignored.
export function applyLive(current: LiveRun | null, message: LiveMessage): LiveRun | null {
  if (message.type === "payment") {
    return { run: message.run, form: message.form, stages: {}, asked: null, answer: null, result: null, caseId: null, call: null };
  }
  if (!current || current.run !== message.run) return current;
  switch (message.type) {
    case "stage": return { ...current, stages: { ...current.stages, [message.event.stage]: message.event } };
    case "asked": return { ...current, asked: message.decision };
    case "answered": return { ...current, answer: message.answer, stages: {} };
    case "result": return { ...current, result: message.decision };
    case "call": return { ...current, call: { questions: message.questions, answers: message.answers } };
    default: return current;
  }
}
