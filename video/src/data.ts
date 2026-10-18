// The facts shown in the animated scenes. Keep these in step with the website's Evidence page
// (web/src/data/evidence.json) and the README. Check the loss figures against their sources before publishing.

export const LOSS_FIGURES = [
  { big: "₹22,845 crore", small: "lost by Indian citizens to cyber crime in 2024 (Ministry of Home Affairs)" },
  { big: "$442 billion", small: "lost to scams worldwide in a year (GASA and Feedzai, 2025)" },
];

export interface BarData {
  label: string;
  value: number; // percent
  n: number | null; // how many cases, when the source gives it
  note: string | null;
}

// A blind test of 50 cases written by someone else (README, Evaluation).
export const BLIND_TEST: BarData[] = [
  { label: "Scams flagged", value: 84, n: null, note: null },
  { label: "Genuine customers left alone", value: 88, n: null, note: "12% of genuine customers were stopped" },
];

// The latest fresh run of 40 cases with a Gemini-played customer (README, Evaluation).
export const LATEST_RUN: BarData[] = [
  { label: "Behaved as expected", value: 95, n: 40, note: null },
  { label: "Coached victims caught", value: 60, n: 5, note: "The hardest case: 3 of 5" },
];
