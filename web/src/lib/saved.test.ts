import { afterEach, describe, expect, it, vi } from "vitest";
import { listSavedCases, saveDecision, sessionKey, type SavedCase } from "../api";
import { caseFromSaved, mergeSaved, recordedCases, type CaseItem } from "./cases";

const saved: SavedCase = {
  id: "abcdef123456",
  created_at: "2026-10-17T10:15:00+00:00",
  payment: {
    amount: 30000, currency: "INR", timestamp: "2026-10-17T15:45:00", payee_name: "Safe Account",
    payee_type: "individual", is_new_payee: true, payee_account_age_days: 12, channel: "mobile",
    device_known: false, payments_last_24h: 0, on_live_call: true, remote_access_tool_running: false,
  },
  customer: { segment: "family", typical_amount: 10000 },
  message: "for family",
  questions: ["Who is this payee?"],
  answer: "The bank fraud team told me to move it to a safe account.",
  action: "hold",
  score: 100,
  reasons: ["Bank impersonation"],
  status: "held",
  decisions: [{ status: "held", analyst: "Priya", at: "2026-10-17T10:20:00+00:00" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("saved cases", () => {
  it("rebuilds a queue case with its server id, conversation and decisions", () => {
    const item = caseFromSaved(saved);
    expect(item.savedId).toBe("abcdef123456");
    expect(item.id).toBe("SAVED-ABCDEF");
    expect(item.status).toBe("held");
    expect(item.payee).toBe("Safe Account");
    expect(item.questions).toEqual(["Who is this payee?"]);
    expect(item.trail.map((step) => step.text)).toContain("Analyst kept the payment on hold (Priya)");
    expect(item.trail.some((step) => step.text.includes("question"))).toBe(true);
  });

  it("adds only cases the page does not already show, before the recorded examples", () => {
    const recorded = recordedCases();
    const live = { ...caseFromSaved({ ...saved, id: "111111111111" }), id: "TXN-001", savedId: "111111111111" } as CaseItem;
    const merged = mergeSaved([live, ...recorded], [saved, { ...saved, id: "111111111111" }]);
    expect(merged.map((item) => item.id).slice(0, 2)).toEqual(["TXN-001", "SAVED-ABCDEF"]);
    expect(merged).toHaveLength(recorded.length + 2);
    expect(merged.at(-1)?.source).toBe("recorded");
    expect(mergeSaved(merged, [saved])).toBe(merged);
  });
});

describe("saved-case transport", () => {
  it("lists saved cases and treats any failure as an empty list", async () => {
    const listMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ storage: "firestore", cases: [saved] })));
    vi.stubGlobal("fetch", listMock);
    expect(await listSavedCases()).toEqual([saved]);
    expect(listMock.mock.calls[0][1].headers["X-LMG-Session"]).toBe(sessionKey());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    expect(await listSavedCases()).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await listSavedCases()).toEqual([]);
  });

  it("posts the analyst decision and reports whether it was saved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await saveDecision("abcdef123456", "escalated", "Priya")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cases/abcdef123456/decision");
    expect(JSON.parse(init.body)).toEqual({ status: "escalated", analyst: "Priya" });
    expect(init.headers["X-LMG-Session"]).toBe(sessionKey());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    expect(await saveDecision("abcdef123456", "held", "")).toBe(false);
  });
});

describe("browser session key", () => {
  it("is random, well formed and stays the same for this browser", () => {
    const key = sessionKey();
    expect(key).toMatch(/^[0-9a-f]{40}$/);
    expect(sessionKey()).toBe(key);
  });

  it("still works when browser storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    const key = sessionKey();
    expect(key).toMatch(/^[0-9a-f]{40}$/);
    expect(sessionKey()).toBe(key);
  });
});
