// First check: does the payment itself look unusual for this customer?
// It adds up warning points. Each point has a plain reason, so we can always explain a flag.

import { pyRound } from "./pyround";
import type { BehaviourResult, Customer, Payment, Signal } from "./types";

// How much bigger than usual a payment can be before it looks odd, by customer type.
// Business owners' payments swing a lot, so the same jump counts for less.
const AMOUNT_SLACK: Record<string, number> = { small_business_owner: 2.0 };

export const WARN_AT = 40;
export const HOLD_AT = 70;

export function suggest(score: number): "allow" | "warn" | "hold" {
  if (score >= HOLD_AT) return "hold";
  if (score >= WARN_AT) return "warn";
  return "allow";
}

export function checkBehaviour(payment: Payment, customer: Customer): BehaviourResult {
  const signals: Signal[] = [];
  const add = (name: string, points: number, reason: string) => signals.push({ name, points, reason });

  if (payment.is_new_payee) {
    add("new_payee", 15, "Money is going to someone the customer has not paid before.");
  }
  if (payment.is_new_payee && payment.payee_account_age_days < 30) {
    add("very_new_account", 15, `The receiving account is only ${payment.payee_account_age_days} days old.`);
  }

  const slack = AMOUNT_SLACK[customer.segment] ?? 1.0;
  const usual = Math.max(customer.typical_amount, 1) * slack;
  const ratio = payment.amount / usual;
  const times = pyRound(ratio);
  if (ratio >= 10) {
    add("amount_far_above_usual", 30, `The amount is about ${times} times what this customer usually pays.`);
  } else if (ratio >= 5) {
    add("amount_well_above_usual", 20, `The amount is about ${times} times what this customer usually pays.`);
  } else if (ratio >= 3) {
    add("amount_above_usual", 10, `The amount is about ${times} times what this customer usually pays.`);
  }

  const hour = parseInt(payment.timestamp.slice(11, 13), 10);
  if (hour >= 1 && hour <= 5) {
    add("odd_hour", 10, "The payment was made in the middle of the night.");
  }

  if (payment.on_live_call) {
    add("on_live_call", 25, "The customer was on a phone call while making the payment.");
  }
  if (payment.remote_access_tool_running) {
    add(
      "remote_access",
      35,
      "A remote-control tool was running, so someone else may be guiding or controlling the screen.",
    );
  }
  if (!payment.device_known) {
    add("unknown_device", 10, "The payment came from a device we have not seen before.");
  }
  if (payment.payments_last_24h >= 2) {
    add("many_recent_payments", 10, "Several payments were made in the last 24 hours.");
  }
  if (payment.payee_type === "crypto_exchange") {
    add("crypto_payee", 10, "The money is going to a crypto exchange.");
  }

  // What the customer has done over the last 15 days. Missing history simply adds nothing.
  const spend = payment.spend_last_15d;
  if (spend !== undefined && spend !== null) {
    const typicalSpend = (customer.typical_spend_15d || customer.typical_amount * 8) * slack;
    const ratio15 = (spend + payment.amount) / Math.max(typicalSpend, 1);
    const times15 = pyRound(ratio15);
    const text = `About ${times15} times the usual 15-day spending has gone out, counting this payment.`;
    if (ratio15 >= 5) add("heavy_spend_15d", 30, text);
    else if (ratio15 >= 3) add("heavy_spend_15d", 20, text);
    else if (ratio15 >= 2) add("heavy_spend_15d", 10, text);
  }

  const repeats = payment.payee_count_15d || 0;
  const repeatText = `This would be payment number ${repeats + 1} in 15 days to a payee that is still new.`;
  if (payment.is_new_payee && repeats >= 4) add("repeat_payments_new_payee", 25, repeatText);
  else if (payment.is_new_payee && repeats >= 2) add("repeat_payments_new_payee", 15, repeatText);

  const payeeTotal = payment.payee_total_15d;
  if (payeeTotal !== undefined && payeeTotal !== null && (payeeTotal + payment.amount) / usual >= 8) {
    add("large_total_to_payee", 15, "The total sent to this one payee in 15 days is very large for this customer.");
  }

  const score = Math.min(100, signals.reduce((sum, item) => sum + item.points, 0));
  return { score, signals, suggestion: suggest(score) };
}
