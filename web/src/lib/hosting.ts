// Where this page is being served from, for honest labels on the Dashboard and How it's built.

export type HostKind = "local" | "cloud-run" | "firebase" | "other";

export function hostKind(hostname: string): HostKind {
  if (hostname === "localhost" || hostname === "[::1]" || /^127\./.test(hostname) || hostname.endsWith(".localhost")) return "local";
  if (hostname.endsWith(".run.app")) return "cloud-run";
  if (hostname.endsWith(".web.app") || hostname.endsWith(".firebaseapp.com")) return "firebase";
  return "other";
}

export const HOST_LABEL: Record<HostKind, string> = {
  local: "Local / preview server",
  "cloud-run": "Cloud Run · live URL",
  firebase: "Firebase Hosting → Cloud Run",
  other: "Hosted service",
};
