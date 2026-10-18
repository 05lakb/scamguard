import { describe, expect, it } from "vitest";
import type { AssessmentEvent, ServerDecision } from "../api";
import type { Form } from "../pages/Analyzer";
import { applyLive } from "./live";

const form = { amount: "98500", payee: "Secure Holding A/c 7731" } as Form;
const stage = (s: AssessmentEvent["stage"]) => ({ type: "stage", request_id: "r", stage: s, status: "complete", detail: "", elapsed_ms: 10 }) as AssessmentEvent;

describe("the dashboard's view of the payment on the customer's phone", () => {
  it("starts a run on a payment and fills it in step by step", () => {
    let run = applyLive(null, { type: "payment", run: "a", form });
    run = applyLive(run, { type: "stage", run: "a", event: stage("behaviour") });
    run = applyLive(run, { type: "result", run: "a", decision: { action: "hold", score: 100 } as ServerDecision });
    run = applyLive(run, { type: "call", run: "a", questions: ["Who is this for?"], answers: ["A man from the bank"] });
    expect(run?.form.payee).toBe("Secure Holding A/c 7731");
    expect(Object.keys(run!.stages)).toEqual(["behaviour"]);
    expect(run?.result?.action).toBe("hold");
    expect(run?.call?.answers).toEqual(["A man from the bank"]);
  });

  it("ignores messages from an older payment", () => {
    const run = applyLive(null, { type: "payment", run: "new", form });
    expect(applyLive(run, { type: "stage", run: "old", event: stage("network") })?.stages).toEqual({});
    expect(applyLive(null, { type: "stage", run: "x", event: stage("network") })).toBeNull();
  });

  it("clears the checks when the customer answers a question and the payment is checked again", () => {
    let run = applyLive(null, { type: "payment", run: "a", form });
    run = applyLive(run, { type: "stage", run: "a", event: stage("message") });
    run = applyLive(run, { type: "answered", run: "a", answer: "My landlord" });
    expect(run?.stages).toEqual({});
    expect(run?.answer).toBe("My landlord");
  });
});
