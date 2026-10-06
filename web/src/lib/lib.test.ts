// Tests for the evidence ranking, the story script and the data the screens depend on.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decide } from "../core/decision";
import type { Customer, Payment, Reading } from "../core/types";
import demo from "../data/demo.json";
import evidence from "../data/evidence.json";
import { recordedCases, needsReview } from "./cases";
import { contributions } from "./contrib";
import { SIGNAL_LABEL } from "./labels";
import { STORY } from "./story";

// Words that must never appear in our made-up data, kept as hashes so the words are not written down here.
const BLOCKED_HASHES = new Set([
  "abc07d7a1810b5c934a870aa96e9e4904bc73960bc6766842c41c3d4a947c1ae",
  "9c804ca9d325256d6e817a261f0de6f53ba28164c869d5aadd8f1a9b8ad42292",
]);

function blockedWordsIn(text: string): string[] {
  const tokens = new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return [...tokens].filter((token) => BLOCKED_HASHES.has(createHash("sha256").update(token).digest("hex")));
}

const customer: Customer = { id: "c", segment: "family", typical_amount: 200, typical_spend_15d: 1600 };

function payment(changes: Partial<Payment> = {}): Payment {
  return {
    amount: 800, currency: "USD", timestamp: "2026-09-10T14:30:00", payee_name: "Test", payee_type: "individual",
    is_new_payee: true, payee_account_age_days: 5, channel: "web", device_known: false, payments_last_24h: 0,
    on_live_call: false, remote_access_tool_running: false, ...changes,
  };
}

function reading(likelihood: number, changes: Partial<Reading> = {}): Reading {
  return {
    scam_likelihood: likelihood, tactics: [], matched_typology: "romance", suspicious_phrases: [],
    customer_verified_independently: false, payee_relationship: "unknown", met_payee_in_person: "unknown",
    contact_source: "unknown", secrecy: "none", urgency: false, evasive: false, rehearsed_or_coached: false,
    contradicts_first_note: false, explanation: "Looks like pressure to pay.", orders_found_in_message: [], ...changes,
  };
}

describe("the evidence bars", () => {
  it("rank reasons by weight, biggest first, with plain labels", () => {
    const items = contributions(decide(payment(), customer, reading(90)));
    const sizes = items.map((item) => Math.abs(item.points));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(items.some((item) => item.kind === "message")).toBe(true);
    for (const item of items.filter((entry) => entry.kind === "payment")) {
      expect(Object.values(SIGNAL_LABEL)).toContain(item.label);
    }
  });

  it("show a negative bar when the customer checked on their own", () => {
    const calm = reading(0, { customer_verified_independently: true });
    const items = contributions(decide(payment(), customer, calm));
    const credit = items.find((item) => item.kind === "credit");
    expect(credit?.points).toBeLessThan(0);
  });

  it("are empty when nothing is unusual", () => {
    const quiet = payment({ is_new_payee: false, payee_account_age_days: 3000, device_known: true, amount: 190 });
    expect(contributions(decide(quiet, customer))).toEqual([]);
  });
});

describe("the demo scenarios", () => {
  const ids = (demo as { id: string }[]).map((item) => item.id);

  it("are complete and have unique ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of demo as any[]) {
      for (const key of ["id", "title", "group", "kind", "difficulty", "blurb", "customer", "payment", "message", "sample_reply"]) {
        expect(item).toHaveProperty(key);
      }
      expect(["scam", "genuine"]).toContain(item.group);
      expect(item.customer.typical_spend_15d).toBeGreaterThan(0);
    }
  });

  it("include both scams and genuine customers", () => {
    const groups = new Set((demo as { group: string }[]).map((item) => item.group));
    expect(groups).toEqual(new Set(["scam", "genuine"]));
  });

  it("are made up: no real company or employer names", () => {
    const text = JSON.stringify(demo).toLowerCase();
    for (const word of ["paypal", "revolut", "binance", "coinbase", "barclays", "hsbc", "http", "@"]) {
      expect(text).not.toContain(word);
    }
    expect(blockedWordsIn(text)).toEqual([]);
  });

  it("make the repeated-payments case show a real 15-day pattern", () => {
    const repeated = (demo as any[]).find((item) => item.id === "d6");
    expect(repeated.payment.payee_count_15d).toBeGreaterThanOrEqual(4);
    const result = decide(repeated.payment, { id: "x", ...repeated.customer }, null);
    expect(result.action).toBe("hold");
  });
});

describe("the guided story", () => {
  it("only uses scenarios that exist", () => {
    const ids = new Set((demo as { id: string }[]).map((item) => item.id));
    for (const step of STORY) expect(ids.has(step.scenarioId)).toBe(true);
  });

  it("only auto-answers when a sample answer exists", () => {
    for (const step of STORY) {
      const scenario = (demo as any[]).find((item) => item.id === step.scenarioId);
      if (step.autoAnswer) expect(scenario.sample_reply.length).toBeGreaterThan(0);
    }
  });

  it("has a caption for every step", () => {
    for (const step of STORY) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.text.length).toBeGreaterThan(30);
    }
  });
});

describe("the analyst queue and the evidence page", () => {
  it("start with real recorded cases, never empty", () => {
    const cases = recordedCases();
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(cases.some((item) => item.action === "hold")).toBe(true);
    expect(cases.some((item) => item.action === "allow")).toBe(true);
    expect(cases.filter(needsReview).length).toBeGreaterThan(0);
    for (const item of cases) {
      expect(item.message).toBeTruthy();
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
    }
  });

  it("show percentages in range and list the limits honestly", () => {
    for (const row of [...evidence.scamsFlagged, ...evidence.friction]) {
      expect(row.value).toBeGreaterThanOrEqual(0);
      expect(row.value).toBeLessThanOrEqual(100);
    }
    expect(evidence.findings.length).toBeGreaterThanOrEqual(5);
    expect(evidence.limits.length).toBeGreaterThanOrEqual(3);
  });
});
