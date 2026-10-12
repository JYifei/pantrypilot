import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { parseBackup, serializeBackup } from "@/domain/backup/backup";
import { MIGRATIONS } from "@/db/migrations";
import { createSqlJsDatabase } from "@/db/sqljsDatabase";
import { buildShoppingList } from "@/domain/planning/shoppingList";
import { planItemId } from "@/domain/planning/types";
import { matchPlan, planCooking } from "@/domain/recipes/matching";
import type { AppServices } from "@/services/appServices";
import { createAppServices } from "@/services/appServices";
import { createTestServices, fixedClock } from "@/test/testDatabase";
import type { LotInput } from "./inventoryService";
import type { RecipeInput } from "./recipeService";

const clock = fixedClock("2026-10-12T09:00:00.000Z");
const TODAY = "2026-10-12";

const onionLot = (grams: number): LotInput => ({
  ingredientDefinitionId: "onion_raw",
  originalWeightG: grams,
  processing: [],
  storage: "refrigerated",
  opened: false,
});

const onionDish = (name: string): RecipeInput => ({
  name: { zhCN: name },
  servings: 2,
  tags: [],
  ingredients: [{ key: "onion", ingredientId: "onion_raw", grams: 80 }],
  seasonings: [{ zhCN: "酱油" }],
  steps: [{ zhCN: "炒" }],
});

/** The list the plan page shows, computed from what the services return. */
async function shoppingList(services: AppServices) {
  const [entries, recipes, lots, definitions] = await Promise.all([
    services.plan.listEntries(),
    services.recipes.listAll(),
    services.inventory.listLots(),
    services.ingredients.listAll(),
  ]);
  const definitionsById = new Map(definitions.map((d) => [d.id, d]));
  const planned = entries.map((entry) => ({
    entry,
    recipe: recipes.find((r) => r.id === entry.recipeId)!,
  }));
  const matches = matchPlan(
    planned.map(({ entry, recipe }) => ({ recipe, servings: entry.servings })),
    { lots, definitionsById, today: TODAY },
  );
  return {
    matches,
    list: buildShoppingList(
      matches.map((match, i) => ({
        entryId: planned[i]!.entry.id,
        match,
        choices: planned[i]!.entry.choices,
      })),
      definitionsById,
    ),
  };
}

async function setUp() {
  const services = await createTestServices(clock);
  const onion = await services.inventory.addLot(onionLot(100));
  const a = await services.recipes.createCustom(onionDish("洋葱炒蛋"));
  const b = await services.recipes.createCustom(onionDish("洋葱汤"));
  const first = await services.plan.addRecipe(a.id, 2);
  const second = await services.plan.addRecipe(b.id, 2);
  if (!first.ok || !second.ok) throw new Error("could not plan");
  return { services, onion, a, b, entryA: first.entry, entryB: second.entry };
}

