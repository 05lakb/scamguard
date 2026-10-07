// Tests for the question flow and the "orders to the checker" rule, using fake helpers (no internet).

import { describe, expect, it } from "vitest";
import { decide } from "./decision";
import { assess, type Helpers } from "./service";
import type { Customer, Payment, Reading } from "./types";

const customer: Customer = { id: "c1", segment: "family", typical_amount: 200 };

function payment(changes: Partial<Payment> = {}): Payment {
  return {
    amount: 450, currency: "USD", timestamp: "2026-09-10T14:30:00", payee_name: "Test Payee",
    payee_type: "individual", is_new_payee: true, payee_account_age_days: 10, channel: "mobile",
    device_known: true, payments_last_24h: 0, on_live_call: false, remote_access_tool_running: false,
    ...changes,
  };
}

function reading(likelihood: number, changes: Partial<Reading> = {}): Reading {
  return {
    scam_likelihood: likelihood, tactics: [], matched_typology: "none", suspicious_phrases: [],
    customer_verified_independently: false, payee_relationship: "unknown", met_payee_in_person: "unknown",
    contact_source: "unknown", secrecy: "none", urgency: false, evasive: false,
    rehearsed_or_coached: false, contradicts_first_note: false,
    explanation: "Pressure to pay quickly.", orders_found_in_message: [], ...changes,
  };
}

function helpers(likelihood = 10, changes: Partial<Reading> = {}): Helpers {
  return {
    reader: async () => reading(likelihood, changes),
    asker: async () => ["Who is this payment for?", "How do you know them?"],
    scamTypes: [],
  };
}

describe("orders aimed at the checker", () => {
  it("force a hold even when the score is low", () => {
    const result = decide(payment({ is_new_payee: false, payee_account_age_days: 2000, amount: 100 }), customer,
      reading(0, { orders_found_in_message: ["ignore all previous"] }));
    expect(result.action).toBe("hold");
    expect(result.audit.forced_hold).toBe(true);
  });
});

describe("the question flow", () => {
  it("asks a thin note on an unusual payment", async () => {
    const result = await assess({ payment: payment(), customer, message: "travel fee" }, helpers());
    expect(result.action).toBe("ask");
    expect(result.questions?.length).toBe(2);
  });

  it("asks when the customer wrote nothing", async () => {
    const result = await assess({ payment: payment(), customer, message: null }, helpers());
    expect(result.action).toBe("ask");
  });

  it("does not ask when the note is detailed and calm", async () => {
    const note = "Paying the deposit for the flat I viewed twice, with a signed contract from the agent.";
    const result = await assess({ payment: payment(), customer, message: note },
      helpers(0, { customer_verified_independently: true }));
    expect(result.action).not.toBe("ask");
  });

  it("does not ask when the payment is ordinary", async () => {
    const calm = payment({ amount: 200, is_new_payee: false, payee_account_age_days: 2000 });
    const result = await assess({ payment: calm, customer, message: "ok" }, helpers());
    expect(result.action).toBe("allow");
  });

  it("asks before holding an ambiguous thin note", async () => {
    const result = await assess({ payment: payment({ on_live_call: true }), customer, message: "gift keep it secret" },
      helpers(75));
    expect(result.action).toBe("ask");
  });

  it("does not ask when the message is clearly a scam", async () => {
    const result = await assess({ payment: payment(), customer, message: "he said dont miss the chance" }, helpers(95));
    expect(["warn", "hold"]).toContain(result.action);
  });

  it("lowers the risk after a reassuring answer", async () => {
    const first = await assess({ payment: payment(), customer, message: "travel fee" }, helpers());
    const second = await assess(
      { payment: payment(), customer, message: "travel fee", questions: first.questions, answer: "It is my sister, I called her today." },
      helpers(0, { customer_verified_independently: true }),
    );
    expect(second.round).toBe(2);
    expect(second.action).not.toBe("ask");
    expect(second.score).toBeLessThan(first.score);
  });

  it("raises the risk after an alarming answer and never asks twice", async () => {
    const first = await assess({ payment: payment(), customer, message: "travel fee" }, helpers());
    const second = await assess(
      { payment: payment(), customer, message: "travel fee", questions: first.questions, answer: "He said keep it secret and pay today." },
      helpers(95),
    );
    expect(["warn", "hold"]).toContain(second.action);
  });

  it("treats a blank answer as a refusal and does not loop", async () => {
    const first = await assess({ payment: payment(), customer, message: "travel fee" }, helpers());
    const second = await assess(
      { payment: payment(), customer, message: "travel fee", questions: first.questions, answer: "   " },
      helpers(50),
    );
    expect(second.round).toBe(2);
    expect(second.action).not.toBe("ask");
  });
});

