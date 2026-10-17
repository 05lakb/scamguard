import { describe, expect, it } from "vitest";
import { currentAction, needsReview } from "./cases";

describe("where a case stands after the analyst decides", () => {
  it("follows the engine until the analyst decides", () => {
    expect(currentAction({ action: "hold", status: "open" })).toBe("hold");
    expect(currentAction({ action: "warn", status: "open" })).toBe("warn");
  });

  it("an approved hold is now allowed, and leaves the review queue", () => {
    expect(currentAction({ action: "hold", status: "approved" })).toBe("allow");
    expect(needsReview({ action: "hold", status: "approved" } as Parameters<typeof needsReview>[0])).toBe(false);
  });

  it("kept on hold or escalated stays held", () => {
    expect(currentAction({ action: "warn", status: "held" })).toBe("hold");
    expect(currentAction({ action: "hold", status: "escalated" })).toBe("hold");
  });
});
