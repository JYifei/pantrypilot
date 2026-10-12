import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "@/config/app";
import { DEFAULT_SETTINGS } from "../settings/settings";
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  createBackup,
  findBackupReferenceProblems,
  parseBackup,
  serializeBackup,
  type BackupData,
} from "./backup";

const data: BackupData = {
  ingredients: [
    {
      id: "6f1c2a52-0d5e-4d55-9a33-0d7f2f8b6c11",
      name: { zhCN: "自制味噌", enUS: "Homemade miso" },
      aliases: [],
      category: "seasoning",
      nutritionPer100g: null,
      tags: [],
      dataQuality: "user",
      isBuiltin: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  inventoryLots: [
    {
      id: "lot-1",
      ingredientDefinitionId: "beef_misuji_raw",
      cut: "misuji",
      form: "steak",
      originalWeightG: 251,
      remainingWeightG: 151,
      thicknessMm: 35,
      processing: ["raw"],
      storage: "refrigerated",
      opened: false,
      purchasePrice: 940,
      currency: "JPY",
      expirationDate: "2026-10-06",
      createdAt: "2026-10-04T00:00:00.000Z",
      updatedAt: "2026-10-04T01:00:00.000Z",
    },
  ],
  transactions: [
    {
      id: "tx-1",
      inventoryLotId: "lot-1",
      type: "consume",
      quantityG: 100,
      createdAt: "2026-10-04T01:00:00.000Z",
      recipeId: "recipe_beef_steak",
      cookingSessionId: "session-1",
    },
  ],
  cookingSessions: [
    {
      id: "session-1",
      cookedAt: "2026-10-04T01:00:00.000Z",
      localDate: "2026-10-04",
      recipeId: "recipe_beef_steak",
      recipeName: { zhCN: "香煎牛排", enUS: "Beef steak" },
      servings: 1,
      items: [
        {
          ingredientKey: "beef",
          lotId: "lot-1",
          ingredientDefinitionId: "beef_misuji_raw",
          ingredientName: { zhCN: "牛板腱" },
          form: "steak",
          grams: 100,
          weightBasis: "exact",
        },
      ],
      note: "偏咸",
    },
  ],
  recipes: [
    {
      id: "9a7e5d0c-7b1f-4c1e-8f43-2f6d2b1e0a55",
      name: { zhCN: "味噌牛排" },
      servings: 1,
      tags: [],
      ingredients: [
        { key: "beef", ingredientId: "beef_misuji_raw", anySpecies: "beef", grams: 200 },
        { key: "miso", ingredientId: "6f1c2a52-0d5e-4d55-9a33-0d7f2f8b6c11", grams: 20 },
      ],
      seasonings: [],
      steps: [{ zhCN: "煎" }],
      dataQuality: "user",
      isBuiltin: false,
    },
  ],
  planEntries: [
    {
      id: "plan-1",
      recipeId: "recipe_gyudon",
      servings: 3,
      position: 0,
      choices: { rice: "rice_white_raw" },
      createdAt: "2026-10-04T02:00:00.000Z",
      updatedAt: "2026-10-04T02:00:00.000Z",
    },
  ],
  shoppingItems: [
    {
      id: "plan:onion_raw",
      source: "plan",
      ingredientDefinitionId: "onion_raw",
      plannedGrams: 200,
      note: "1 网袋",
      bought: true,
      createdAt: "2026-10-04T02:00:00.000Z",
      updatedAt: "2026-10-04T02:10:00.000Z",
    },
    {
      id: "manual-1",
      source: "manual",
      label: "牛奶",
      bought: false,
      createdAt: "2026-10-04T02:00:00.000Z",
      updatedAt: "2026-10-04T02:00:00.000Z",
    },
  ],
  settings: DEFAULT_SETTINGS,
};

describe("backup format", () => {
  it("round-trips through JSON without loss", () => {
    const backup = createBackup(data, "2026-10-04T12:00:00.000Z");
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup).toEqual(backup);
  });

  it("includes format and schema version metadata", () => {
    const backup = createBackup(data, "2026-10-04T12:00:00.000Z");
    expect(backup.format).toBe(APP_CONFIG.backupFormat);
    expect(backup.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(backup.appVersion).toBe(APP_CONFIG.version);
  });

  it("rejects invalid JSON and foreign files", () => {
    expect(parseBackup("{not json")).toEqual({ ok: false, error: { code: "invalid_json" } });
    expect(parseBackup(JSON.stringify({ hello: "world" }))).toEqual({
      ok: false,
      error: { code: "not_a_backup" },
    });
  });

  it("rejects backups from a newer, unknown format version", () => {
    const future = { ...createBackup(data, "x"), schemaVersion: 999 };
    const result = parseBackup(JSON.stringify(future));
    expect(result).toEqual({ ok: false, error: { code: "unsupported_version", version: 999 } });
  });

  it("reports invalid content with a path", () => {
    const broken = structuredClone(createBackup(data, "x"));
    (broken.data.inventoryLots[0] as { storage: string }).storage = "garage";
    const result = parseBackup(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_content");
      expect(JSON.stringify(result.error)).toContain("storage");
    }
  });

  it("detects dangling references", () => {
    const backup = createBackup(data, "x");
    expect(findBackupReferenceProblems(backup, new Set(["beef_misuji_raw"]))).toEqual([]);
    // The lot and the recipe's beef line both point at the missing built-in.
    expect(findBackupReferenceProblems(backup, new Set())).toHaveLength(2);
  });

  it("detects recipes that reference unknown ingredients", () => {
    const backup = createBackup({ ...data, ingredients: [] }, "x");
    const problems = findBackupReferenceProblems(backup, new Set(["beef_misuji_raw"]));
    expect(problems).toEqual([
      "recipe 9a7e5d0c-7b1f-4c1e-8f43-2f6d2b1e0a55 → unknown ingredient 6f1c2a52-0d5e-4d55-9a33-0d7f2f8b6c11",
    ]);
  });

  it("detects a transaction linked to a session that is not in the backup", () => {
    const backup = createBackup({ ...data, cookingSessions: [] }, "x");
    expect(findBackupReferenceProblems(backup, new Set(["beef_misuji_raw"]))).toEqual([
      "transaction tx-1 → unknown cooking session session-1",
    ]);
  });

  it("keeps sessions whose recipe or lots no longer exist", () => {
    const backup = createBackup(
      {
        ...data,
        transactions: [],
        inventoryLots: [],
        cookingSessions: [{ ...data.cookingSessions[0]!, recipeId: "deleted-recipe" }],
      },
      "x",
    );
    expect(findBackupReferenceProblems(backup, new Set(["beef_misuji_raw"]))).toEqual([]);
  });

  it("keeps plan entries and list items whose recipe or ingredient is unknown", () => {
    const backup = createBackup(
      {
        ...data,
        planEntries: [{ ...data.planEntries[0]!, recipeId: "deleted-recipe" }],
        shoppingItems: [
          { ...data.shoppingItems[0]!, id: "plan:gone", ingredientDefinitionId: "gone" },
        ],
      },
      "x",
    );
    expect(findBackupReferenceProblems(backup, new Set(["beef_misuji_raw"]))).toEqual([]);
  });

  it("detects duplicated plan entries and plan items that do not match their ingredient", () => {
    const backup = createBackup(
      {
        ...data,
        planEntries: [data.planEntries[0]!, data.planEntries[0]!],
        shoppingItems: [{ ...data.shoppingItems[0]!, id: "plan:egg_whole" }],
      },
      "x",
    );
    expect(findBackupReferenceProblems(backup, new Set(["beef_misuji_raw"]))).toEqual([
      "plan entry plan-1 appears twice",
      "shopping item plan:egg_whole does not match its ingredient",
    ]);
  });

  it("rejects a manual item without a label", () => {
    const broken = structuredClone(createBackup(data, "x"));
    delete (broken.data.shoppingItems[1] as { label?: string }).label;
    expect(parseBackup(JSON.stringify(broken)).ok).toBe(false);
  });

  it("upgrades a V0.3 part 1 (schema version 3) backup with an empty plan", () => {
    const { planEntries: _plan, shoppingItems: _items, ...v3Data } = data;
    const v3 = { ...createBackup(data, "x"), schemaVersion: 3, data: v3Data };
    const result = parseBackup(JSON.stringify(v3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(result.backup.data.planEntries).toEqual([]);
    expect(result.backup.data.shoppingItems).toEqual([]);
    expect(result.backup.data.cookingSessions).toEqual(data.cookingSessions);
  });

  /** A backup as V0.2 wrote it: no sessions, no session links, no repeat hint setting. */
  function v2Backup() {
    const { repeatHintDays: _setting, ...v2Settings } = DEFAULT_SETTINGS;
    const {
      cookingSessions: _sessions,
      planEntries: _plan,
      shoppingItems: _items,
      ...v2Data
    } = data;
    return {
      ...createBackup(data, "x"),
      schemaVersion: 2,
      data: {
        ...v2Data,
        transactions: data.transactions.map(({ cookingSessionId: _link, ...tx }) => tx),
        settings: { ...v2Settings, language: "ja-JP" },
      },
    };
  }

  it("upgrades a V0.2 (schema version 2) backup without inventing sessions", () => {
    const result = parseBackup(JSON.stringify(v2Backup()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(result.backup.data.cookingSessions).toEqual([]);
    expect(result.backup.data.transactions[0]).toMatchObject({ recipeId: "recipe_beef_steak" });
    expect(result.backup.data.transactions[0]?.cookingSessionId).toBeUndefined();
    expect(result.backup.data.settings).toEqual({
      ...DEFAULT_SETTINGS,
      language: "ja-JP",
    });
    expect(findBackupReferenceProblems(result.backup, new Set(["beef_misuji_raw"]))).toEqual([]);
  });

  it("upgrades a V0.1 (schema version 1) backup without recipes", () => {
    const v1 = { ...v2Backup(), schemaVersion: 1 } as Record<string, unknown>;
    const { recipes: _dropped, ...v1Data } = v2Backup().data;
    v1.data = v1Data;
    const result = parseBackup(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
      expect(result.backup.data.recipes).toEqual([]);
      expect(result.backup.data.cookingSessions).toEqual([]);
      expect(result.backup.data.inventoryLots).toHaveLength(1);
    }
  });
});