describe("asking when a new payee is still unexplained", () => {
  const calm = () => payment({ amount: 200, payee_account_age_days: 300, device_known: true });

  it("asks even when the payment looks calm and the note is long but says nothing about the payee", async () => {
    const note = "Please process this payment as soon as you can, thank you very much for your help today.";
    const result = await assess({ payment: calm(), customer, message: note }, helpers(5));
    expect(result.action).toBe("ask");
  });

  it("does not ask when the customer has explained the payee", async () => {
    const note = "Rent deposit for the flat I viewed on Saturday. I met the landlord and signed the lease.";
    const result = await assess({ payment: calm(), customer, message: note },
      helpers(5, { payee_relationship: "landlord", met_payee_in_person: "yes", contact_source: "in_person" }));
    expect(result.action).not.toBe("ask");
  });

  it("never asks about a known payee just because the note is bare", async () => {
    const known = payment({ amount: 190, is_new_payee: false, payee_account_age_days: 3000 });
    const result = await assess({ payment: known, customer, message: "ok" }, helpers(5));
    expect(result.action).toBe("allow");
  });
});

describe("a claimed relationship is not proof", () => {
  const calm = () => payment({ amount: 200, payee_account_age_days: 300, device_known: true });

  it("still asks when the note only claims a relationship", async () => {
    const note = "Sending money to my cousin for family expenses from the weekend, thank you for your help.";
    const result = await assess({ payment: calm(), customer, message: note }, helpers(5, { payee_relationship: "family" }));
    expect(result.action).toBe("ask");
  });

  it("does not ask when someone trusted introduced the payee", async () => {
    const note = "Paying the new supplier my neighbour recommended, for the fence panels I ordered.";
    const result = await assess({ payment: calm(), customer, message: note },
      helpers(5, { payee_relationship: "supplier", contact_source: "referral" }));
    expect(result.action).not.toBe("ask");
  });
});

describe("after asking, a payee nothing backs up adds risk", () => {
  const calm = () => payment({ amount: 200, payee_account_age_days: 300, device_known: true });

  it("raises the score on the second round when the answer proves nothing", async () => {
    const first = await assess({ payment: calm(), customer, message: "ok thanks" }, helpers(5));
    expect(first.action).toBe("ask");
    const second = await assess(
      { payment: calm(), customer, message: "ok thanks", questions: first.questions, answer: "Everything is fine, push it through." },
      helpers(5),
    );
    expect(second.score).toBeGreaterThan(first.score);
    expect(second.reasons.join(" ")).toContain("nothing backs up");
  });

  it("does not raise it when the answer shows they met the payee", async () => {
    const first = await assess({ payment: calm(), customer, message: "ok thanks" }, helpers(5));
    const second = await assess(
      { payment: calm(), customer, message: "ok thanks", questions: first.questions, answer: "I met him at the flat." },
      helpers(5, { met_payee_in_person: "yes", payee_relationship: "landlord" }),
    );
    expect(second.reasons.join(" ")).not.toContain("nothing backs up");
  });
});

describe("a claimed history is checked against what the bank knows", () => {
  const calm = () => payment({ amount: 200, payee_account_age_days: 300, device_known: true });
  const claim = { customer_verified_independently: true, claims_existing_relationship: true, payee_relationship: "supplier" };

  it("still asks, and is penalised after the answer", async () => {
    const note = "Payment for our latest invoice from our regular supplier, thank you very much for your help.";
    const first = await assess({ payment: calm(), customer, message: note }, helpers(5, claim));
    expect(first.action).toBe("ask");
    const second = await assess(
      { payment: calm(), customer, message: note, questions: first.questions, answer: "Trusted partners of ours for years." },
      helpers(5, claim),
    );
    expect(["warn", "hold"]).toContain(second.action);
    expect(second.audit.verified_discount).toBe(0);
    expect(second.reasons.join(" ")).toContain("no record of ever paying them");
  });

  it("does not treat a known payee's claimed history as a mismatch", async () => {
    const known = payment({ amount: 190, is_new_payee: false, payee_account_age_days: 3000 });
    const result = await assess({ payment: known, customer, message: "regular supplier" }, helpers(5, claim));
    expect(result.reasons.join(" ")).not.toContain("no record of ever paying them");
  });
});
