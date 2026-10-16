// Turns the cases assessed in this browser session into the numbers the dashboards show.
// Everything here is computed from real assessment results; nothing is invented.

import type { CaseItem } from "./cases";
import { networkLabel, SIGNAL_LABEL } from "./labels";

export type Level = "high" | "medium" | "low";

export const levelOf = (score: number): Level => (score >= 70 ? "high" : score >= 40 ? "medium" : "low");

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };

export function money(amount: number, currency: string): string {
  const symbol = SYMBOL[currency];
  const text = amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return symbol ? `${symbol}${text}` : `${text} ${currency}`;
}

export interface Insights {
  total: number;
  hold: number;
  warn: number;
  allow: number;
  levels: Record<Level, number>;
  averageScore: number;
  needsReview: number;
  reviewed: number;
  confirmed: number; // analyst kept on hold or escalated
  falsePositives: number; // analyst approved a flagged payment
  falsePositiveRate: number; // percent of reviewed flagged cases that were approved
  atRisk: string; // money in flagged payments, per currency
  topSignals: { label: string; count: number }[];
}

// The reasons behind a case, as short labels. Uses the full audit when the case has one.
export function signalsOf(item: CaseItem): string[] {
  const audit = item.audit;
  if (audit) {
    const labels = audit.behaviour_signals.map((signal) => SIGNAL_LABEL[signal.name] ?? signal.name.replaceAll("_", " "));
    for (const signal of audit.network_signals ?? []) labels.push(`MuleNet: ${networkLabel(signal.name)}`);
    const reading = audit.message_reading;
    if (reading && audit.message_points > 0) {
      for (const tactic of reading.tactics) if (tactic !== "none") labels.push(`Scam tactic: ${tactic.replaceAll("_", " ")}`);
    }
    return labels;
  }
  return item.reasons;
}

export function insights(cases: CaseItem[]): Insights {
  const total = cases.length;
  const count = (test: (item: CaseItem) => boolean) => cases.filter(test).length;
  const flagged = cases.filter((item) => item.action !== "allow");
  const reviewedFlagged = flagged.filter((item) => item.status !== "open");
  const falsePositives = reviewedFlagged.filter((item) => item.status === "approved").length;

  const perCurrency = new Map<string, number>();
  for (const item of flagged) perCurrency.set(item.currency, (perCurrency.get(item.currency) ?? 0) + item.amount);
  const atRisk = perCurrency.size ? [...perCurrency].map(([currency, amount]) => money(amount, currency)).join(" · ") : money(0, "INR");

  const tally = new Map<string, number>();
  for (const item of cases) for (const label of new Set(signalsOf(item))) tally.set(label, (tally.get(label) ?? 0) + 1);
  const topSignals = [...tally].map(([label, n]) => ({ label, count: n })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8);

  return {
    total,
    hold: count((item) => item.action === "hold"),
    warn: count((item) => item.action === "warn"),
    allow: count((item) => item.action === "allow"),
    levels: {
      high: count((item) => levelOf(item.score) === "high"),
      medium: count((item) => levelOf(item.score) === "medium"),
      low: count((item) => levelOf(item.score) === "low"),
    },
    averageScore: total ? Math.round((cases.reduce((sum, item) => sum + item.score, 0) / total) * 10) / 10 : 0,
    needsReview: count((item) => item.action !== "allow" && item.status === "open"),
    reviewed: count((item) => item.status !== "open"),
    confirmed: reviewedFlagged.filter((item) => item.status === "held" || item.status === "escalated").length,
    falsePositives,
    falsePositiveRate: reviewedFlagged.length ? Math.round((falsePositives / reviewedFlagged.length) * 100) : 0,
    atRisk,
    topSignals,
  };
}

export interface Group {
  key: string;
  total: number;
  high: number;
  medium: number;
  low: number;
  worst: number;
}

// Groups cases by a field (location, device, payee) for the profile and geography views.
export function groupBy(cases: CaseItem[], pick: (item: CaseItem) => string | undefined): Group[] {
  const groups = new Map<string, Group>();
  for (const item of cases) {
    const key = pick(item)?.trim();
    if (!key) continue;
    const group = groups.get(key) ?? { key, total: 0, high: 0, medium: 0, low: 0, worst: 0 };
    group.total += 1;
    group[levelOf(item.score)] += 1;
    group.worst = Math.max(group.worst, item.score);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.worst - a.worst || b.total - a.total);
}
