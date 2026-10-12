// The form for a visitor's own scenario: what it starts with, how it is checked, and what is sent to the server.

import type { CustomRequest } from "../api";

export interface CustomForm {
  story: string;
  role: "victim" | "genuine";
  coached: boolean;
  segment: string;
  typicalAmount: number;
  amount: number;
  payeeName: string;
  payeeType: "individual" | "business" | "crypto_exchange";
  isNewPayee: boolean;
  payeeAgeDays: number;
  deviceKnown: boolean;
  paymentsLast24h: number;
  onLiveCall: boolean;
  remoteTool: boolean;
}

export const SEGMENTS: { value: string; label: string }[] = [
  { value: "retiree", label: "Retired person" },
  { value: "young_professional", label: "Young professional" },
  { value: "small_business_owner", label: "Small-business owner" },
  { value: "student", label: "Student" },
  { value: "family", label: "Family" },
];

export const STORY_MIN = 20;
export const STORY_MAX = 400;

export const emptyForm: CustomForm = {
  story: "",
  role: "victim",
  coached: false,
  segment: "young_professional",
  typicalAmount: 250,
  amount: 900,
  payeeName: "Alex Morgan",
  payeeType: "individual",
  isNewPayee: true,
  payeeAgeDays: 30,
  deviceKnown: true,
  paymentsLast24h: 0,
  onLiveCall: false,
  remoteTool: false,
};

// Examples to start from. Everything in them is made up.
export const EXAMPLES: { label: string; form: CustomForm }[] = [
  {
    label: "A call from the \"bank\"",
    form: {
      ...emptyForm,
      story: "A caller says they are from the bank's fraud team and that my account is under attack. They told me to move my money to a safe account right now and not to tell the branch.",
      role: "victim", segment: "retiree", typicalAmount: 120, amount: 2400, payeeName: "Jordan Ellis",
      payeeAgeDays: 3, onLiveCall: true,
    },
  },
  {
    label: "A trading \"mentor\"",
    form: {
      ...emptyForm,
      story: "A mentor I met on a messaging app promised steady daily returns. He says it is a private opportunity and I need to send money to an exchange today to get started.",
      role: "victim", segment: "young_professional", typicalAmount: 300, amount: 1500, payeeName: "Northvale Exchange",
      payeeType: "crypto_exchange", payeeAgeDays: 40,
    },
  },
  {
    label: "A genuine rent deposit",
    form: {
      ...emptyForm,
      story: "I viewed the flat twice and signed the lease yesterday. I am paying the rent deposit to my new landlord, and I phoned the agent on the number in the contract to check the account details.",
      role: "genuine", segment: "family", typicalAmount: 400, amount: 1200, payeeName: "Grace Whitfield",
      payeeAgeDays: 200,
    },
  },
];

export function toRequest(form: CustomForm): CustomRequest {
  const whole = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(Number(value) || 0)));
  return {
    story: form.story.trim().replace(/\s+/g, " ").slice(0, STORY_MAX),
    role: form.role,
    coached: form.role === "victim" && form.coached,
    customer: { segment: form.segment, typical_amount: whole(form.typicalAmount, 1, 1_000_000) },
    amount: Math.min(1_000_000, Math.max(1, Math.round((Number(form.amount) || 0) * 100) / 100)),
    payee_name: (form.payeeName.trim().replace(/\s+/g, " ") || "Alex Morgan").slice(0, 60),
    payee_type: form.payeeType,
    is_new_payee: form.isNewPayee,
    payee_account_age_days: whole(form.payeeAgeDays, 0, 20_000),
    device_known: form.deviceKnown,
    payments_last_24h: whole(form.paymentsLast24h, 0, 50),
    on_live_call: form.onLiveCall,
    remote_access_tool_running: form.remoteTool,
  };
}

// Returns a plain-language problem, or an empty string when the form is fine.
export function problemWith(form: CustomForm): string {
  const story = form.story.trim();
  if (story.length < STORY_MIN) return `Please describe the situation in at least ${STORY_MIN} characters.`;
  if (story.length > STORY_MAX) return `Please keep the story under ${STORY_MAX} characters.`;
  if (!(Number(form.amount) > 0)) return "The amount must be more than zero.";
  if (!(Number(form.typicalAmount) >= 1)) return "The usual payment size must be at least 1.";
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(`${form.story} ${form.payeeName}`)) {
    return "Please leave out email addresses. Everything here should be made up.";
  }
  if (/\b(?:\d[ -]?){13,19}\b/.test(`${form.story} ${form.payeeName}`)) {
    return "Please leave out card numbers. Everything here should be made up.";
  }
  return "";
}
