// The one entry point the screens call to assess a payment.
//
// Flow:
//   1. Read the customer's note (if any) and decide.
//   2. If the note is too thin and the payment looks a bit unusual, ask a question.
//   3. When the customer answers, read the answer together with the note and decide again.

import { combine, shouldAsk } from "./clarify";
import { decide } from "./decision";
import type { Customer, Decision, Payment, Reading, ScamType } from "./types";

// The two outside helpers (message reader and question writer) are passed in,
// so tests can swap them for fakes and nothing needs the internet.
export interface Helpers {
  reader: (text: string) => Promise<Reading>;
  asker: (message: string | null | undefined, payment: Payment) => Promise<string[]>;
  scamTypes: ScamType[];
}

export interface AssessInput {
  payment: Payment;
  customer: Customer;
  message?: string | null;
  questions?: string[];
  answer?: string | null; // pass this (even an empty string) for the second round
}

export async function assess(input: AssessInput, helpers: Helpers): Promise<Decision> {
  const { payment, customer, message = null } = input;

  // Second round: the customer has answered our questions (or declined to).
  if (input.answer !== undefined && input.answer !== null) {
    const answer = input.answer.trim() || "(the customer declined to answer)";
    const text = combine(message, input.questions ?? [], answer);
    const reading = await helpers.reader(text);
    const outcome = decide(payment, customer, reading, helpers.scamTypes);
    outcome.round = 2;
    return outcome;
  }

  const reading = message ? await helpers.reader(message) : null;
  const outcome = decide(payment, customer, reading, helpers.scamTypes);
  outcome.round = 1;

  if (shouldAsk(message, reading, outcome)) {
    outcome.provisional_action = outcome.action;
    outcome.action = "ask";
    outcome.questions = await helpers.asker(message, payment);
    outcome.customer_warning = "";
  }
  return outcome;
}
