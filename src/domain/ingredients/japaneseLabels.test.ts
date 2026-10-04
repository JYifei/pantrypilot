import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { parseJapaneseMeatLabel } from "./japaneseLabels";
import { resolveDefinitionForCut } from "./resolve";

describe("parseJapaneseMeatLabel", () => {
  it.each([
    ["牛ミスジステーキ用", { species: "beef", cut: "misuji", form: "steak" }],
    ["国産牛 肩ロース 焼肉用", { species: "beef", cut: "shoulder_loin", form: "yakiniku_slice" }],
    ["豚バラ しゃぶしゃぶ用", { species: "pork", cut: "belly", form: "shabu_shabu_slice" }],
    ["豚ロース 生姜焼き用", { species: "pork", cut: "loin", form: "shogayaki_slice" }],
    ["豚肩ロース ブロック", { species: "pork", cut: "shoulder_loin", form: "block" }],
    ["牛もも すき焼き用", { species: "beef", cut: "round", form: "sukiyaki_slice" }],
    ["若鶏もも", { species: "chicken", cut: "thigh" }],
    ["豚もも 薄切り", { species: "pork", cut: "leg", form: "thin_slice" }],
    ["豚こま切れ", { species: "pork", cut: "komagire", form: "thin_slice" }],
    ["牛切り落とし", { species: "beef", cut: "kiriotoshi", form: "thin_slice" }],
    ["合挽ひき肉", { cut: "ground", form: "ground" }],
    ["鶏ささみ", { species: "chicken", cut: "tender" }],
    ["手羽元", { cut: "drumette" }],
  ])("%s", (label, expected) => {
    expect(parseJapaneseMeatLabel(label)).toEqual(expected);
  });

  it("returns an empty result for unrelated text", () => {
    expect(parseJapaneseMeatLabel("小松菜")).toEqual({});
  });
});

describe("resolveDefinitionForCut", () => {
  it("prefers a definition with the exact cut", () => {
    expect(resolveDefinitionForCut(BUILTIN_INGREDIENTS, "beef", "misuji")?.id).toBe(
      "beef_misuji_raw",
    );
  });

  it("falls back to the species' unspecified definition", () => {
    expect(resolveDefinitionForCut(BUILTIN_INGREDIENTS, "beef", "rump")?.id).toBe(
      "beef_unspecified_raw",
    );
    expect(resolveDefinitionForCut(BUILTIN_INGREDIENTS, "pork", undefined)?.id).toBe(
      "pork_unspecified_raw",
    );
  });
});
