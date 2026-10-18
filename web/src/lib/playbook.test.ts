import { describe, expect, it } from "vitest";
import type { Reading } from "../core/types";
import { flagEvidence, tacticsFound, type ScamType } from "./playbook";

const reading = (over: Partial<Reading>): Reading => ({
  scam_likelihood: 90, tactics: [], matched_typology: "bank_impersonation", suspicious_phrases: [],
  customer_verified_independently: false, payee_relationship: "unknown", met_payee_in_person: "unknown",
  contact_source: "unknown", secrecy: "none", urgency: false, evasive: false, rehearsed_or_coached: false,
  contradicts_first_note: false, explanation: "", orders_found_in_message: [], ...over,
});
const facts = { onCall: true, newPayee: true, remote: false };

describe("which red flags a payment shows", () => {
  it("marks a flag only when the payment or the reading shows it", () => {
    expect(flagEvidence("payment is made while on a live phone call", facts, null)).toBe("the customer was on a phone call");
    expect(flagEvidence("new payee set up minutes before the payment", facts, null)).toBe("the payee is new");
    expect(flagEvidence("told not to tell anyone, including bank staff", facts, reading({ secrecy: "concealment" }))).toBe("the note says to keep it secret");
  });

  it("leaves a flag unmarked when there is no evidence", () => {
    expect(flagEvidence("told not to tell anyone, including bank staff", facts, reading({ secrecy: "none" }))).toBeNull();
    expect(flagEvidence("someone asks to install software", { ...facts, remote: false }, null)).toBeNull();
    expect(flagEvidence("a promise of guaranteed returns", facts, reading({ urgency: true }))).toBeNull();
  });

  it("matches pressure tactics the reading found", () => {
    const type = { pressure_tactics: ["urgency", "authority", "fear"] } as ScamType;
    expect([...tacticsFound(type, reading({ tactics: ["urgency", "authority"] }))]).toEqual(["urgency", "authority"]);
    expect(tacticsFound(type, null).size).toBe(0);
  });
});
