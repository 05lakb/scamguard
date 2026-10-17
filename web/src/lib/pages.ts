// The pages of the command centre, in navigation order.

import type { IconName } from "../components/Icon";

export type Page =
  | "dashboard" | "analyzer" | "voice" | "analyst" | "profile" | "lab" | "evidence" | "architecture";

// "use": the product. "prove": the red team, the measured evidence, and how it is built.
export const NAV: { id: Page; label: string; icon: IconName; group: "use" | "prove" }[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid", group: "use" },
  { id: "analyzer", label: "Transactions", icon: "activity", group: "use" },
  { id: "voice", label: "Voice AI", icon: "mic", group: "use" },
  { id: "analyst", label: "Cases", icon: "flag", group: "use" },
  { id: "profile", label: "Risk Profile", icon: "user", group: "use" },
  { id: "lab", label: "Red Team", icon: "flask", group: "prove" },
  { id: "evidence", label: "Evidence", icon: "list", group: "prove" },
  { id: "architecture", label: "How it's built", icon: "cloud", group: "prove" },
];
