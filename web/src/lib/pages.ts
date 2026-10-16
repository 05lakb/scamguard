// The pages of the command centre, in navigation order.

import type { IconName } from "../components/Icon";

export type Page =
  | "dashboard" | "analyzer" | "voice" | "analytics" | "network" | "profile" | "geography"
  | "analyst" | "lab" | "evidence" | "architecture";

export const NAV: { id: Page; label: string; icon: IconName; secondary?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "analyzer", label: "Transactions", icon: "activity" },
  { id: "voice", label: "Voice AI", icon: "mic" },
  { id: "analytics", label: "Analytics", icon: "chart" },
  { id: "network", label: "Network", icon: "network" },
  { id: "profile", label: "Risk Profile", icon: "user" },
  { id: "geography", label: "Geography", icon: "map" },
  { id: "analyst", label: "Analyst", icon: "flag" },
  { id: "lab", label: "Scenario Lab", icon: "flask" },
  { id: "evidence", label: "Evidence", icon: "list", secondary: true },
  { id: "architecture", label: "Architecture", icon: "cloud", secondary: true },
];
