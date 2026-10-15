import { afterEach, expect, it, vi } from "vitest";
import { streamAssessment, type AssessRequest } from "./api";

afterEach(() => vi.unstubAllGlobals());
const stage = { type: "stage", request_id: "abc", stage: "message", status: "running", elapsed_ms: 1, detail: "Reading" };
const result = { type: "result", request_id: "abc", result: { action: "hold", execution: { request_id: "abc" } } };
const body = {} as AssessRequest;

it("delivers split stage events before the final result is available", async () => {
  let feed: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { feed = controller; } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  const onEvent = vi.fn();
  const pending = streamAssessment(body, onEvent);
  const text = JSON.stringify(stage) + "\n";
  const encoder = new TextEncoder();
  feed!.enqueue(encoder.encode(text.slice(0, 25)));
  feed!.enqueue(encoder.encode(text.slice(25)));
  await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(stage));
  feed!.enqueue(encoder.encode(JSON.stringify(result)));
  feed!.close();
  expect(await pending).toEqual(result.result);
});

it("rejects a truncated stream rather than displaying a successful decision", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(stage) + "\n")));
  await expect(streamAssessment(body, vi.fn())).rejects.toThrow("before a final result");
});

it("rejects a final result from another request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(stage) + "\n" + JSON.stringify({ ...result, request_id: "wrong" }) + "\n")));
  await expect(streamAssessment(body, vi.fn())).rejects.toThrow("mismatched request IDs");
});
