// After the customer's call: if the payment is still held, say why in plain words.

import type { VerificationOutcome } from "../api";
import type { Contribution } from "./contrib";

// The payment and receiving-account signals behind a hold. Answers on a call cannot change these.
export function heldBy(items: Contribution[]): string[] {
  return items
    .filter((item) => (item.kind === "payment" || item.kind === "network") && item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 4)
    .map((item) => item.label.replace(/^MuleNet: /, "").toLowerCase());
}

export function whyStillHeld(outcome: VerificationOutcome | null | undefined, signals: string[]): string | null {
  if (!outcome || outcome.action !== "hold") return null;
  const reading = outcome.reading;
  const worried = reading && ((reading.scam_likelihood ?? 0) >= 50 || reading.coached || reading.evasive || reading.contradicts_first_note || reading.secrecy === "concealment");
  const list = signals.length ? signals.join(", ") : "the payment's own signals";
  if (worried) {
    return `Still on hold: the answers raised concern too, on top of the payment itself (${list}). The analyst should call the customer back on the number the bank already has.`;
  }
  return `Still on hold because of the payment, not the answers: ${list}. A calm answer cannot prove the phone is in the owner's hands, so the analyst should call the customer back on the number the bank already has.`;
}