describe("meal plan", () => {
  it("merges the shared onion into one 60 g gap", async () => {
    const { services } = await setUp();
    const { list } = await shoppingList(services);
    expect(list.gaps).toHaveLength(1);
    expect(list.gaps[0]).toMatchObject({
      ingredientId: "onion_raw",
      neededGrams: 160,
      inStockGrams: 100,
      gapGrams: 60,
    });
    expect(list.seasonings).toHaveLength(1);
  });

  it("never changes inventory while planning or ticking items", async () => {
    const { services, entryA } = await setUp();
    const lotsBefore = await services.inventory.listLots();
    const transactionsBefore = await services.inventory.listTransactions();

    expect(await services.plan.setServings(entryA.id, 4)).toEqual({ ok: true });
    expect(await services.plan.updatePlanItem("onion_raw", { bought: true })).toEqual({ ok: true });
    expect(
      await services.plan.updatePlanItem("onion_raw", { plannedGrams: 300, note: "1 网袋" }),
    ).toEqual({ ok: true });
    expect(await services.plan.addManualItem("牛奶", "1 L")).toEqual({ ok: true });
    await services.plan.clearBought();

    expect(await services.inventory.listLots()).toEqual(lotsBefore);
    expect(await services.inventory.listTransactions()).toEqual(transactionsBefore);
    expect(await services.recipes.listSessions()).toEqual([]);
    expect((await services.plan.listItems()).map((i) => i.label ?? i.id)).toEqual(["牛奶"]);
  });

  it("validates input", async () => {
    const { services, a, entryA } = await setUp();
    expect(await services.plan.addRecipe(a.id, 2)).toMatchObject({
      ok: true,
      alreadyPlanned: true,
      entry: { id: entryA.id },
    });
    expect(await services.plan.addRecipe("nope", 2)).toEqual({
      ok: false,
      error: "recipe_not_found",
    });
    expect(await services.plan.setServings(entryA.id, 0)).toEqual({
      ok: false,
      error: "invalid_servings",
    });
    expect(await services.plan.setServings(entryA.id, 1.5)).toEqual({
      ok: false,
      error: "invalid_servings",
    });
    expect(await services.plan.setChoice(entryA.id, "onion", "egg_whole")).toEqual({
      ok: false,
      error: "invalid_choice",
    });
    expect(await services.plan.updatePlanItem("onion_raw", { plannedGrams: -1 })).toEqual({
      ok: false,
      error: "invalid_amount",
    });
    expect(await services.plan.addManualItem("   ")).toEqual({ ok: false, error: "invalid_text" });
  });

  it("stores the chosen alternative per line", async () => {
    const services = await createTestServices(clock);
    const rice = await services.recipes.createCustom({
      ...onionDish("饭"),
      ingredients: [
        {
          key: "rice",
          ingredientId: "rice_cooked",
          grams: 400,
          alternatives: [{ ingredientId: "rice_white_raw", ratio: 0.45 }],
        },
      ],
    });
    const added = await services.plan.addRecipe(rice.id, 2);
    if (!added.ok) throw new Error("could not plan");
    expect(await services.plan.setChoice(added.entry.id, "rice", "rice_white_raw")).toEqual({
      ok: true,
    });
    expect(
      (await shoppingList(services)).list.gaps.map((g) => [g.ingredientId, g.gapGrams]),
    ).toEqual([["rice_white_raw", 180]]);
    await services.plan.setChoice(added.entry.id, "rice", null);
    expect((await services.plan.listEntries())[0]!.choices).toEqual({});
  });

  it("follows the demo flow: buy one pack, enter it as stock, cook from the plan", async () => {
    const { services, a, b, entryA, entryB } = await setUp();
    await services.plan.updatePlanItem("onion_raw", { bought: true, note: "1 个" });

    // Entering stock is a separate step with the actual weight and dates.
    await services.inventory.addLot({ ...onionLot(180), expirationDate: "2026-10-20" });
    await services.plan.resetPlanItem("onion_raw");
    const afterPurchase = await shoppingList(services);
    expect(afterPurchase.list.gaps).toEqual([]);
    expect(await services.plan.listItems()).toEqual([]);

    const cookA = await services.recipes.cook(
      a.id,
      planCooking(afterPurchase.matches[0]!),
      "op-a",
      { servings: 2, planEntryId: entryA.id },
    );
    expect(cookA).toMatchObject({ ok: true });
    expect((await services.plan.listEntries()).map((e) => e.id)).toEqual([entryB.id]);

    await services.plan.updatePlanItem("onion_raw", { note: "kept while the plan has dishes" });
    const remaining = await shoppingList(services);
    const cookB = await services.recipes.cook(b.id, planCooking(remaining.matches[0]!), "op-b", {
      servings: 2,
      planEntryId: entryB.id,
    });
    expect(cookB).toMatchObject({ ok: true });
    expect(await services.plan.listEntries()).toEqual([]);
    expect(await services.plan.listItems()).toEqual([]);

    const lots = await services.inventory.listLots();
    const total = lots.reduce((sum, lot) => sum + (lot.remainingWeightG ?? 0), 0);
    expect(total).toBe(100 + 180 - 160);
    const sessions = await services.recipes.listSessions();
    expect(sessions.map((s) => s.recipeId).sort()).toEqual([a.id, b.id].sort());
  });

  it("does not touch the plan when cooking without a plan entry", async () => {
    const { services, a } = await setUp();
    const { matches } = await shoppingList(services);
    await services.recipes.cook(a.id, planCooking(matches[0]!), "op", { servings: 2 });
    expect(await services.plan.listEntries()).toHaveLength(2);
  });

  it("removes plan entries of a deleted recipe", async () => {
    const { services, a, entryB } = await setUp();
    expect(await services.recipes.deleteCustom(a.id)).toEqual({ ok: true });
    expect((await services.plan.listEntries()).map((e) => e.id)).toEqual([entryB.id]);
  });

  it("forgets the gap state when the plan is emptied, but keeps manual items", async () => {
    const { services, entryA } = await setUp();
    await services.plan.updatePlanItem("onion_raw", { bought: true });
    await services.plan.addManualItem("牛奶");
    await services.plan.removeEntry(entryA.id);
    expect((await services.plan.listItems()).map((i) => i.id)).toContain(planItemId("onion_raw"));
    await services.plan.clearPlan();
    expect(await services.plan.listEntries()).toEqual([]);
    expect((await services.plan.listItems()).map((i) => i.label)).toEqual(["牛奶"]);
  });

  it("round-trips the plan and the list through a backup", async () => {
    const { services, entryA } = await setUp();
    await services.plan.setServings(entryA.id, 3);
    await services.plan.updatePlanItem("onion_raw", { bought: true, plannedGrams: 200 });
    await services.plan.addManualItem("牛奶", "1 L");
    const exported = await services.backup.exportAll();
    expect(exported.data.planEntries).toHaveLength(2);
    expect(exported.data.shoppingItems).toHaveLength(2);

    const parsed = parseBackup(serializeBackup(exported));
    if (!parsed.ok) throw new Error("backup did not parse");
    const target = await createTestServices(clock);
    const result = await target.backup.importReplacingAll(parsed.backup);
    expect(result).toMatchObject({ ok: true, counts: { planEntries: 2, shoppingItems: 2 } });
    expect(await target.plan.listEntries()).toEqual(await services.plan.listEntries());
    expect(await target.plan.listItems()).toEqual(await services.plan.listItems());
    expect((await target.backup.exportAll()).data).toEqual(exported.data);
  });
});

describe("upgrading a database from before the meal plan", () => {
  it("adds empty plan tables and keeps existing data", async () => {
    const SQL = await initSqlJs();
    const old = new SQL.Database();
    old.run(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    for (const migration of MIGRATIONS.filter((m) => m.version <= 4)) {
      old.exec(migration.sql);
      old.run("INSERT INTO schema_migrations VALUES (?, ?, ?)", [
        migration.version,
        migration.description,
        "2026-10-10T00:00:00.000Z",
      ]);
    }
    old.run(
      `INSERT INTO inventory_lots (id, ingredient_definition_id, original_weight_g, remaining_weight_g, storage, created_at, updated_at)
       VALUES ('lot-old', 'onion_raw', 200, 120, 'refrigerated', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z')`,
    );
    const services = await createAppServices(
      createSqlJsDatabase(SQL, { data: old.export() }),
      clock,
    );
    expect(await services.plan.listEntries()).toEqual([]);
    expect(await services.plan.listItems()).toEqual([]);
    expect((await services.inventory.listLots())[0]?.remainingWeightG).toBe(120);
    const added = await services.plan.addRecipe("recipe_gyudon", 2);
    expect(added).toMatchObject({ ok: true, alreadyPlanned: false });
  });
});
