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
  higherIsBetter?: boolean; // false for a cost, such as genuine customers interrupted
}

// The paired run: the same 50 synthetic payments (25 scams, 25 genuine), first round, before any customer answer
// (README, Evaluation; raw report on the Evidence page).
export const PAIRED_RUN: { label: string; rules: BarData; gemini: BarData }[] = [
  {
    label: "Scams warned or held",
    rules: { label: "Payment rules alone", value: 44, n: 11, note: null, higherIsBetter: true },
    gemini: { label: "Rules + Gemini", value: 52, n: 13, note: null, higherIsBetter: true },
  },
  {
    label: "Genuine customers asked, warned or held",
    rules: { label: "Payment rules alone", value: 4, n: 1, note: null, higherIsBetter: false },
    gemini: { label: "Rules + Gemini", value: 64, n: 16, note: "mostly asked a question, not blocked", higherIsBetter: false },
  },
];
