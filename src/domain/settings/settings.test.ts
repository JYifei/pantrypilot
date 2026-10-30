import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("defaults to zh-CN, JPY and JP", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ language: "zh-CN", currency: "JPY", region: "JP" });
  });

  it("keeps valid values and drops invalid ones", () => {
    expect(normalizeSettings({ language: "ja-JP", theme: "neon", currency: 42 })).toEqual({
      ...DEFAULT_SETTINGS,
      language: "ja-JP",
    });
  });

  it("shows Chinese to anyone who had chosen the removed English UI", () => {
    expect(normalizeSettings({ language: "en-US", theme: "dark" })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "dark",
    });
  });
});
