import { describe, expect, it } from "vitest";
import { parseBackup, serializeBackup } from "@/domain/backup/backup";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { createTestServices, fixedClock } from "@/test/testDatabase";
import type { LotInput } from "./inventoryService";

const clock = fixedClock("2026-10-04T09:00:00.000Z");

const misujiSteak: LotInput = {
  ingredientDefinitionId: "beef_misuji_raw",
  cut: "misuji",
  form: "steak",
  originalWeightG: 251,
  thicknessMm: 35,
  processing: [],
  storage: "refrigerated",
  opened: false,
  purchasePrice: 940,
  currency: "JPY",
  purchaseDate: "2026-10-04",
  expirationDate: "2026-10-07",
};

describe("SQLite persistence (sql.js)", () => {
  it("applies migrations and seeds built-in ingredients", async () => {
    const services = await createTestServices(clock);
    const all = await services.ingredients.listAll();
    expect(all.filter((d) => d.isBuiltin)).toHaveLength(BUILTIN_INGREDIENTS.length);
    const misuji = all.find((d) => d.id === "beef_misuji_raw");
    expect(misuji?.name.jaJP).toBe("牛ミスジ");
    expect(misuji?.nutritionPer100g?.kcal).toBeGreaterThan(0);
    expect((await services.ingredients.listSources()).length).toBeGreaterThan(0);
  });

  it("stores a misuji steak lot, consumes 100 g and leaves 151 g", async () => {
    const services = await createTestServices(clock);
    const lot = await services.inventory.addLot(misujiSteak);
    expect(lot.remainingWeightG).toBe(251);

    const result = await services.inventory.consume(lot.id, { grams: 100 });
    expect(result.ok).toBe(true);

    const [stored] = await services.inventory.listLots();
    expect(stored).toMatchObject({
      ingredientDefinitionId: "beef_misuji_raw",
      cut: "misuji",
      form: "steak",
      originalWeightG: 251,
      remainingWeightG: 151,
      thicknessMm: 35,
      purchasePrice: 940,
    });

    const transactions = await services.inventory.listTransactions(lot.id);
    expect(transactions.map((t) => t.type)).toEqual(["add", "consume"]);
  });

  it("refuses to consume more than remains and leaves data unchanged", async () => {
    const services = await createTestServices(clock);
    const lot = await services.inventory.addLot(misujiSteak);
    const result = await services.inventory.consume(lot.id, { grams: 300 });
    expect(result).toEqual({ ok: false, error: "exceeds_remaining" });
    expect((await services.inventory.listLots())[0]?.remainingWeightG).toBe(251);
    expect(await services.inventory.listTransactions(lot.id)).toHaveLength(1);
  });

  it("survives a restart (reopening the same database file)", async () => {
    let fileBytes: Uint8Array | undefined;
    const first = await createTestServices(clock, { onPersist: (b) => (fileBytes = b) });
    await first.inventory.addLot(misujiSteak);
    await first.repositories.settings.save({
      language: "ja-JP",
      theme: "dark",
      currency: "JPY",
      region: "JP",
    });

    const second = await createTestServices(clock, { data: fileBytes });
    const lots = await second.inventory.listLots();
    expect(lots).toHaveLength(1);
    expect(lots[0]?.thicknessMm).toBe(35);
    expect((await second.repositories.settings.load()).language).toBe("ja-JP");
  });

  it("freezes a lot and extends its expiration date", async () => {
    const services = await createTestServices(clock);
    const lot = await services.inventory.addLot(misujiSteak);
    const frozen = await services.inventory.freeze(lot.id);
    expect(frozen.storage).toBe("frozen");
    expect(frozen.expirationDate).toBe("2026-11-03");
  });

  it("blocks deleting a custom ingredient that is in use", async () => {
    const services = await createTestServices(clock);
    const custom = await services.ingredients.createCustom({
      name: { zhCN: "自制腊肉" },
      aliases: [],
      category: "meat",
      nutritionPer100g: null,
      tags: [],
    });
    await services.inventory.addLot({ ...misujiSteak, ingredientDefinitionId: custom.id });
    expect(await services.ingredients.deleteCustom(custom.id)).toEqual({
      ok: false,
      error: "in_use",
      lotCount: 1,
    });
    expect(await services.ingredients.deleteCustom("beef_misuji_raw")).toEqual({
      ok: false,
      error: "builtin",
    });
  });
});

describe("JSON export / import round trip", () => {
  it("restores all user data into a fresh database", async () => {
    const source = await createTestServices(clock);
    const custom = await source.ingredients.createCustom({
      name: { zhCN: "自制腊肉", enUS: "Homemade cured pork" },
      aliases: ["larou"],
      category: "meat",
      animalSpecies: "pork",
      nutritionPer100g: { kcal: 400, proteinG: 20, fatG: 35, carbohydrateG: 1 },
      tags: [],
      defaultShelfLife: { refrigeratedDays: 30 },
    });
    const lot = await source.inventory.addLot(misujiSteak);
    await source.inventory.consume(lot.id, { grams: 100 });
    await source.inventory.addLot({
      ingredientDefinitionId: custom.id,
      count: 2,
      unit: "piece",
      processing: ["smoked", "salted"],
      storage: "pantry",
      opened: true,
      boneIn: false,
    });

    const exported = await source.backup.exportAll();
    const text = serializeBackup(exported);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = await createTestServices(clock);
    await target.inventory.addLot({ ...misujiSteak, notes: "will be replaced" });
    const result = await target.backup.importReplacingAll(parsed.backup);
    expect(result).toEqual({
      ok: true,
      counts: { ingredients: 1, inventoryLots: 2, transactions: 3, recipes: 0 },
    });

    const reExported = await target.backup.exportAll();
    expect(reExported.data).toEqual(exported.data);
  });

  it("refuses an import that references unknown ingredients without deleting anything", async () => {
    const source = await createTestServices(clock);
    await source.inventory.addLot(misujiSteak);
    const backup = await source.backup.exportAll();
    backup.data.inventoryLots[0]!.ingredientDefinitionId = "does_not_exist";

    const target = await createTestServices(clock);
    await target.inventory.addLot(misujiSteak);
    const result = await target.backup.importReplacingAll(backup);
    expect(result.ok).toBe(false);
    expect(await target.inventory.listLots()).toHaveLength(1);
  });
});
