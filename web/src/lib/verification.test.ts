import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCase, sendVerificationAnswers, sessionKey, startVerification, type Verification } from "../api";
import { callTranscript } from "../components/VerificationPanel";
import { verificationTrailText } from "./cases";

const done: Verification = {
  mode: "phone",
  status: "done",
  questions: ["Who is this payment for?", "Is anyone on the phone with you?"],
  answers: ["My brother Rahul.", "No."],
  phone: "•••• 5678",
  call_status: "completed",
  started_at: "2026-10-17T13:00:00+00:00",
  outcome: {
    action: "hold", score: 100, reasons: ["Remote control"], before_action: "hold", before_score: 95,
    kept_hold: "A remote-control app was running during the payment, so someone else may be in control.",
    degraded: false, reading: null, decided_at: "2026-10-17T13:01:00+00:00",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("verification transport", () => {
  it("starts a phone call with this browser's key and the number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ verification: { ...done, status: "calling" } })));
    vi.stubGlobal("fetch", fetchMock);
    const started = await startVerification("abcdef123456", "phone", "+919812345678");
    expect(started.verification?.status).toBe("calling");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cases/abcdef123456/verification");
    expect(JSON.parse(init.body)).toEqual({ mode: "phone", phone: "+919812345678" });
    expect(init.headers["X-LMG-Session"]).toBe(sessionKey());
  });

  it("sends typed answers within the server's limits, and never a phone number", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ verification: done })));
    vi.stubGlobal("fetch", fetchMock);
    await startVerification("abcdef123456", "typed");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mode: "typed" });
    await sendVerificationAnswers("abcdef123456", ["x".repeat(600), "no"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).answers[0]).toHaveLength(500);
    await fetchCase("abcdef123456");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/cases/abcdef123456");
  });

  it("shows the server's reason when a call cannot start", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Phone calls are not set up on this server." }), { status: 503 })));
    await expect(startVerification("abcdef123456", "phone", "+91")).rejects.toThrow("Phone calls are not set up");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
    await expect(sendVerificationAnswers("abcdef123456", ["a"])).rejects.toThrow("could not be checked");
  });
});

describe("call transcript for the Voice AI page", () => {
  it("shows each question with its answer, and the answer being heard now", () => {
    expect(callTranscript(["Q1?", "Q2?"], [])).toBe("AI agent: Q1?");
    expect(callTranscript(["Q1?", "Q2?"], [], "my bro")).toBe("AI agent: Q1?\nCustomer: my bro");
    expect(callTranscript(["Q1?", "Q2?"], ["My brother."])).toBe("AI agent: Q1?\nCustomer: My brother.\nAI agent: Q2?");
    expect(callTranscript(["Q1?", "Q2?"], ["My brother.", "No."])).toBe("AI agent: Q1?\nCustomer: My brother.\nAI agent: Q2?\nCustomer: No.");
  });
});

describe("verification in the audit trail", () => {
  it("says who was called, the re-check and why a hold was kept", () => {
    const text = verificationTrailText(done);
    expect(text).toContain("AI agent called the customer (•••• 5678)");
    expect(text).toContain("Agent recommends: keep on hold (risk 95 → 100)");
    expect(text).toContain("Held regardless: A remote-control app");
    expect(text).toContain("Analyst to decide.");
    expect(verificationTrailText({ ...done, mode: "typed", outcome: null })).toBe("Customer typed the answers; re-check pending");
    expect(verificationTrailText({ ...done, mode: "voice", outcome: { ...done.outcome!, action: "allow", kept_hold: null } }))
      .toBe("Customer called the fraud desk in the app and spoke to the AI agent. Agent recommends: release (risk 95 → 100). Analyst to decide.");
  });
});
