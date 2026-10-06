// The shape of a case in the analyst queue, plus the recorded cases it starts with.

import seed from "../data/analyst_seed.json";
import type { ServerDecision } from "../api";

export type CaseStatus = "open" | "approved" | "held" | "escalated";

export interface CaseItem {
  id: string;
  title: string;
  source: "recorded" | "live";
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
