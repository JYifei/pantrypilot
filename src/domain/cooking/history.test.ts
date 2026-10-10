import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import type { InventoryLot, InventoryTransaction } from "../inventory/types";
import type { RecipeMatch, RecipeReadiness } from "../recipes/matching";
import type { Recipe } from "../recipes/types";
import {
  groupSessionsByDay,
  legacyCookTransactions,
  recentCooks,
  sessionRecipeStatus,
  snapshotItem,
  sortSessions,
  sortWithRepeatHints,
} from "./history";
import type { CookingSession } from "./types";

const definition = (id: string) => BUILTIN_INGREDIENTS.find((d) => d.id === id);

function lot(overrides: Partial<InventoryLot>): InventoryLot {
  return {
    id: "lot",
    ingredientDefinitionId: "onion_raw",
    processing: [],
    storage: "refrigerated",
    opened: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function session(id: string, recipeId: string | undefined, localDate: string): CookingSession {
  return {
    id,
    cookedAt: `${localDate}T12:00:00.000Z`,
    localDate,
    recipeId,
    recipeName: { zhCN: id },
    servings: 2,
    items: [],
  };
}

function match(id: string, readiness: RecipeReadiness, urgency = 0): RecipeMatch {
  return {
    recipe: { id } as RecipeMatch["recipe"],
    servings: 2,
    lines: [],
    shortLines: [],
    unconfirmedLines: [],
    readiness,
    urgency,
    expiringUses: [],
    expiringLotIds: [],
  };
}

describe("snapshotItem", () => {
  it("records weighed grams as exact", () => {
    const item = snapshotItem("onion", lot({ remainingWeightG: 200 }), definition("onion_raw"), {
      grams: 80,
    });
    expect(item).toMatchObject({
      grams: 80,
      weightBasis: "exact",
      ingredientName: { zhCN: "洋葱" },
    });
  });

  it("keeps the count and marks the gram figure as an estimate", () => {
    const item = snapshotItem(
      "egg",
      lot({ ingredientDefinitionId: "egg_whole", count: 6, unit: "piece" }),
      definition("egg_whole"),
      { count: 3 },
    );
    expect(item).toMatchObject({
      count: 3,
      unit: "piece",
      estimatedGrams: 150,
      weightBasis: "estimated",
    });
  });

  it("says the weight is unknown when the unit has no estimate", () => {
    const item = snapshotItem(
      "mushroom",
      lot({ ingredientDefinitionId: "shimeji_raw", count: 1, unit: "bag" }),
      definition("shimeji_raw"),
      { count: 1 },
    );
    expect(item).toMatchObject({ count: 1, unit: "bag", weightBasis: "unknown" });
    expect(item.estimatedGrams).toBeUndefined();
  });

  it("flags bone-in lots, whose grams are purchased weight", () => {
    const item = snapshotItem(
      "wing",
      lot({ ingredientDefinitionId: "chicken_wing_raw", remainingWeightG: 500, boneIn: true }),
      definition("chicken_wing_raw"),
      { grams: 300 },
    );
    expect(item).toMatchObject({ boneIn: true, grams: 300 });
  });
});

describe("recentCooks", () => {
  const sessions = [
    session("a1", "recipe_a", "2026-10-10"),
    session("a2", "recipe_a", "2026-10-08"),
    session("b", "recipe_b", "2026-10-07"),
    session("c", undefined, "2026-10-10"),
    session("future", "recipe_f", "2026-10-12"),
  ];

  it("counts today and the previous days inside the window", () => {
    const recent = recentCooks(sessions, "2026-10-10", 3);
    expect([...recent.values()]).toEqual([{ recipeId: "recipe_a", daysAgo: 0, times: 2 }]);
    expect(recentCooks(sessions, "2026-10-10", 4).get("recipe_b")).toEqual({
      recipeId: "recipe_b",
      daysAgo: 3,
      times: 1,
    });
  });

  it("is off at 0 days and ignores sessions without a recipe or dated in the future", () => {
    expect(recentCooks(sessions, "2026-10-10", 0).size).toBe(0);
    const recent = recentCooks(sessions, "2026-10-10", 7);
    expect([...recent.keys()].sort()).toEqual(["recipe_a", "recipe_b"]);
  });
});

describe("sortWithRepeatHints", () => {
  const matches = [
    match("cooked_ready", "ready", 5),
    match("fresh_ready", "ready"),
    match("fresh_almost", "almost", 9),
    match("cooked_almost", "almost"),
  ];
  const recent = recentCooks(
    [session("s1", "cooked_ready", "2026-10-09"), session("s2", "cooked_almost", "2026-10-10")],
    "2026-10-10",
    3,
  );

  it("moves recently cooked recipes after the others of the same readiness", () => {
    expect(sortWithRepeatHints(matches, recent).map((m) => m.recipe.id)).toEqual([
      "fresh_ready",
      "cooked_ready",
      "fresh_almost",
      "cooked_almost",
    ]);
  });

  it("never lets a repeat hint push a ready recipe below one that is not ready", () => {
    const sorted = sortWithRepeatHints(matches, recent);
    expect(sorted.findIndex((m) => m.recipe.id === "cooked_ready")).toBeLessThan(
      sorted.findIndex((m) => m.recipe.id === "fresh_almost"),
    );
  });

  it("keeps the usual order when the hint is off", () => {
    expect(sortWithRepeatHints(matches, new Map()).map((m) => m.recipe.id)).toEqual([
      "cooked_ready",
      "fresh_ready",
      "fresh_almost",
      "cooked_almost",
    ]);
  });
});

describe("history lists", () => {
  it("orders sessions newest first with a stable tie-break", () => {
    const sorted = sortSessions([
      session("b", "r", "2026-10-09"),
      session("c", "r", "2026-10-10"),
      session("a", "r", "2026-10-09"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("lists only cooking deductions that have no session, one by one", () => {
    const tx = (id: string, extra: Partial<InventoryTransaction>): InventoryTransaction => ({
      id,
      inventoryLotId: "lot",
      type: "consume",
      createdAt: "2026-10-02T10:00:00.000Z",
      ...extra,
    });
    const legacy = legacyCookTransactions([
      tx("plain", {}),
      tx("old-1", { recipeId: "recipe_gyudon" }),
      tx("old-2", { recipeId: "recipe_gyudon" }),
      tx("new", { recipeId: "recipe_gyudon", cookingSessionId: "s" }),
      tx("added", { type: "add", recipeId: "recipe_gyudon" }),
    ]);
    expect(legacy.map((t) => t.id)).toEqual(["old-1", "old-2"]);
  });

  it("splits the last 7 days from older sessions and groups by local date", () => {
    const { recent, older } = groupSessionsByDay(
      [
        session("today", "r", "2026-10-10"),
        session("week-edge", "r", "2026-10-04"),
        session("too-old", "r", "2026-10-03"),
        { ...session("today-early", "r", "2026-10-10"), cookedAt: "2026-10-10T07:00:00.000Z" },
      ],
      "2026-10-10",
    );
    expect(recent.map((d) => [d.localDate, d.sessions.map((s) => s.id)])).toEqual([
      ["2026-10-10", ["today", "today-early"]],
      ["2026-10-04", ["week-edge"]],
    ]);
    expect(older.map((d) => d.localDate)).toEqual(["2026-10-03"]);
  });

  it("tells whether the recipe was deleted or saved after cooking", () => {
    const cooked = session("s", "recipe_x", "2026-10-05");
    const recipes = (updatedAt?: string, isBuiltin = false) =>
      new Map([["recipe_x", { id: "recipe_x", isBuiltin, updatedAt } as Recipe]]);
    expect(sessionRecipeStatus(cooked, new Map())).toBe("deleted");
    expect(sessionRecipeStatus(cooked, recipes())).toBe("current");
    expect(sessionRecipeStatus(cooked, recipes("2026-10-05T11:00:00.000Z"))).toBe("current");
    expect(sessionRecipeStatus(cooked, recipes("2026-10-06T09:00:00.000Z"))).toBe("changed");
    expect(sessionRecipeStatus(cooked, recipes("2026-10-06T09:00:00.000Z", true))).toBe("current");
    expect(sessionRecipeStatus(session("s", undefined, "2026-10-05"), new Map())).toBe("unlinked");
  });
});
