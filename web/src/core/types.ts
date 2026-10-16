// Shared shapes used by every check.

export type Action = "allow" | "warn" | "hold" | "ask";

export interface Payment {
  amount: number;
  currency: string;
  timestamp: string; // like 2026-09-10T14:30:00
  payee_name: string;
  payee_type: "individual" | "business" | "crypto_exchange";
  is_new_payee: boolean;
  payee_account_age_days: number;
  channel: string;
  device_known: boolean;
  payments_last_24h: number;
  on_live_call: boolean;
  remote_access_tool_running: boolean;
  // Optional: the payment came from a location the customer does not usually use.
  location_changed?: boolean;
  // What the customer did over the last 15 days (all optional).
  payments_last_15d?: number | null;
  spend_last_15d?: number | null;
  payee_count_15d?: number | null;
  payee_total_15d?: number | null;
}

export interface Customer {
  id: string;
  segment: string;
  typical_amount: number;
  typical_spend_15d?: number | null;
}

export interface NetworkTransfer {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  hours_ago: number;
}

export interface AccountNetwork {
  payee_account_id: string;
  flagged_account_ids: string[];
  transfers: NetworkTransfer[];
}

export interface ScamType {
  id: string;
  name: string;
  how_it_works: string;
  red_flags: string[];
  pressure_tactics: string[];
  safe_advice: string;
}

// What the message reader tells us about the customer's note or answer.
export interface Reading {
  scam_likelihood: number;
  tactics: string[];
  matched_typology: string;
  suspicious_phrases: string[];
  customer_verified_independently: boolean;
  payee_relationship: string;
  met_payee_in_person: "yes" | "no" | "unknown";
  contact_source: string;
  secrecy: "none" | "benign_surprise" | "concealment";
  urgency: boolean;
  evasive: boolean;
  rehearsed_or_coached: boolean;
  contradicts_first_note: boolean;
  claims_prior_dealings?: boolean;
  explanation: string;
  from_cache?: boolean;
  orders_found_in_message: string[];
}

export interface Signal {
  name: string;
  points: number;
  reason: string;
}

export interface BehaviourResult {
  score: number;
  signals: Signal[];
  suggestion: "allow" | "warn" | "hold";
}

export interface Decision {
  action: Action;
  score: number;
  reasons: string[];
  customer_warning: string;
  audit: {
    behaviour_score: number;
    behaviour_signals: Signal[];
    network_score?: number;
    network_signals?: Signal[];
    network_available?: boolean;
    message_points: number;
    verified_discount: number;
    message_reading: Reading | null;
    forced_hold: boolean;
    thresholds: { warn: number; hold: number };
  };
  round?: number;
  provisional_action?: Action;
  questions?: string[];
}
