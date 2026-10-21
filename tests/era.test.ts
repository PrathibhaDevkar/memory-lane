import { describe, expect, it } from "vitest";
import { eraWindow } from "@/lib/era";

describe("eraWindow", () => {
  it("is ages 10–30, matching the Phase 0 personas", () => {
    expect(eraWindow(1942, 2026)).toEqual({ start: 1952, end: 1972 }); // Rosa
    expect(eraWindow(1950, 2026)).toEqual({ start: 1960, end: 1980 }); // Walt
    expect(eraWindow(1958, 2026)).toEqual({ start: 1968, end: 1988 }); // June
  });

  it("never reaches into the future", () => {
    expect(eraWindow(2000, 2026)).toEqual({ start: 2010, end: 2026 });
  });

  it("rejects a birth year with no window yet", () => {
    expect(() => eraWindow(2020, 2026)).toThrow(RangeError);
  });

  it("rejects non-integer years", () => {
    expect(() => eraWindow(1942.5, 2026)).toThrow(RangeError);
  });
});
