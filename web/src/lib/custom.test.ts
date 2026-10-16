// Tests for the form behind "Your own scenario".

import { describe, expect, it } from "vitest";
import { EXAMPLES, STORY_MAX, emptyForm, problemWith, toRequest, type CustomForm } from "./custom";

const good: CustomForm = { ...emptyForm, story: "Someone I met online asked me to send money for a hospital bill and to keep it private." };

describe("the form for a visitor's own scenario", () => {
  it("accepts a sensible story", () => {
    expect(problemWith(good)).toBe("");
  });

  it("asks for a longer story, a positive amount, and no emails or card numbers", () => {
    expect(problemWith({ ...good, story: "too short" })).toContain("at least");
    expect(problemWith({ ...good, amount: 0 })).toContain("more than zero");
    expect(problemWith({ ...good, typicalAmount: 0 })).toContain("at least 1");
    expect(problemWith({ ...good, story: `${good.story} Write to me at someone@example.com` })).toMatch(/email.*blocked for safety/i);
    expect(problemWith({ ...good, story: `${good.story} card 4111 1111 1111 1111` })).toMatch(/card.*blocked for safety/i);
    expect(problemWith({ ...good, payeeName: "a.b@example.com" })).toMatch(/email.*blocked for safety/i);
  });

  it("keeps the story within its limit", () => {
    expect(problemWith({ ...good, story: "x".repeat(STORY_MAX + 1) })).toContain("under");
  });

  it("sends clean, limited numbers and text", () => {
    const request = toRequest({
      ...good, story: `  ${good.story}   with   extra   spaces `, amount: 2_000_000, typicalAmount: -5, payeeAgeDays: 99999,
      paymentsLast24h: 400, payeeName: "   ", role: "genuine", coached: true,
    });
    expect(request.amount).toBe(1_000_000);
    expect(request.customer.typical_amount).toBe(1);
    expect(request.payee_account_age_days).toBe(20_000);
    expect(request.payments_last_24h).toBe(50);
    expect(request.payee_name).toBe("Alex Morgan"); // an empty name falls back to a made-up one
    expect(request.story).not.toMatch(/\s{2,}/);
    expect(request.coached).toBe(false); // a genuine customer is never coached
  });

  it("rounds odd numbers and never sends NaN", () => {
    const request = toRequest({ ...good, amount: Number("abc"), typicalAmount: 12.7 });
    expect(Number.isFinite(request.amount) && request.amount >= 1).toBe(true);
    expect(request.customer.typical_amount).toBe(13);
  });

  it("starts from examples that pass the checks and hold no email address", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(3);
    for (const example of EXAMPLES) {
      expect(problemWith(example.form)).toBe("");
      expect(example.form.story).not.toMatch(/@/);
    }
  });
});

describe("real details are accepted", () => {
  it("lets a visitor use any name, amount and story, real or imagined", () => {
    const real = { ...good, payeeName: "Lalit Bairwal", story: "I am paying my real landlord, Mr Sharma, the deposit for my flat in Pune." };
    expect(problemWith(real)).toBe("");
    expect(toRequest(real).payee_name).toBe("Lalit Bairwal");
  });
});
