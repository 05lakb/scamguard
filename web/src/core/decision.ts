// Final step: combine the checks and decide allow, warn or hold.
// The decision only recommends an action. It cannot move or stop money by itself.
// Every decision comes with plain reasons and a record of what was used.

import { checkBehaviour, HOLD_AT, WARN_AT } from "./behaviour";
import { claimsHistoryOnly, payeeUnexplained } from "./clarify";
import { pyRound } from "./pyround";
import type { Action, Customer, Decision, Payment, Reading, ScamType } from "./types";

// How much weight the message reading gets (a likelihood of 100 adds 70 points).
const MESSAGE_WEIGHT = 0.7;
// After we asked, a new payee that nothing backs up adds this many points.
const UNCORROBORATED_AFTER_ASKING = 20;
// A risky-looking link in the message adds this many points.
const LINK_RISK_POINTS = 25;
// A customer who says they already know a payee we have never seen them pay adds this many points.
const CLAIMED_HISTORY_MISMATCH = 15;
// A customer who clearly checked on their own, with a calm message, earns a discount.
const VERIFIED_DISCOUNT = 25;
const CALM_BELOW = 30;

const ORDINARY_RELATIONSHIPS = new Set(["landlord", "contractor", "supplier", "family", "friend"]);
const RISKY_CONTACT_SOURCES = new Set(["dating_app", "social_media", "messaging_app"]);

export function actionFor(score: number): "allow" | "warn" | "hold" {
  if (score >= HOLD_AT) return "hold";
  if (score >= WARN_AT) return "warn";
  return "allow";
}

// Points added or removed based on what the customer's story reveals.
// Reassuring facts only count when the story is not rehearsed, evasive or contradictory.
export function storyAdjustments(reading: Reading): { points: number; reasons: string[] } {
  let points = 0;
  const reasons: string[] = [];
  const suspiciousStory = reading.evasive || reading.rehearsed_or_coached || reading.contradicts_first_note;

  if (reading.evasive) {
    points += 10;
    reasons.push("The customer avoided answering our questions.");
  }
  if (reading.rehearsed_or_coached) {
    points += 10;
    reasons.push("The answer sounds rehearsed, as if someone told the customer what to say.");
  }
  if (reading.contradicts_first_note) {
    points += 15;
    reasons.push("The answer does not match the first note.");
  }
  if (reading.secrecy === "concealment") {
    points += 10;
    reasons.push("The customer was told to keep this payment secret.");
  }
  if (RISKY_CONTACT_SOURCES.has(reading.contact_source) && reading.met_payee_in_person === "no") {
    points += 10;
    reasons.push("The payee was met online and never in person.");
  }

  if (!suspiciousStory && reading.scam_likelihood < 40) {
    let reduction = 0;
    const ordinary = ORDINARY_RELATIONSHIPS.has(reading.payee_relationship);
    if (reading.met_payee_in_person === "yes" && ordinary) reduction += 20;
    if ((reading.contact_source === "in_person" || reading.contact_source === "referral") && ordinary) {
      reduction += 10;
    }
    if (reduction) {
      points -= Math.min(reduction, 30);
      reasons.push("The customer knows or has met the payee in an ordinary way, which lowers the risk.");
    }
  }
  return { points, reasons };
}

// A short note for the customer, in everyday words.
export function warningText(action: Action, matchedTypology: string, scamTypes: ScamType[]): string {
  if (action === "allow") return "";
  const advice = scamTypes.find((item) => item.id === matchedTypology)?.safe_advice;
  const start =
    action === "hold"
      ? "We have paused this payment so a specialist can check it with you. This is to protect your money."
      : "Please stop for a moment before sending this payment. It has some signs that match known scams.";
  return advice ? `${start} ${advice}` : start;
}

export function decide(
  payment: Payment,
  customer: Customer,
  reading: Reading | null = null,
  scamTypes: ScamType[] = [],
  asked = false,
): Decision {
  const behaviour = checkBehaviour(payment, customer);
  const reasons = [...behaviour.signals]
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((item) => item.reason);

  let messagePoints = 0;
  let discount = 0;
  let forcedHold = false;

  if (reading) {
    const newPayee = behaviour.signals.some((signal) => signal.name === "new_payee");
    const claimsOnly = newPayee && claimsHistoryOnly(reading); // a claim of history, with no record to match
    messagePoints = pyRound(reading.scam_likelihood * MESSAGE_WEIGHT);
    if (reading.scam_likelihood >= 50) reasons.unshift(reading.explanation);
    if (reading.customer_verified_independently && reading.scam_likelihood < CALM_BELOW && !claimsOnly) {
      discount = VERIFIED_DISCOUNT;
      reasons.push("The customer says they checked this on their own, which lowers the risk.");
    }
    const extra = storyAdjustments(reading);
    messagePoints += extra.points;
    reasons.push(...extra.reasons);

    if (claimsOnly) {
      messagePoints += CLAIMED_HISTORY_MISMATCH;
      reasons.push("The customer describes past dealings with this payee, but we have no record of ever paying them.");
    }
    if (asked && newPayee && payeeUnexplained(reading)) {
      messagePoints += UNCORROBORATED_AFTER_ASKING;
      reasons.push("We asked, but nothing backs up who the payee is.");
    }

    const riskyLinks = reading.suspicious_links_found ?? []; // older readings may lack this field
    if (riskyLinks.length > 0) {
      messagePoints += LINK_RISK_POINTS;
      reasons.unshift(`The message contains a link that looks risky: ${riskyLinks[0].why}.`);
    }
    if (reading.orders_found_in_message.length > 0) {
      // A real customer does not write orders to a safety checker, so a person must look.
      forcedHold = true;
      reasons.unshift("The message tried to give orders to the safety check, which is a manipulation attempt.");
    }
  }

  const score = Math.max(0, Math.min(100, behaviour.score + messagePoints - discount));
  const action: Action = forcedHold ? "hold" : actionFor(score);
  const matched = reading ? reading.matched_typology : "none";

  return {
    action,
    score,
    reasons: reasons.slice(0, 4),
    customer_warning: warningText(action, matched, scamTypes),
    audit: {
      behaviour_score: behaviour.score,
      behaviour_signals: behaviour.signals,
      message_points: messagePoints,
      verified_discount: discount,
      message_reading: reading,
      forced_hold: forcedHold,
      thresholds: { warn: WARN_AT, hold: HOLD_AT },
    },
  };
}
