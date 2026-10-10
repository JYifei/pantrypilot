import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { parseBackup, serializeBackup } from "@/domain/backup/backup";
import { legacyCookTransactions } from "@/domain/cooking/history";
import { MIGRATIONS } from "@/db/migrations";
import { createSqlJsDatabase } from "@/db/sqljsDatabase";
import { createAppServices } from "@/services/appServices";
import { createTestServices, fixedClock } from "@/test/testDatabase";
import type { LotInput } from "./inventoryService";
import type { RecipeInput } from "./recipeService";

const clock = fixedClock("2026-10-10T09:00:00.000Z");

const misuji: LotInput = {
  ingredientDefinitionId: "beef_misuji_raw",
  cut: "misuji",
  form: "steak",
  originalWeightG: 251,
  processing: [],
  storage: "refrigerated",
  opened: false,
};

const eggs: LotInput = {
  ingredientDefinitionId: "egg_whole",
  count: 6,
  unit: "piece",
  processing: [],
  storage: "refrigerated",
  opened: false,
};

const recipe: RecipeInput = {
  name: { zhCN: "牛排配蛋", enUS: "Steak and eggs" },
  servings: 1,
  tags: [],
  ingredients: [
    { key: "beef", ingredientId: "beef_sirloin_raw", anySpecies: "beef", grams: 150 },
    { key: "egg", ingredientId: "egg_whole", grams: 100, count: 2 },
  ],
  seasonings: [],
  steps: [{ zhCN: "煎" }],
};

async function cookSteakAndEggs() {
  const services = await createTestServices(clock);
  const beef = await services.inventory.addLot(misuji);
  const egg = await services.inventory.addLot(eggs);
  const created = await services.recipes.createCustom(recipe);
  const result = await services.recipes.cook(
    created.id,
    [
      { ingredientKey: "beef", lotId: beef.id, grams: 150 },
      { ingredientKey: "egg", lotId: egg.id, count: 2 },
    ],
    "op-1",
    { servings: 2, note: "  少放盐  " },
  );
  return { services, beef, egg, created, result };
}

