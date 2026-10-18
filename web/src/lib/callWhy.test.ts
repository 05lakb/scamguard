import { describe, expect, it } from "vitest";
import type { VerificationOutcome } from "../api";
import type { Contribution } from "./contrib";
import { heldBy, whyStillHeld } from "./callWhy";

const items: Contribution[] = [
  { label: "Amount far above usual", points: 30, why: "", kind: "payment" },
  { label: "New device", points: 10, why: "", kind: "payment" },
  { label: "MuleNet: Money moved straight on", points: 25, why: "", kind: "network" },
  { label: "The message reads like a fake bank call", points: 80, why: "", kind: "message" },
];
const outcome = (over: Partial<VerificationOutcome>): VerificationOutcome => ({
  action: "hold", score: 100, reasons: [], before_action: "hold", before_score: 95, kept_hold: null, degraded: false,
  reading: { scam_likelihood: 10, explanation: "", coached: false, evasive: false, contradicts_first_note: false, secrecy: "none", verified_independently: false },
  ...over,
} as VerificationOutcome);

describe("why a payment is still held after the call", () => {
  it("lists only payment and account signals, strongest first", () => {
    expect(heldBy(items)).toEqual(["amount far above usual", "money moved straight on", "new device"]);
  });

  it("says calm answers cannot lift a hold that comes from the payment", () => {
    const text = whyStillHeld(outcome({}), heldBy(items));
    expect(text).toContain("because of the payment, not the answers");
    expect(text).toContain("amount far above usual");
  });

  it("says when the answers also raised concern", () => {
    expect(whyStillHeld(outcome({ reading: { scam_likelihood: 90, explanation: "", coached: true, evasive: false, contradicts_first_note: false, secrecy: "none", verified_independently: false } }), heldBy(items))).toContain("answers raised concern too");
  });

  it("says nothing when the agent recommends releasing", () => {
    expect(whyStillHeld(outcome({ action: "allow" }), heldBy(items))).toBeNull();
    expect(whyStillHeld(null, [])).toBeNull();
  });
});
