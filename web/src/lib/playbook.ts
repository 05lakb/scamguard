// The scam playbook: the scam types the message reader is given, and which red flags a payment shows.

import type { Reading } from "../core/types";

export interface ScamType {
  id: string;
  name: string;
  how_it_works: string;
  red_flags: string[];
  pressure_tactics: string[];
  safe_advice: string;
  source: { label: string; url: string };
}

let cached: Promise<ScamType[]> | null = null;

export function loadPlaybook(): Promise<ScamType[]> {
  cached ??= fetch("/api/playbook")
    .then((response) => (response.ok ? response.json() : { types: [] }))
    .then((body: { types?: ScamType[] }) => body.types ?? [])
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}

export interface PaymentFacts {
  onCall: boolean;
  newPayee: boolean;
  remote: boolean;
}

// A red flag is marked only when this payment's own data or the reading shows it. Each rule names its evidence.
const RULES: { flag: RegExp; seen: (facts: PaymentFacts, reading: Reading | null) => boolean; evidence: string }[] = [
  { flag: /phone call|live call|on a call/i, seen: (f) => f.onCall, evidence: "the customer was on a phone call" },
  { flag: /new payee|new account|never paid/i, seen: (f) => f.newPayee, evidence: "the payee is new" },
  { flag: /remote|control|screen|install/i, seen: (f) => f.remote, evidence: "a remote-access app is running" },
  { flag: /not to tell|secret|tell anyone/i, seen: (_, r) => r?.secrecy === "concealment", evidence: "the note says to keep it secret" },
  { flag: /urgent|right now|immediately|now\b|today|deadline/i, seen: (_, r) => Boolean(r?.urgency), evidence: "the note shows urgency" },
  { flag: /what to say|script|coach|ignore .*warning/i, seen: (_, r) => Boolean(r?.rehearsed_or_coached), evidence: "the answers sound coached" },
];

export function flagEvidence(flag: string, facts: PaymentFacts, reading: Reading | null): string | null {
  const rule = RULES.find((item) => item.flag.test(flag) && item.seen(facts, reading));
  return rule ? rule.evidence : null;
}

// Pressure tactics named in the playbook that the reading also found.
export function tacticsFound(type: ScamType, reading: Reading | null): Set<string> {
  const found = new Set((reading?.tactics ?? []).map((tactic) => tactic.replaceAll("_", " ").toLowerCase()));
  return new Set(type.pressure_tactics.filter((tactic) => found.has(tactic.toLowerCase())));
}
