// Tests for the 15-day history signals. They mirror the Python tests, so both versions agree.

import { describe, expect, it } from "vitest";
import { checkBehaviour } from "./behaviour";
import type { Customer, Payment } from "./types";

const customer: Customer = { id: "c", segment: "family", typical_amount: 100 };

function payment(changes: Partial<Payment> = {}): Payment {
  return {
    amount: 100, currency: "USD", timestamp: "2026-09-10T14:30:00", payee_name: "P", payee_type: "business",
    is_new_payee: false, payee_account_age_days: 1000, channel: "web", device_known: true,
    payments_last_24h: 0, on_live_call: false, remote_access_tool_running: false, ...changes,
  };
}

const names = (p: Payment, c: Customer = customer) => new Set(checkBehaviour(p, c).signals.map((s) => s.name));

describe("the last 15 days", () => {
  it("changes nothing when history is missing", () => {
    const plain = checkBehaviour(payment(), customer).score;
    const withNulls = checkBehaviour(
      payment({ spend_last_15d: null, payee_count_15d: null, payee_total_15d: null }), customer).score;
    expect(withNulls).toBe(plain);
  });

  it("adds points for heavy spending", () => {
    expect(names(payment({ spend_last_15d: 100 })).has("heavy_spend_15d")).toBe(false);
    const heavy = checkBehaviour(payment({ spend_last_15d: 4000 }), customer);
    expect(heavy.signals.some((s) => s.name === "heavy_spend_15d")).toBe(true);
  });

  it("adds points for repeat payments to a payee that is still new", () => {
    expect(names(payment({ is_new_payee: true, payee_count_15d: 0 })).has("repeat_payments_new_payee")).toBe(false);
    expect(names(payment({ is_new_payee: true, payee_count_15d: 4 })).has("repeat_payments_new_payee")).toBe(true);
  });

  it("does not flag a known payee paid often", () => {
    expect(names(payment({ is_new_payee: false, payee_count_15d: 6 })).has("repeat_payments_new_payee")).toBe(false);
  });

  it("ends the eight-payment pattern in a hold", () => {
    const last = payment({
      amount: 450, is_new_payee: true, payee_account_age_days: 45, payments_last_24h: 7, payments_last_15d: 7,
      spend_last_15d: 3150, payee_count_15d: 7, payee_total_15d: 3150,
    });
    expect(checkBehaviour(last, { id: "c", segment: "family", typical_amount: 200 }).suggestion).toBe("hold");
  });
});
