// Talks to the server. The server keeps no memory between requests, so for the second round
// the first note and the questions are sent back along with the customer's answer.

import type { AccountNetwork, Customer, Decision, Payment } from "./core/types";

export interface AssessRequest {
  payment: Payment;
  customer: Pick<Customer, "segment" | "typical_amount" | "typical_spend_15d">;
  network?: AccountNetwork;
  message?: string | null;
  questions?: string[];
  answer?: string | null;
}

export interface BackendExecution {
  request_id: string;
  backend: string;
  duration_ms: number;
  message_mode: "gemini_live" | "gemini_cached" | "fallback_payment_only" | "not_requested" | "injected_reader";
  network_checked: boolean;
  model: string | null;
  fallback_reason?: string | null;
}

export type ServerDecision = Decision & {
  degraded?: boolean;
  notice?: string;
  execution?: BackendExecution;
};

export async function assessPayment(request: AssessRequest): Promise<ServerDecision> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (response.status === 429) {
      throw new Error("Too many requests from this device. Please wait a minute and try again.");
    }
    if (!response.ok) {
      throw new Error("Something went wrong while checking this payment. Please try again.");
    }
    return (await response.json()) as ServerDecision;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The assessment took too long. No result was received. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- the live red-team run ----------

export interface ArenaRecord {
  id: string;
  category: string;
  label: "scam" | "legit";
  difficulty: string;
  note: string | null;
  first_action?: string;
  questions?: string[] | null;
  answer?: string | null;
  final_action?: "allow" | "warn" | "hold";
  score?: number;
  reasons?: string[];
  ok?: boolean | null;
  expected_actions: string[];
  error?: string;
  degraded?: boolean;
  amount: number;
  currency: string;
  payee: string;
  segment: string;
  // The public advice page this made-up case was modelled on, when it has one.
  reference?: { name: string; title: string; url: string };
}

export interface ArenaSummary {
  scams_flagged: [number, number];
  genuine_with_friction: [number, number];
  overall_correct: [number, number];
  errors: number;
  unreliable: number;
  by_category: Record<string, [number, number]>;
}

export type ArenaEvent =
  | { type: "start"; total: number }
  | { type: "working"; number: number; total: number; category: string }
  | { type: "scenario"; number: number; total: number; record: ArenaRecord }
  | { type: "done"; summary: ArenaSummary };

// Results arrive as lines of text. A chunk can end in the middle of a line, so keep the unfinished part.
export function splitLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (buffer + chunk).split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((line) => line.trim()), rest };
}

export async function streamArena(count: number, onEvent: (event: ArenaEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/arena", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
    signal,
  });
  if (!response.ok) {
    let detail = "The live run could not start. Please try again.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep the general message */
    }
    throw new Error(detail);
  }
  if (!response.body) throw new Error("Your browser could not read the live results.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const { lines, rest } = splitLines(buffer, decoder.decode(value, { stream: true }));
    buffer = rest;
    for (const line of lines) onEvent(JSON.parse(line) as ArenaEvent);
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as ArenaEvent);
}

// Live stage events are emitted by the assessment pipeline, not browser timers.
export type AssessmentStage = "request" | "behaviour" | "network" | "message" | "clarify" | "decision";
export interface AssessmentEvent {
  type: "stage";
  request_id: string;
  stage: AssessmentStage;
  status: "running" | "complete" | "skipped" | "failed";
  detail: string;
  elapsed_ms: number;
  score?: number;
  mode?: "live" | "cached" | "test";
  summary?: string;
}

export async function streamAssessment(request: AssessRequest, onEvent: (event: AssessmentEvent) => void, signal?: AbortSignal): Promise<ServerDecision> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 50_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch("/api/assess/stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: controller.signal,
    });
    if (response.status === 429) throw new Error("Too many requests. Please wait a minute and try again.");
    if (!response.ok || !response.body) throw new Error("The live assessment could not start. Please try again.");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: ServerDecision | undefined;
    let requestId: string | undefined;
    function consume(line: string) {
      const event = JSON.parse(line);
      if (event.type === "error") throw new Error("The backend could not finish. No final result was received.");
      if (event.type !== "stage" && event.type !== "result") throw new Error("The backend sent an unexpected event.");
      if (typeof event.request_id !== "string" || (requestId && requestId !== event.request_id)) throw new Error("The backend sent mismatched request IDs.");
      requestId = event.request_id;
      if (event.type === "stage") onEvent(event as AssessmentEvent);
      else {
        if (!event.result?.execution || event.result.execution.request_id !== requestId) throw new Error("The final result does not match this run.");
        result = event.result as ServerDecision;
      }
    }
    while (!result) {
      const { done, value } = await reader.read();
      const split = splitLines(buffer, done ? decoder.decode() : decoder.decode(value, { stream: true }));
      buffer = split.rest;
      for (const line of split.lines) consume(line);
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    if (!result) throw new Error("The stream ended before a final result arrived. Please try again.");
    return result;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("The assessment timed out. No final result was received.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    if (reader) { try { await reader.cancel(); } catch { /* transport already closed */ } reader.releaseLock(); }
  }
}

// ---------- Voice AI: call transcript analysis ----------

export interface ConversationIndicator {
  tactic: string;
  label: string;
  points: number;
}

export interface ConversationResult {
  scam_likelihood: number;
  risk_level: "low" | "medium" | "high";
  tactics: string[];
  indicators: ConversationIndicator[];
  suspicious_phrases: string[];
  explanation: string;
  recommendation: string;
  matched_typology: string;
  orders_found_in_message: string[];
  source: "gemini" | "rules";
  notice?: string;
  duration_ms?: number;
}

export async function analyseConversation(transcript: string): Promise<ConversationResult> {
  const response = await fetch("/api/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  if (response.status === 429) throw new Error("Too many requests from this device. Please wait a minute and try again.");
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* no JSON body: usually the API is not running */
    }
    if (detail) throw new Error(detail);
    if (response.status >= 500) {
      throw new Error("Cannot reach the Last Mile Guard API. Start it from the project folder with: python -m uvicorn backend.app:app --reload --port 8080");
    }
    throw new Error("The conversation could not be analysed. Please try again.");
  }
  return (await response.json()) as ConversationResult;
}

// ---------- service health ----------

export interface Health {
  ok: boolean;
  ai_configured?: boolean;
}

export async function checkHealth(): Promise<Health | null> {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return null;
    return (await response.json()) as Health;
  } catch {
    return null;
  }
}
