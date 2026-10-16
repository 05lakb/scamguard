import type { IconName } from "../components/Icon";

/**
 * The transaction and risk findings on this page are synthetic examples, NOT
 * claims about real payments or observed Last Mile Guard performance.
 */
export interface JourneyStep {
  id: string;
  label: string;
  title: string;
  description: string;
  evidence: string;
  icon: IconName;
  signal: string;
  labelValue: string;
  limitation?: string;
}

export const JOURNEY: JourneyStep[] = [
  {
    id: "payment", label: "Payment", title: "A customer starts a transfer",
    description: "A customer enters a payment to an unfamiliar beneficiary. The bank can see the transfer, but not necessarily the story behind it.",
    evidence: "Sample: ₹50,000 · New beneficiary · First payment to this account",
    icon: "list", signal: "PAYMENT CREATED", labelValue: "₹50,000",
  },
  {
    id: "behaviour", label: "FraudShield", title: "Spot unusual transaction behaviour",
    description: "Explainable checks compare the amount, payee and supplied history with the customer's usual payment activity.",
    evidence: "Sample signal: an unfamiliar payee and unusually high transfer amount",
    icon: "chart", signal: "BEHAVIOURAL CHECK", labelValue: "Unusual",
  },
  {
    id: "context", label: "ScamStop", title: "Understand the reason for sending",
    description: "Gemini can examine a customer's explanation for pressure, secrecy and impersonation; the service can ask one neutral follow-up round.",
    evidence: 'Sample note: "The bank told me to move my money to keep it safe."',
    icon: "brain", signal: "SCAM CONTEXT", labelValue: "Impersonation",
    limitation: "Gemini is used when configured; rules remain available without it.",
  },
  {
    id: "network", label: "MuleNet", title: "Check linked-account risk",
    description: "In the prototype, rule-based checks inspect an optional synthetic account graph for suspicious recipient connections and fast onward movement.",
    evidence: "Sample finding: a receiving account linked to multiple recent senders",
    icon: "server", signal: "SYNTHETIC GRAPH", labelValue: "Flagged link",
    limitation: "Demo-only account links; no live bank network is connected.",
  },
  {
    id: "decision", label: "Decision", title: "Explain the recommended action",
    description: "The risk engine combines the available evidence into an auditable allow, warn or hold recommendation. Gemini does not decide payment controls.",
    evidence: "Sample outcome: hold recommended · Risk 74/100 · Ranked reasons",
    icon: "shield", signal: "RISK RECOMMENDATION", labelValue: "Review",
    limitation: "74/100 is a synthetic illustration, not a validated fraud-detection score.",
  },
  {
    id: "review", label: "Human review", title: "An analyst makes the final call",
    description: "The analyst view shows evidence and a case trail. A production banking system would require authenticated reviewers and its own payment controls.",
    evidence: "Sample action: review risk explanation before approving or escalating",
    icon: "user", signal: "HUMAN IN CONTROL", labelValue: "Analyst",
    limitation: "The prototype analyst queue is stored in browser state only.",
  },
];

export interface IndustryStat {
  number: string;
  label: string;
  detail: string;
  source: string;
  url: string;
}

export const INDUSTRY_STATS: IndustryStat[] = [
  {
    number: "$16B", label: "Fraud losses reported", detail: "United States · calendar year 2025",
    source: "FTC · June 2026", url: "https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025",
  },
  {
    number: "$3.5B", label: "Imposter scam losses reported", detail: "United States · calendar year 2025",
    source: "FTC · June 2026", url: "https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025",
  },
  {
    number: "13,516", label: "Card / internet fraud cases reported", detail: "India · FY 2024–25 · cases reported, not necessarily originating in this year",
    source: "RBI · Annual Report 2024–25", url: "https://www.rbi.org.in/scripts/AnnualReportPublications.aspx?Id=1436",
  },
];

export const INSIGHTS = [
  {
    category: "Impersonation scams", date: "June 2026", source: "Federal Trade Commission",
    headline: "How impersonators convince customers to move their own money",
    summary: "FTC research highlights fake bank security alerts and the growing financial impact of impersonation scams.",
    url: "https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025",
  },
  {
    category: "Banking fraud", date: "May 2025", source: "Reserve Bank of India",
    headline: "What India's bank fraud reporting tells us about digital channels",
    summary: "RBI's annual report breaks down reported fraud by area of operation, including card and internet activity.",
    url: "https://www.rbi.org.in/scripts/AnnualReportPublications.aspx?Id=1436",
  },
  {
    category: "Consumer protection", date: "March 2025", source: "Federal Trade Commission",
    headline: "Why payment context matters when a transfer is authorized",
    summary: "The FTC details common scam types and the significant losses associated with bank transfers and payments.",
    url: "https://consumer.ftc.gov/consumer-alerts/2025/03/top-scams-2024",
  },
] as const;

export const PREVIEW_TABS = [
  {
    id: "payment", label: "01 · Payment",
    eyebrow: "Customer initiates a transfer", title: "A plausible payment with an unusual destination",
    quote: "I need to send ₹50,000 to a new account. Someone from the bank called and said my savings aren't safe.",
    lines: ["New beneficiary", "Amount above usual activity", "Customer acting under time pressure"],
  },
  {
    id: "signals", label: "02 · Signals",
    eyebrow: "FraudShield + ScamStop + MuleNet", title: "The story reveals what the transaction cannot",
    quote: "The caller said not to tell anyone. They called it a temporary safety account.",
    lines: ["Impersonation and secrecy indicators", "Unfamiliar receiving account", "Synthetic network link supplied for this scenario"],
  },
  {
    id: "outcome", label: "03 · Decision",
    eyebrow: "Explainable risk recommendation", title: "Hold recommended, with evidence a human can review",
    quote: "Risk 74/100 in this illustrative case. The banking analyst—not Gemini—decides what to do next.",
    lines: ["Ranked evidence for review", "One follow-up round when needed", "Browser-only analyst case trail"],
  },
] as const;
