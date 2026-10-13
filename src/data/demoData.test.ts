import { describe, expect, it } from "vitest";
import { findBackupReferenceProblems, parseBackup, serializeBackup } from "@/domain/backup/backup";
import { legacyCookTransactions, recentCooks } from "@/domain/cooking/history";
import { buildShoppingList } from "@/domain/planning/shoppingList";
import { matchPlan } from "@/domain/recipes/matching";
import { DEFAULT_SETTINGS } from "@/domain/settings/settings";
import type { AppServices } from "@/services/appServices";
import { createTestServices, fixedClock } from "@/test/testDatabase";
import { BUILTIN_INGREDIENTS } from "./builtinIngredients";
import { BUILTIN_RECIPES } from "./builtinRecipes";
import { buildDemoBackup } from "./demoData";

const TODAY = "2026-10-10";
const builtinIds = new Set(BUILTIN_INGREDIENTS.map((d) => d.id));

/** What a demo viewer sees: every recipe's readiness and the gaps of the planned dishes. */
async function demoOutcome(services: AppServices) {
  const [recipes, lots, definitions, entries] = await Promise.all([
    services.recipes.listAll(),
    services.inventory.listLots(),
    services.ingredients.listAll(),
    services.plan.listEntries(),
  ]);
  const definitionsById = new Map(definitions.map((d) => [d.id, d]));
  const context = { lots, definitionsById, today: TODAY };
  const readiness = recipes
    .map((recipe) => [
      recipe.id,
      matchPlan([{ recipe, servings: recipe.servings }], context)[0]!.readiness,
    ])
    .sort();
  const planned = entries.map((entry) => ({
    entry,
    recipe: recipes.find((r) => r.id === entry.recipeId)!,
  }));
  const matches = matchPlan(
    planned.map(({ entry, recipe }) => ({ recipe, servings: entry.servings })),
    context,
  );
  const list = buildShoppingList(
    matches.map((match, i) => ({
      entryId: planned[i]!.entry.id,
      match,
      choices: planned[i]!.entry.choices,
    })),
    definitionsById,
  );
  return {
    readiness,
    gaps: list.gaps.map((g) => [g.ingredientId, g.neededGrams, g.inStockGrams, g.gapGrams]),
  };
}

describe("demo data", () => {
  const backup = buildDemoBackup(TODAY, DEFAULT_SETTINGS);

  it("is a valid current backup with no broken references", () => {
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    expect(findBackupReferenceProblems(backup, builtinIds)).toEqual([]);
  });

  it("uses only built-in ingredients and links sessions to built-in recipes or a deleted one", () => {
    for (const lot of backup.data.inventoryLots) {
      expect(builtinIds.has(lot.ingredientDefinitionId)).toBe(true);
    }
    const recipeIds = new Set(BUILTIN_RECIPES.map((r) => r.id));
    const linked = backup.data.cookingSessions.map((s) => s.recipeId ?? "");
    expect(linked.filter((id) => !recipeIds.has(id))).toEqual(["recipe-demo-removed"]);
  });

  it("keeps every lot equal to what was added minus what was deducted", () => {
    for (const lot of backup.data.inventoryLots) {
      const rows = backup.data.transactions.filter((t) => t.inventoryLotId === lot.id);
      const sum = (key: "quantityG" | "quantityCount", type: string) =>
        rows.filter((t) => t.type === type).reduce((total, t) => total + (t[key] ?? 0), 0);
      if (lot.remainingWeightG !== undefined) {
        expect(sum("quantityG", "add") - sum("quantityG", "consume")).toBe(lot.remainingWeightG);
      }
      if (lot.count !== undefined) {
        expect(sum("quantityCount", "add") - sum("quantityCount", "consume")).toBe(lot.count);
      }
    }
  });

  it("is dated relative to today", () => {
    const later = buildDemoBackup("2027-03-01", DEFAULT_SETTINGS);
    expect(backup.data.cookingSessions.map((s) => s.localDate)).toEqual([
      "2026-10-01",
      "2026-10-05",
      "2026-10-08",
      "2026-10-09",
    ]);
    expect(later.data.cookingSessions.map((s) => s.localDate)).toEqual([
      "2027-02-20",
      "2027-02-24",
      "2027-02-27",
      "2027-02-28",
    ]);
    const spinach = backup.data.inventoryLots.find((l) => l.id === "lot-demo-spinach");
    expect(spinach?.expirationDate).toBe("2026-10-09");
  });

  it("imports, shows repeat hints and keeps the pre-session rows separate", async () => {
    const services = await createTestServices();
    const result = await services.backup.importReplacingAll(backup);
    expect(result).toMatchObject({ ok: true, counts: { cookingSessions: 4, inventoryLots: 7 } });

    const sessions = await services.recipes.listSessions();
    expect(sessions).toHaveLength(4);
    const recent = recentCooks(sessions, TODAY, DEFAULT_SETTINGS.repeatHintDays);
    expect([...recent.keys()].sort()).toEqual(["recipe_egg_fried_rice", "recipe_gyudon"]);

    const legacy = legacyCookTransactions(await services.inventory.listTransactions());
    expect(legacy).toHaveLength(2);
    expect(legacy.every((t) => t.recipeId === "recipe_japanese_curry")).toBe(true);
  });

  it("gives the same recommendations and gaps again after a reset", async () => {
    const services = await createTestServices(fixedClock(`${TODAY}T09:00:00.000Z`));
    const load = async () => {
      expect((await services.backup.importReplacingAll(backup)).ok).toBe(true);
      for (const id of ["recipe_oyakodon", "recipe_gyudon"]) {
        expect((await services.plan.addRecipe(id, 2)).ok).toBe(true);
      }
      return demoOutcome(services);
    };

    const first = await load();
    expect(first.gaps).toContainEqual(["onion_raw", 250, 100, 150]);
    expect(first.readiness.some(([, r]) => r === "ready")).toBe(true);

    const lot = await services.inventory.addLot({
      ingredientDefinitionId: "onion_raw",
      originalWeightG: 520,
      processing: [],
      storage: "refrigerated",
      opened: false,
    });
    expect((await demoOutcome(services)).gaps).not.toEqual(first.gaps);
    expect(lot.remainingWeightG).toBe(520);

    expect(await load()).toEqual(first);
  });

  it("writes the note in the chosen language", () => {
    const japanese = buildDemoBackup(TODAY, { ...DEFAULT_SETTINGS, language: "ja-JP" });
    const gyudon = japanese.data.cookingSessions.find((s) => s.id === "session-demo-gyudon");
    expect(gyudon?.note).toBe("つゆを少し多めに。");
  });
});
