import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { normalizeSearchText, searchIngredients } from "./search";

const ids = (query: string) => searchIngredients(BUILTIN_INGREDIENTS, query).map((d) => d.id);

describe("multilingual ingredient search", () => {
  it("finds by Simplified Chinese name", () => {
    expect(ids("五花肉")[0]).toBe("pork_belly_raw");
    expect(ids("小松菜")).toContain("komatsuna_raw");
  });

  it("finds by English name, case-insensitively", () => {
    expect(ids("pork belly")[0]).toBe("pork_belly_raw");
    expect(ids("SALMON")).toContain("salmon_atlantic_raw");
  });

  it("finds by Japanese name", () => {
    expect(ids("豚バラ")[0]).toBe("pork_belly_raw");
    expect(ids("ピーマン")).toContain("green_pepper_raw");
  });

  it("matches katakana and hiragana interchangeably", () => {
    expect(ids("みすじ")).toContain("beef_misuji_raw");
    expect(ids("ミスジ")).toContain("beef_misuji_raw");
    expect(ids("しいたけ")).toContain("shiitake_raw");
  });

  it("finds by alias and by stable ID", () => {
    expect(ids("misuji")).toContain("beef_misuji_raw");
    expect(ids("chicken_breast")).toContain("chicken_breast_skinless_raw");
  });

  it("normalizes full-width characters", () => {
    expect(normalizeSearchText("ＳＡＬＭＯＮ")).toBe("salmon");
  });

  it("ranks exact matches before substring matches", () => {
    expect(ids("米饭")[0]).toBe("rice_cooked");
  });

  it("returns everything for an empty query and nothing for nonsense", () => {
    expect(ids("  ")).toHaveLength(BUILTIN_INGREDIENTS.length);
    expect(ids("zzzz-not-a-food")).toEqual([]);
  });
});
