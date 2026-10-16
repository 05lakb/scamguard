// The languages a customer's warning can be shown in. The names are written in each language.

export const LANGUAGES: { code: string; label: string; rtl: boolean }[] = [
  { code: "en", label: "English", rtl: false },
  { code: "hi", label: "हिन्दी (Hindi)", rtl: false },
  { code: "es", label: "Español (Spanish)", rtl: false },
  { code: "fr", label: "Français (French)", rtl: false },
  { code: "pt", label: "Português (Portuguese)", rtl: false },
  { code: "ar", label: "العربية (Arabic)", rtl: true },
];

export const isRightToLeft = (code: string | undefined) => LANGUAGES.some((item) => item.code === code && item.rtl);
