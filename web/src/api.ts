// Talks to the server. The server keeps no memory between requests, so for the second round
// the first note and the questions are sent back along with the customer's answer.

import type { Customer, Decision, Payment } from "./core/types";

export interface AssessRequest {
  payment: Payment;
  customer: Pick<Customer, "segment" | "typical_amount" | "typical_spend_15d">;
  message?: string | null;
  questions?: string[];
  answer?: string | null;
}

export type ServerDecision = Decision & { degraded?: boolean; notice?: string };

export async function assessPayment(request: AssessRequest): Promise<ServerDecision> {
  const response = await fetch("/api/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.status === 429) {
    throw new Error("Too many requests from this device. Please wait a minute and try again.");
  }
  if (!response.ok) {
    throw new Error("Something went wrong while checking this payment. Please try again.");
  }
  return (await response.json()) as ServerDecision;
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
  await streamFrom("/api/arena", { count }, onEvent, signal, "The live run could not start. Please try again.");
}

// A visitor's own made-up scenario. The server plays it and sends back the same kind of events as a live run.
export interface CustomRequest {
  story: string;
  role: "victim" | "genuine";
  coached: boolean;
  customer: { segment: string; typical_amount: number };
  amount: number;
  payee_name: string;
  payee_type: "individual" | "business" | "crypto_exchange";
  is_new_payee: boolean;
  payee_account_age_days: number;
  device_known: boolean;
  payments_last_24h: number;
  on_live_call: boolean;
  remote_access_tool_running: boolean;
}

export async function streamCustom(request: CustomRequest, onEvent: (event: ArenaEvent) => void, signal?: AbortSignal): Promise<void> {
  await streamFrom("/api/custom", request, onEvent, signal, "Your scenario could not be played. Please check the form and try again.");
}

async function streamFrom(
  address: string,
  payload: unknown,
  onEvent: (event: ArenaEvent) => void,
  signal: AbortSignal | undefined,
  failure: string,
): Promise<void> {
  const response = await fetch(address, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    let detail = failure;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail; // a checking error from the form is a list, so keep the general message
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
