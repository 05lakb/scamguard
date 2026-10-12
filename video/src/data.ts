// The facts shown in the animated scenes. Keep these in step with the website's Evidence page
// (web/src/data/evidence.json). Check the loss figures against their sources before publishing.

export const LOSS_FIGURES = [
  { big: "A$2.18 billion", small: "reported lost to scams in Australia in 2025 (ACCC Scamwatch)" },
  { big: "£576 million", small: "authorised push payment fraud in the UK (UK Finance)" },
];

export interface BarData {
  label: string;
  value: number; // percent
  n: number; // how many cases
  note: string | null;
}

export const BEFORE_FIX: BarData[] = [
  { label: "Scams flagged", value: 100, n: 10, note: null },
  { label: "Genuine customers left alone", value: 73, n: 11, note: "2 wrongly held" },
];

export const AFTER_FIX: BarData[] = [
  { label: "Scams flagged", value: 100, n: 19, note: null },
  { label: "Genuine customers left alone", value: 91, n: 11, note: "1 warning" },
];
