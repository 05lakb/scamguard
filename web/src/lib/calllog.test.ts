import { afterEach, describe, expect, it, vi } from "vitest";
import { addCaseNote, sessionKey, type SavedCase } from "../api";
import { THEMES, isTheme } from "../components/ThemePicker";
import { caseFromSaved, noteTrailText } from "./cases";

const saved: SavedCase = {
  id: "abcdef123456",
  created_at: "2026-10-17T10:15:00+00:00",
  payment: {
    amount: 98500, currency: "INR", timestamp: "2026-10-17T18:09:00", payee_name: "Secure Holding A/c 7731",
    payee_type: "individual", is_new_payee: true, payee_account_age_days: 3, channel: "mobile",
    device_known: true, payments_last_24h: 1, on_live_call: true, remote_access_tool_running: false,
  },
  customer: { segment: "young_professional", typical_amount: 2000 },
  message: "The bank's fraud team called.",
  action: "hold",
  score: 100,
  reasons: ["Bank impersonation"],
  status: "open",
  notes: [
    { kind: "call", text: "Customer called the fraud team quoting LMG-ABCDEF", author: "customer", at: "2026-10-17T10:20:00+00:00" },
    { kind: "note", text: "Says the bank told them to stay on the line.", author: "Priya", at: "2026-10-17T10:22:00+00:00" },
    { kind: "check", text: "high risk (92/100). Coached by a caller.", author: "Priya", at: "2026-10-17T10:23:00+00:00" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("call log", () => {
  it("reads naturally in the audit trail", () => {
    expect(noteTrailText(saved.notes![0])).toBe("Customer called the fraud team quoting LMG-ABCDEF");
    expect(noteTrailText(saved.notes![1])).toBe("Call notes added by Priya");
    expect(noteTrailText(saved.notes![2])).toBe("Voice AI check of the call notes: high risk (92/100). Coached by a caller.");
  });

  it("comes back with a saved case, in order", () => {
    const item = caseFromSaved(saved);
    expect(item.notes?.map((note) => note.kind)).toEqual(["call", "note", "check"]);
    expect(item.trail.slice(-3).map((step) => step.text)).toEqual(saved.notes!.map(noteTrailText));
    expect(caseFromSaved({ ...saved, notes: undefined }).notes).toEqual([]);
  });

  it("is sent with this browser's session key and reports failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await addCaseNote("abcdef123456", "note", "x".repeat(2100), "Priya")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cases/abcdef123456/notes");
    expect(init.headers["X-LMG-Session"]).toBe(sessionKey());
    const body = JSON.parse(init.body);
    expect(body.kind).toBe("note");
    expect(body.text).toHaveLength(2000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await addCaseNote("abcdef123456", "call", "Customer called", "customer")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await addCaseNote("abcdef123456", "call", "Customer called", "customer")).toBe(false);
  });
});

describe("themes", () => {
  it("offers charcoal and amber first, plus violet and monochrome", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(["charcoal", "violet", "mono"]);
    expect(isTheme("indigo")).toBe(false); // a removed theme saved in a browser falls back to the default
    expect(isTheme("mono")).toBe(true);
  });
});
