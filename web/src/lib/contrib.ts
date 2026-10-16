// Turns a decision into a ranked list of "what pushed the risk up or down", for the evidence bars.

import { networkLabel, SCAM_TYPE_LABEL, SIGNAL_LABEL } from "./labels";
import type { Decision } from "../core/types";

export interface Contribution {
  label: string;
  points: number;
  why: string;
  kind: "payment" | "message" | "network" | "credit";
}

export function contributions(decision: Pick<Decision, "audit">): Contribution[] {
  const { audit } = decision;
  const list: Contribution[] = audit.behaviour_signals.map((signal) => ({
    label: SIGNAL_LABEL[signal.name] ?? signal.name.replaceAll("_", " "),
    points: signal.points,
    why: signal.reason,
    kind: "payment" as const,
  }));

  for (const signal of audit.network_signals ?? []) {
    list.push({
      label: `MuleNet: ${networkLabel(signal.name)}`,
      points: signal.points,
      why: signal.reason,
      kind: "network",
    });
  }

  const reading = audit.message_reading;
  if (reading && audit.message_points !== 0) {
    const type = SCAM_TYPE_LABEL[reading.matched_typology];
    list.push({
      label: reading.scam_likelihood >= 50 && type ? `The message reads like ${type}` : "What the customer wrote and said",
      points: audit.message_points,
      why: reading.explanation,
      kind: "message",
    });
  }
  if (audit.verified_discount > 0) {
    list.push({
      label: "The customer checked on their own",
      points: -audit.verified_discount,
      why: "A calm message where the customer clearly verified the details lowers the risk.",
      kind: "credit",
    });
  }
  return list.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}

export function maxPoints(list: Contribution[]): number {
  return Math.max(30, ...list.map((item) => Math.abs(item.points)));
}
