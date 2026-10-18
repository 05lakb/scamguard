// What a real banking app knows without the customer typing it: the payee's history with the bank
// and the phone's own signals. In this simulation they are made up, consistently, so any payment can be tried.

import type { Payment } from "../core/types";
import { BASE, PRESETS, type Form, type NetworkPattern, type Segment } from "../pages/Analyzer";

export interface Payee {
  name: string;
  handle: string; // UPI ID, or account number and IFSC
  type: Payment["payee_type"];
  ageDays: number;
  network: NetworkPattern;
  known: boolean; // paid before from this account
}

export interface Persona {
  id: Segment;
  label: string;
  typical: number;
  city: string;
  device: string;
  balance: number;
}

export interface Signals {
  time: string;
  recent: number;
  onCall: boolean;
  remote: boolean;
  newDevice: boolean;
  locationChanged: boolean;
}

export const PERSONAS: Persona[] = [
  { id: "young_professional", label: "Young professional, Mumbai", typical: 2000, city: "Mumbai", device: "dev-4821 · Pixel 8", balance: 186_400 },
  { id: "retiree", label: "Retiree, Pune", typical: 5000, city: "Pune", device: "dev-1207 · Galaxy A15", balance: 1_240_000 },
  { id: "small_business_owner", label: "Shop owner, Jaipur", typical: 25000, city: "Jaipur", device: "dev-3390 · Redmi Note 13", balance: 412_000 },
  { id: "student", label: "Student, Bengaluru", typical: 800, city: "Bengaluru", device: "dev-5512 · iPhone 13", balance: 23_900 },
];

// Saved contacts: people and shops this customer has paid before.
export const CONTACTS: Payee[] = [
  { name: "Mom (Shanti Kumar)", handle: "shanti.k@okbank", type: "individual", ageDays: 2400, network: "none", known: true },
  { name: "Ravi Kirana Store", handle: "ravikirana@ybl", type: "business", ageDays: 900, network: "clean", known: true },
  { name: "R. Sharma (landlord)", handle: "rsharma.home@okaxis", type: "individual", ageDays: 1500, network: "none", known: true },
  { name: "City Power Ltd", handle: "citypower@billpay", type: "business", ageDays: 3000, network: "clean", known: true },
];

// What "Scan & pay" can find: a shop's counter QR, or a "refund" QR a stranger sent on a chat app.
export const SCANS: { label: string; payee: Payee; amount: string; note: string }[] = [
  { label: "Shop counter QR", amount: "180", note: "",
    payee: { name: "Chai Point, Andheri", handle: "chaipoint.andheri@ybl", type: "business", ageDays: 700, network: "clean", known: false } },
  { label: "Refund QR from a chat", amount: "4999", note: "Scanning to receive my refund for the cancelled order",
    payee: { name: "Refund Desk 24x7", handle: "refunddesk247@upi", type: "individual", ageDays: 5, network: "ring", known: false } },
];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// A new payee's history with the bank, the same every time for the same UPI ID or account.
export function newPayee(name: string, handle: string): Payee {
  const h = hash(handle || name);
  const ageDays = [3, 9, 21, 60, 400, 1200][h % 6];
  const kind = /exchange|crypto|coin|bitcoin|usdt/i.test(`${name} ${handle}`) ? "crypto_exchange"
    : /ltd|store|services|support|pvt|shop|traders|enterprises|desk|tech/i.test(name) ? "business" : "individual";
  const network: NetworkPattern = ageDays < 30 && (h >> 4) % 2 === 0 ? "ring" : ageDays >= 400 ? "clean" : "none";
  return { name: name.trim() || handle, handle, type: kind, ageDays, network, known: false };
}

// The phone's own signals for one payment: usually calm, sometimes not, like real traffic.
export function randomSignals(random: () => number = Math.random): Signals {
  const d = new Date();
  return {
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    recent: random() < 0.6 ? 0 : random() < 0.75 ? 1 : 2,
    onCall: random() < 0.1,
    remote: random() < 0.04,
    newDevice: random() < 0.05,
    locationChanged: random() < 0.06,
  };
}

// The payment the app sends to the bank: what the customer chose, plus what the phone and the bank already know.
export function buildForm(persona: Persona, payee: Payee, amount: string, note: string, signals: Signals): Form {
  return {
    ...BASE,
    amount, currency: "INR", segment: persona.id, typical: String(persona.typical),
    payee: payee.name, payeeType: payee.type, accountAge: String(payee.ageDays), network: payee.network, newPayee: !payee.known,
    device: signals.newDevice ? "dev-9930 · unknown Android" : persona.device,
    location: signals.locationChanged ? "Unknown · VPN" : persona.city,
    channel: "mobile", time: signals.time, recent: String(signals.recent),
    newDevice: signals.newDevice, locationChanged: signals.locationChanged, onCall: signals.onCall, remote: signals.remote, note,
  };
}

// The ready-made scam stories, as a payee, an amount, a note and the phone's signals.
export function story(label: string): { payee: Payee; amount: string; note: string; signals: Signals } | null {
  const preset = PRESETS.find((item) => item.label === label);
  if (!preset) return null;
  const f: Form = { ...BASE, ...preset.form };
  const known = !preset.form.newPayee;
  return {
    payee: known ? CONTACTS[1] : { name: f.payee, handle: `${f.payee.toLowerCase().replace(/[^a-z0-9]+/g, "")}@upi`, type: f.payeeType, ageDays: Number(f.accountAge), network: f.network, known: false },
    amount: f.amount,
    note: f.note,
    signals: { time: preset.form.time ?? randomSignals().time, recent: Number(f.recent), onCall: f.onCall, remote: f.remote, newDevice: f.newDevice, locationChanged: f.locationChanged },
  };
}

export const STORY_LABELS = PRESETS.map((item) => item.label);
