import { afterEach, describe, expect, it, vi } from "vitest";
import { assessPayment, type AssessRequest } from "./api";

const request = {} as AssessRequest; // Transport tests; backend validation is tested separately.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("assessment transport", () => {
  it("returns the backend evidence and clears the request timer", async () => {
    vi.useFakeTimers();
    const evidence = { action: "hold", execution: { message_mode: "gemini_live" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(evidence))));
    expect(await assessPayment(request)).toEqual(evidence);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops a stalled request with an honest no-result message", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    }));
    const pending = expect(assessPayment(request)).rejects.toThrow("No result was received");
    await vi.advanceTimersByTimeAsync(50_000);
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("explains the API rate limit and clears its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(assessPayment(request)).rejects.toThrow("Please wait a minute");
    expect(vi.getTimerCount()).toBe(0);
  });
});
