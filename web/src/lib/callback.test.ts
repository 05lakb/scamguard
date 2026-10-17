import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCallbackBrief, type CallbackCase } from "../api";

const held: CallbackCase = {
  action: "hold", score: 99.6, amount: 30000, currency: "INR",
  reasons: ["one", "two", "three", "four", "five", "six", "seven"],
  message: "The bank told me to move my money.", questions: ["Who is this payee?"], answer: "", typology: "bank_impersonation",
};

afterEach(() => vi.unstubAllGlobals());

describe("call-back brief transport", () => {
  it("sends the case within the server's limits and returns the brief", async () => {
    const brief = { summary: "Held.", questions: ["Who called you?"], source: "gemini" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(brief)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestCallbackBrief(held)).toEqual(brief);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/callback-brief");
    const body = JSON.parse(init.body);
    expect(body.score).toBe(100);
    expect(body.reasons).toHaveLength(6);
    expect(body.typology).toBe("bank_impersonation");
    expect(body.answer).toBe("");
  });

  it("leaves out an unknown scam type and refuses allowed payments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ summary: "", questions: [], source: "rules" })));
    vi.stubGlobal("fetch", fetchMock);
    await requestCallbackBrief({ ...held, typology: "none" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).typology).toBeUndefined();
    await expect(requestCallbackBrief({ ...held, action: "allow" })).rejects.toThrow("Only warned or held");
  });

  it("explains rate limits and other failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(requestCallbackBrief(held)).rejects.toThrow("Please wait a minute");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(requestCallbackBrief(held)).rejects.toThrow("could not be prepared");
  });
});