describe("cooking sessions", () => {
  it("records a snapshot of what was cooked together with the deductions", async () => {
    const { services, beef, egg, created, result } = await cookSteakAndEggs();
    expect(result).toMatchObject({ ok: true, transactionCount: 2 });
    const [session] = await services.recipes.listSessions();
    expect(session).toEqual({
      id: result.ok ? result.sessionId : "",
      cookedAt: "2026-10-10T09:00:00.000Z",
      localDate: expect.stringMatching(/^2026-10-1[01]$/),
      recipeId: created.id,
      recipeName: { zhCN: "牛排配蛋", enUS: "Steak and eggs" },
      servings: 2,
      note: "少放盐",
      items: [
        {
          ingredientKey: "beef",
          lotId: beef.id,
          ingredientDefinitionId: "beef_misuji_raw",
          ingredientName: expect.objectContaining({ zhCN: "牛板腱" }),
          form: "steak",
          grams: 150,
          weightBasis: "exact",
        },
        {
          ingredientKey: "egg",
          lotId: egg.id,
          ingredientDefinitionId: "egg_whole",
          ingredientName: expect.objectContaining({ zhCN: "鸡蛋" }),
          count: 2,
          unit: "piece",
          estimatedGrams: 100,
          weightBasis: "estimated",
        },
      ],
    });
    const consumed = (await services.inventory.listTransactions()).filter(
      (t) => t.type === "consume",
    );
    expect(consumed).toHaveLength(2);
    expect(consumed.every((t) => t.cookingSessionId === session!.id)).toBe(true);
    expect(consumed.every((t) => t.recipeId === created.id)).toBe(true);
    expect(legacyCookTransactions(consumed)).toEqual([]);
  });

  it("keeps the history readable after the recipe is edited and then deleted", async () => {
    const { services, created } = await cookSteakAndEggs();
    await services.recipes.updateCustom(created.id, {
      ...recipe,
      name: { zhCN: "改过的名字" },
      ingredients: [{ key: "beef", ingredientId: "beef_sirloin_raw", grams: 300 }],
    });
    await services.recipes.deleteCustom(created.id);

    const [session] = await services.recipes.listSessions();
    expect(session?.recipeName.zhCN).toBe("牛排配蛋");
    expect(session?.recipeId).toBe(created.id);
    expect(session?.items.map((i) => i.grams ?? i.count)).toEqual([150, 2]);
    expect((await services.recipes.listAll()).some((r) => r.id === created.id)).toBe(false);
  });

  it("keeps the history readable after the lots and a custom ingredient are deleted", async () => {
    const services = await createTestServices(clock);
    const custom = await services.ingredients.createCustom({
      name: { zhCN: "自制腊肉" },
      aliases: [],
      category: "meat",
      nutritionPer100g: null,
      tags: [],
    });
    const lot = await services.inventory.addLot({
      ...misuji,
      ingredientDefinitionId: custom.id,
      cut: undefined,
    });
    await services.recipes.cook("recipe_beef_steak", [
      { ingredientKey: "beef", lotId: lot.id, grams: 80 },
    ]);
    await services.inventory.deleteLot(lot.id);
    expect(await services.ingredients.deleteCustom(custom.id)).toEqual({ ok: true });

    const [session] = await services.recipes.listSessions();
    expect(session?.items[0]).toMatchObject({
      lotId: lot.id,
      ingredientName: { zhCN: "自制腊肉" },
      grams: 80,
    });
  });

  it("does not record a session when nothing could be deducted", async () => {
    const services = await createTestServices(clock);
    const lot = await services.inventory.addLot(misuji);
    expect(
      await services.recipes.cook("recipe_beef_steak", [
        { ingredientKey: "beef", lotId: lot.id, grams: 999 },
      ]),
    ).toEqual({ ok: false, error: "exceeds_remaining", lotId: lot.id });
    expect(
      await services.recipes.cook(
        "recipe_beef_steak",
        [{ ingredientKey: "beef", lotId: lot.id, grams: 10 }],
        undefined,
        { servings: 0 },
      ),
    ).toEqual({ ok: false, error: "invalid_servings" });
    expect(await services.recipes.listSessions()).toEqual([]);
  });

  it("treats a different servings count or note as a different request", async () => {
    const { services, beef, egg, created } = await cookSteakAndEggs();
    const again = await services.recipes.cook(
      created.id,
      [
        { ingredientKey: "beef", lotId: beef.id, grams: 150 },
        { ingredientKey: "egg", lotId: egg.id, count: 2 },
      ],
      "op-1",
      { servings: 3, note: "少放盐" },
    );
    expect(again).toEqual({ ok: false, error: "operation_conflict" });
    expect(await services.recipes.listSessions()).toHaveLength(1);
  });

  it("carries sessions and their links through a backup round trip", async () => {
    const { services } = await cookSteakAndEggs();
    const exported = await services.backup.exportAll();
    expect(exported.data.cookingSessions).toHaveLength(1);
    const parsed = parseBackup(serializeBackup(exported));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = await createTestServices(clock);
    const result = await target.backup.importReplacingAll(parsed.backup);
    expect(result).toMatchObject({ ok: true, counts: { cookingSessions: 1, transactions: 4 } });
    const reExported = await target.backup.exportAll();
    expect(reExported.data).toEqual(exported.data);
  });
});

describe("upgrading a database from before cooking sessions", () => {
  it("adds the session table and leaves older cooking transactions unlinked", async () => {
    const SQL = await initSqlJs();
    const old = new SQL.Database();
    old.run(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    for (const migration of MIGRATIONS.filter((m) => m.version <= 3)) {
      old.exec(migration.sql);
      old.run("INSERT INTO schema_migrations VALUES (?, ?, ?)", [
        migration.version,
        migration.description,
        "2026-10-04T00:00:00.000Z",
      ]);
    }
    old.run(
      `INSERT INTO inventory_lots (id, ingredient_definition_id, original_weight_g, remaining_weight_g, storage, created_at, updated_at)
       VALUES ('lot-old', 'onion_raw', 200, 120, 'refrigerated', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z')`,
    );
    old.run(
      `INSERT INTO inventory_transactions (id, inventory_lot_id, type, quantity_g, created_at, recipe_id) VALUES
       ('tx-add', 'lot-old', 'add', 200, '2026-10-01T00:00:00.000Z', NULL),
       ('tx-a', 'lot-old', 'consume', 50, '2026-10-02T10:00:00.000Z', 'recipe_gyudon'),
       ('tx-b', 'lot-old', 'consume', 30, '2026-10-02T10:00:00.000Z', 'recipe_gyudon')`,
    );
    const bytes = old.export();

    const services = await createAppServices(createSqlJsDatabase(SQL, { data: bytes }), clock);
    expect(await services.recipes.listSessions()).toEqual([]);
    const legacy = legacyCookTransactions(await services.inventory.listTransactions());
    // Two deductions at the same time stay two records; they are not merged into one meal.
    expect(legacy.map((t) => t.id).sort()).toEqual(["tx-a", "tx-b"]);
    expect(legacy.every((t) => t.cookingSessionId === undefined)).toBe(true);
    expect((await services.inventory.listLots())[0]?.remainingWeightG).toBe(120);
  });
});
