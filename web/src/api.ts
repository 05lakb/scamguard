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
