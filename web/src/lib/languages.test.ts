// Tests for the language choices behind the customer's warning.

import { describe, expect, it } from "vitest";
import { LANGUAGES, isRightToLeft } from "./languages";

describe("warning languages", () => {
  it("offers English first and the five translations the server accepts", () => {
    expect(LANGUAGES.map((item) => item.code)).toEqual(["en", "hi", "es", "fr", "pt", "ar"]);
    expect(LANGUAGES.every((item) => item.label.length > 0)).toBe(true);
  });

  it("marks only Arabic as right to left", () => {
    expect(isRightToLeft("ar")).toBe(true);
    for (const code of ["en", "hi", "es", "fr", "pt", undefined, "zz"]) expect(isRightToLeft(code)).toBe(false);
  });
});
