// The shape of a case in the analyst queue, plus the recorded cases it starts with.

import seed from "../data/analyst_seed.json";
import type { ArenaRecord, ServerDecision } from "../api";

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
  parts?: { payment: number; message: number };
  status: CaseStatus;
  trail: { when: string; text: string }[];
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
