import { describe, expect, it } from "vitest";
import { caseReference, findByReference, recordedCases, referenceOf, type CaseItem } from "./cases";

const live = (id: string, requestId?: string, savedId?: string): CaseItem => ({
  ...recordedCases()[0],
  id,
  source: "live",
  savedId,
  execution: requestId ? { request_id: requestId, backend: "test", duration_ms: 1, message_mode: "not_requested", network_checked: false, model: null } : undefined,
});

describe("case references", () => {
  it("are made from the backend request id", () => {
    expect(caseReference("7f3a2c91be04")).toBe("LMG-7F3A2C");
    expect(caseReference(undefined)).toBeNull();
    expect(caseReference("not-hex!")).toBeNull();
    expect(referenceOf(live("TXN-001", "abcdef123456"))).toBe("LMG-ABCDEF");
    expect(referenceOf(live("SAVED-111111", undefined, "111111aaaaaa"))).toBe("LMG-111111");
    expect(referenceOf(recordedCases()[0])).toBeNull();
  });

  it("find the case however the caller reads the reference out", () => {
    const cases = [live("TXN-001", "abcdef123456"), live("TXN-002", "7f3a2c91be04"), ...recordedCases()];
    for (const typed of ["LMG-7F3A2C", "lmg 7f3a2c", "7F3A2C", "  lmg-7f3a2c "]) {
      expect(findByReference(cases, typed)?.id).toBe("TXN-002");
    }
    expect(findByReference(cases, "txn-001")?.id).toBe("TXN-001");
    expect(findByReference(cases, "S001")?.id).toBe("S001");
  });

  it("finds nothing for unknown or too-short references", () => {
    const cases = [live("TXN-001", "abcdef123456")];
    expect(findByReference(cases, "LMG-000000")).toBeNull();
    expect(findByReference(cases, "LMG")).toBeNull();
    expect(findByReference(cases, "ab")).toBeNull();
  });
});
