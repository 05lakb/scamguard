import { describe, expect, it } from "vitest";
import type { CaseItem } from "./cases";
import { groupBy, insights, levelOf, money } from "./insights";

function item(overrides: Partial<CaseItem>): CaseItem {
  return {
    id: "LIVE-001", title: "Test", source: "live", when: "now", amount: 1000, currency: "INR", payee: "Payee",
    segment: "family", message: null, action: "allow", score: 0, reasons: [], status: "open", trail: [],
    ...overrides,
  };
}

describe("insights", () => {
  it("is all zeros for an empty session", () => {
    const result = insights([]);
    expect(result.total).toBe(0);
    expect(result.averageScore).toBe(0);
    expect(result.atRisk).toBe("₹0");
    expect(result.topSignals).toEqual([]);
  });

  it("counts actions, levels, review state and money at risk", () => {
    const cases = [
      item({ id: "a", action: "hold", score: 92, amount: 98500, status: "held", reasons: ["New payee"] }),
      item({ id: "b", action: "warn", score: 45, amount: 1500, status: "approved", reasons: ["New payee", "New device"] }),
      item({ id: "c", action: "allow", score: 5 }),
    ];
    const result = insights(cases);
    expect([result.hold, result.warn, result.allow]).toEqual([1, 1, 1]);
    expect(result.levels).toEqual({ high: 1, medium: 1, low: 1 });
    expect(result.averageScore).toBe(47.3);
    expect(result.needsReview).toBe(0);
    expect(result.confirmed).toBe(1);
    expect(result.falsePositives).toBe(1);
    expect(result.falsePositiveRate).toBe(50);
    expect(result.atRisk).toBe("₹1,00,000");
    expect(result.topSignals[0]).toEqual({ label: "New payee", count: 2 });
  });

  it("uses audit signals when a case has them", () => {
    const audit = {
      behaviour_score: 25, behaviour_signals: [{ name: "location_change", points: 10, reason: "" }, { name: "unknown_device", points: 10, reason: "" }],
      message_points: 0, verified_discount: 0, message_reading: null, forced_hold: false, thresholds: { warn: 40, hold: 70 },
    };
    const result = insights([item({ audit, reasons: ["ignored"] })]);
    expect(result.topSignals.map((signal) => signal.label)).toEqual(["New device", "Unusual location"]);
  });
});

describe("helpers", () => {
  it("maps scores to levels", () => {
    expect([levelOf(0), levelOf(39), levelOf(40), levelOf(69), levelOf(70)]).toEqual(["low", "low", "medium", "medium", "high"]);
  });

  it("formats money with symbols", () => {
    expect(money(2400, "USD")).toBe("$2,400");
    expect(money(5, "JPY")).toBe("5 JPY");
  });

  it("groups by a field and skips blanks", () => {
    const groups = groupBy([item({ location: "Mumbai", score: 80 }), item({ location: "Mumbai", score: 10 }), item({ location: "" })], (c) => c.location);
    expect(groups).toEqual([{ key: "Mumbai", total: 2, high: 1, medium: 0, low: 1, worst: 80 }]);
  });
});
