// The shape of a case in the analyst queue, plus the recorded cases it starts with.

import seed from "../data/analyst_seed.json";
import type { ArenaRecord, SavedCase, ServerDecision } from "../api";

export type CaseStatus = "open" | "approved" | "held" | "escalated";

export interface CaseItem {
  id: string;
  title: string;
  source: "recorded" | "live" | "test";
  when: string;
  amount: number;
  currency: string;
  payee: string;
  segment: string;
  message: string | null;
  questions?: string[];
  answer?: string;
  action: "allow" | "warn" | "hold";
  score: number;
  reasons: string[];
  audit?: ServerDecision["audit"];
  execution?: ServerDecision["execution"];
  parts?: { payment: number; message: number };
  status: CaseStatus;
  trail: { when: string; text: string }[];
  // The server's id for this case, when it was saved; analyst decisions are saved under it.
  savedId?: string;
  // Context captured by the Transaction Analyzer (optional for other sources).
  device?: string;
  location?: string;
  channel?: string;
  timestamp?: number;
}

interface SeedRow {
  id: string;
  title: string;
  minutes_ago: number;
  amount: number;
  currency: string;
  payee_name: string;
  segment: string;
  message: string;
  action: string;
  score: number;
  reasons: string[];
  behaviour_score: number;
  message_points: number;
}

export function recordedCases(): CaseItem[] {
  return (seed as SeedRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    source: "recorded" as const,
    when: `${row.minutes_ago} min ago`,
    amount: row.amount,
    currency: row.currency,
    payee: row.payee_name,
    segment: row.segment,
    message: row.message,
    action: row.action as CaseItem["action"],
    score: row.score,
    reasons: row.reasons,
    parts: { payment: row.behaviour_score, message: row.message_points },
    status: "open" as const,
    trail: [{ when: `${row.minutes_ago} min ago`, text: `The guard decided: ${row.action}` }],
  }));
}

export const needsReview = (item: CaseItem) => item.action !== "allow" && item.status === "open";

export const KIND_LABEL: Record<string, string> = {
  obvious_scam: "Obvious scam",
  quiet_scam: "Quiet scam",
  coached_victim: "Coached victim",
  contradiction: "Contradicting answers",
  refusal: "Refuses to answer",
  split_payments: "Repeated payments",
  injection: "Hidden order to the checker",
  obvious_legit: "Everyday genuine payment",
  mixed_signal_legit: "Genuine but scary-sounding",
  real_obvious: "Public-report scam (obvious)",
  real_quiet: "Public-report scam (quiet)",
  real_coached: "Public-report scam (coached)",
  custom: "Your own scenario",
};

export const sourceLabel = (source: CaseItem["source"]) =>
  source === "live" ? "Live" : source === "test" ? "Test run" : "Recorded";

// Turns one finished red-team scenario into a case for the analyst queue.
export function caseFromArena(record: ArenaRecord, number: number, now: string): CaseItem | null {
  if (record.error || !record.final_action) return null;
  const trail = [
    { when: now, text: "Payment received from a simulated customer" },
    { when: now, text: `Scenario: ${KIND_LABEL[record.category] ?? record.category}` },
  ];
  if (record.questions) {
    trail.push({ when: now, text: "The guard asked the customer a question" });
    trail.push({ when: now, text: "The simulated customer answered" });
  }
  trail.push({ when: now, text: `The guard decided: ${record.final_action} (risk ${record.score ?? 0})` });
  return {
    id: `TEST-${String(number).padStart(3, "0")}`,
    title: `${KIND_LABEL[record.category] ?? record.category} (red team)`,
    source: "test",
    when: now,
    amount: record.amount,
    currency: record.currency,
    payee: record.payee,
    segment: record.segment,
    message: record.note,
    questions: record.questions ?? undefined,
    answer: record.answer ?? undefined,
    action: record.final_action,
    score: record.score ?? 0,
    reasons: record.reasons ?? [],
    status: "open",
    trail,
  };
}

const STATUS_TEXT: Record<CaseStatus, string> = {
  open: "",
  approved: "Analyst approved the payment",
  held: "Analyst kept the payment on hold",
  escalated: "Analyst escalated the case",
};

const timeOf = (iso: string | undefined) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "earlier";
};

// Turns a case saved on the server (Firestore) back into a case for the analyst queue.
export function caseFromSaved(saved: SavedCase): CaseItem {
  const when = timeOf(saved.created_at);
  const trail = [
    { when, text: "Synthetic payment assessed by the FastAPI backend" },
    { when, text: "Case loaded from the server's saved cases" },
  ];
  if (saved.questions?.length) {
    trail.push({ when, text: "The engine asked the customer a question" });
    trail.push({ when, text: saved.answer ? "The customer answered" : "The customer declined to answer" });
  }
  trail.push({ when, text: `The engine decided: ${saved.action} (risk ${saved.score})` });
  for (const decision of saved.decisions ?? []) {
    trail.push({ when: timeOf(decision.at), text: `${STATUS_TEXT[decision.status]} (${decision.analyst})` });
  }
  const created = new Date(saved.created_at).getTime();
  return {
    id: `SAVED-${saved.id.slice(0, 6).toUpperCase()}`,
    title: `Saved case: ${saved.payment.payee_name}`,
    source: "live",
    when,
    amount: saved.payment.amount,
    currency: saved.payment.currency,
    payee: saved.payment.payee_name,
    segment: saved.customer.segment,
    message: saved.message,
    questions: saved.questions ?? undefined,
    answer: saved.answer ?? undefined,
    action: saved.action,
    score: saved.score,
    reasons: saved.reasons,
    audit: saved.audit,
    execution: saved.execution,
    status: saved.status,
    trail,
    channel: saved.payment.channel,
    timestamp: Number.isNaN(created) ? undefined : created,
    savedId: saved.id,
  };
}

// Adds saved cases the page does not already show (matched by the server's id).
// Order: this session's cases, then saved cases (newest first), then the recorded examples.
export function mergeSaved(current: CaseItem[], saved: SavedCase[]): CaseItem[] {
  const known = new Set(current.map((item) => item.savedId ?? item.execution?.request_id).filter(Boolean));
  const fresh = saved.filter((item) => !known.has(item.id)).map(caseFromSaved);
  if (!fresh.length) return current;
  return [...current.filter((item) => item.source !== "recorded"), ...fresh, ...current.filter((item) => item.source === "recorded")];
}

// ---------- case references for call-backs ----------
// When a payment is held, the customer is told to call the bank and quote this reference.
// It only finds the case: the analyst still confirms who is calling the bank's usual way.

export function caseReference(requestId: string | null | undefined): string | null {
  return requestId && /^[0-9a-f]{6,}$/i.test(requestId) ? `LMG-${requestId.slice(0, 6).toUpperCase()}` : null;
}

export const referenceOf = (item: CaseItem) => caseReference(item.savedId ?? item.execution?.request_id);

// Finds a case by the reference the customer quotes ("LMG-7F3A2C", "lmg 7f3a2c" or "7F3A2C"), or by its queue id.
export function findByReference(cases: CaseItem[], typed: string): CaseItem | null {
  const wanted = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (wanted.length < 4) return null;
  const code = wanted.startsWith("LMG") ? wanted.slice(3) : wanted;
  return (
    cases.find((item) => referenceOf(item)?.replace("-", "") === `LMG${code}`) ??
    cases.find((item) => item.id.toUpperCase().replace(/[^A-Z0-9]/g, "") === wanted) ??
    null
  );
}
