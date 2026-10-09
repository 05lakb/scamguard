// Tests for the timing of the red agent versus guard stage.

import { describe, expect, it } from "vitest";
import type { ArenaRecord } from "../api";
import { CHECKS, PREP_LINES, scheduleOf, sourceLink, viewAt } from "./stage";

function record(changes: Partial<ArenaRecord> = {}): ArenaRecord {
  return {
    id: "r1", category: "quiet_scam", label: "scam", difficulty: "hard", note: "help with a fee",
    final_action: "hold", score: 80, expected_actions: ["hold"], amount: 400, currency: "USD",
    payee: "Test Payee", segment: "family", ...changes,
  };
}

describe("the stage timing", () => {
  it("starts with the red agent preparing and no verdict", () => {
    const view = viewAt(record(), 0);
    expect(view.step).toBe("prepare");
    expect(view.lines).toBe(1);
    expect(view.noteShown).toBe(false);
    expect(view.verdictShown).toBe(false);
  });

  it("shows every line of the case, then the note, then the checks in order", () => {
    const plan = scheduleOf(record());
    expect(viewAt(record(), plan.sendAt - 1).lines).toBe(PREP_LINES);
    expect(viewAt(record(), plan.sendAt).step).toBe("attack");
    expect(viewAt(record(), plan.sendAt).noteShown).toBe(true);
    expect(viewAt(record(), plan.firstCheckAt).checks).toBe(1);
    expect(viewAt(record(), plan.verdictAt - 1).checks).toBe(CHECKS.length);
  });

  it("lands the verdict last", () => {
    const plan = scheduleOf(record());
    expect(viewAt(record(), plan.verdictAt - 1).verdictShown).toBe(false);
    expect(viewAt(record(), plan.verdictAt).verdictShown).toBe(true);
    expect(viewAt(record(), plan.verdictAt).step).toBe("decide");
    expect(plan.end).toBeGreaterThan(plan.verdictAt);
  });

  it("only shows a question and an answer when the guard asked one", () => {
    const plain = scheduleOf(record());
    expect(plain.questionAt).toBeNull();
    expect(viewAt(record(), plain.end).questionShown).toBe(false);

    const withQuestion = record({ questions: ["Who is this for?"], answer: "My cousin." });
    const plan = scheduleOf(withQuestion);
    expect(plan.questionAt).not.toBeNull();
    expect(plan.verdictAt).toBeGreaterThan(plain.verdictAt);
    expect(viewAt(withQuestion, plan.questionAt!).questionShown).toBe(true);
    expect(viewAt(withQuestion, plan.questionAt!).answerShown).toBe(false);
    expect(viewAt(withQuestion, plan.answerAt!).answerShown).toBe(true);
    expect(viewAt(withQuestion, plan.answerAt!).verdictShown).toBe(false);
  });
});

describe("the source link", () => {
  it("links only the two named websites", () => {
    expect(sourceLink({ url: "https://www.scamwatch.gov.au/types-of-scams/phishing-scams" })).toContain("scamwatch.gov.au");
    expect(sourceLink({ url: "https://consumer.ftc.gov/consumer-alerts/2026/03/x" })).toContain("consumer.ftc.gov");
    expect(sourceLink({ url: "https://evil.example/https://consumer.ftc.gov/" })).toBeNull();
    expect(sourceLink({ url: "http://consumer.ftc.gov/x" })).toBeNull();
    expect(sourceLink({ url: "javascript:alert(1)" })).toBeNull();
    expect(sourceLink(undefined)).toBeNull();
  });
});
