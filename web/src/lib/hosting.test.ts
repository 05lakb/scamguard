import { describe, expect, it } from "vitest";
import { HOST_LABEL, hostKind } from "./hosting";
import { NAV } from "./pages";

describe("where the app is served from", () => {
  it("labels local, Cloud Run and Firebase addresses honestly", () => {
    expect(hostKind("localhost")).toBe("local");
    expect(hostKind("127.0.0.1")).toBe("local");
    expect(hostKind("last-mile-guard-lcjgzaksea-uc.a.run.app")).toBe("cloud-run");
    expect(hostKind("lastmileguard.web.app")).toBe("firebase");
    expect(hostKind("example.com")).toBe("other");
    expect(HOST_LABEL.firebase).toBe("Firebase Hosting → Cloud Run");
  });
});

describe("top menu", () => {
  it("lists the product first, then the proof", () => {
    expect(NAV.filter((entry) => entry.group === "use").map((entry) => entry.label))
      .toEqual(["Dashboard", "Transactions", "Voice AI", "Cases", "Risk Profile"]);
    expect(NAV.filter((entry) => entry.group === "prove").map((entry) => entry.label))
      .toEqual(["Red Team", "Evidence", "How it's built"]);
  });
});
