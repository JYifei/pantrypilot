import { describe, expect, it } from "vitest";
import { compareByExpiration, getExpirationStatus, isExpiringSoon } from "./expiration";

const TODAY = "2026-10-04";

describe("getExpirationStatus", () => {
  it.each([
    ["2026-10-01", "expired"],
    ["2026-10-03", "expired"],
    ["2026-10-04", "today"],
    ["2026-10-05", "tomorrow"],
    ["2026-10-06", "soon"],
    ["2026-10-07", "soon"],
    ["2026-10-08", "normal"],
    ["2027-01-01", "normal"],
  ] as const)("%s → %s", (date, expected) => {
    expect(getExpirationStatus(date, TODAY)).toBe(expected);
  });

  it("handles month and year boundaries", () => {
    expect(getExpirationStatus("2027-01-01", "2026-12-31")).toBe("tomorrow");
    expect(getExpirationStatus("2026-11-01", "2026-10-31")).toBe("tomorrow");
  });

  it("returns unknown for missing or invalid dates", () => {
    expect(getExpirationStatus(undefined, TODAY)).toBe("unknown");
    expect(getExpirationStatus("2026-02-30", TODAY)).toBe("unknown");
    expect(getExpirationStatus("tomorrow", TODAY)).toBe("unknown");
  });

  it("classifies expiring-soon states", () => {
    expect(isExpiringSoon("today")).toBe(true);
    expect(isExpiringSoon("soon")).toBe(true);
    expect(isExpiringSoon("expired")).toBe(false);
    expect(isExpiringSoon("normal")).toBe(false);
  });
});

describe("compareByExpiration", () => {
  it("sorts earliest first and undated lots last", () => {
    const lots = [
      { id: "a", expirationDate: "2026-10-10" },
      { id: "b" },
      { id: "c", expirationDate: "2026-10-02" },
      { id: "d", expirationDate: "2026-10-05" },
    ];
    expect([...lots].sort(compareByExpiration).map((l) => l.id)).toEqual(["c", "d", "a", "b"]);
  });
});
