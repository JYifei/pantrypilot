import { describe, expect, it } from "vitest";
import { convertToGrams, isMassUnit } from "./units";

describe("convertToGrams", () => {
  it("converts mass units exactly", () => {
    expect(convertToGrams(251, "g")).toEqual({
      grams: 251,
      isEstimate: false,
      confidence: "exact",
    });
    expect(convertToGrams(1.5, "kg")).toEqual({
      grams: 1500,
      isEstimate: false,
      confidence: "exact",
    });
  });

  it("uses per-ingredient estimates for count units", () => {
    const result = convertToGrams(2, "bag", { bag: { estimatedGrams: 180, confidence: "low" } });
    expect(result).toEqual({ grams: 360, isEstimate: true, confidence: "low" });
  });

  it("does not assume a universal grams-per-unit", () => {
    expect(convertToGrams(1, "bag")).toBeNull();
    expect(
      convertToGrams(1, "piece", { bag: { estimatedGrams: 180, confidence: "low" } }),
    ).toBeNull();
  });

  it("derives litres from a per-ml estimate", () => {
    const result = convertToGrams(1, "l", { ml: { estimatedGrams: 1.03, confidence: "high" } });
    expect(result?.grams).toBeCloseTo(1030);
    expect(result?.isEstimate).toBe(true);
  });

  it("rejects invalid quantities", () => {
    expect(convertToGrams(-1, "g")).toBeNull();
    expect(convertToGrams(Number.NaN, "kg")).toBeNull();
  });

  it("identifies mass units", () => {
    expect(isMassUnit("g")).toBe(true);
    expect(isMassUnit("kg")).toBe(true);
    expect(isMassUnit("ml")).toBe(false);
    expect(isMassUnit("bag")).toBe(false);
  });
});
