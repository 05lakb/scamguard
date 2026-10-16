// Plain-language names used across the screens.

export const ACTION_LABEL: Record<string, string> = {
  allow: "Allowed",
  warn: "Warning",
  hold: "Held for review",
  ask: "A quick question",
};

export const ACTION_NOTE: Record<string, string> = {
  allow: "This payment can go ahead.",
  warn: "Pause and double-check before paying.",
  hold: "A specialist confirms before any money moves.",
  ask: "The guard needs a little more information first.",
};

export const SEGMENT_LABEL = (segment: string) => segment.replaceAll("_", " ");

export const SIGNAL_LABEL: Record<string, string> = {
  new_payee: "New payee",
  very_new_account: "Payee account is very new",
  amount_far_above_usual: "Amount far above usual",
  amount_well_above_usual: "Amount well above usual",
  amount_above_usual: "Amount above usual",
  odd_hour: "Night-time payment",
  on_live_call: "On a phone call",
  remote_access: "Remote-control tool running",
  unknown_device: "New device",
  location_change: "Unusual location",
  many_recent_payments: "Several payments in 24 hours",
  crypto_payee: "Paying a crypto exchange",
  heavy_spend_15d: "Heavy spending over 15 days",
  repeat_payments_new_payee: "Repeated payments to a new payee",
  large_total_to_payee: "Large total sent to one payee",
};

export const NETWORK_SIGNAL_LABEL: Record<string, string> = {
  flagged_payee: "Receiving account is already flagged",
  flagged_direct_link: "Direct link to a flagged account",
  flagged_two_hop_link: "Two steps from a flagged account",
  many_inbound_senders: "Many people paying this account",
  rapid_onward_transfer: "Money moved straight on",
};

export const networkLabel = (name: string) => NETWORK_SIGNAL_LABEL[name] ?? name.replaceAll("_", " ");

export const SCAM_TYPE_LABEL: Record<string, string> = {
  investment: "a fake investment",
  bank_impersonation: "a fake bank or police call",
  romance: "a romance scam",
  remote_access: "a tech-support scam",
  invoice_redirect: "a changed-bank-details invoice",
  purchase: "an online purchase scam",
  advance_fee: "an advance-fee scam",
  family_emergency: "a family emergency scam",
};
