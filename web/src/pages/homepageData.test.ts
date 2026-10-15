import { describe, expect, it } from "vitest";
import { INDUSTRY_STATS, INSIGHTS, JOURNEY, PREVIEW_TABS } from "./homepageData";

describe("research-backed homepage content", () => {
  it("has a six-stage journey with distinct stages", () => {
    expect(JOURNEY).toHaveLength(6);
    expect(new Set(JOURNEY.map((step) => step.id)).size).toBe(JOURNEY.length);
    expect(JOURNEY.at(-1)?.id).toBe("review");
  });
  it("attributes industry figures to original public sources", () => {
    expect(INDUSTRY_STATS).toHaveLength(3);
    for (const stat of INDUSTRY_STATS) {
      expect(stat.detail).toMatch(/202[45]/);
      expect(stat.url).toMatch(/^https:\/\/(www\.)?(ftc\.gov|rbi\.org\.in)\//);
    }
    expect(INSIGHTS).toHaveLength(3);
    expect(INSIGHTS.every((item) => item.url.startsWith("https://"))).toBe(true);
  });
  it("labels the demonstration as synthetic", () => {
    expect(PREVIEW_TABS).toHaveLength(3);
    expect(JOURNEY.some((step) => step.limitation?.includes("Demo-only"))).toBe(true);
  });
});
