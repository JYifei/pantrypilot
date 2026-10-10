import { describe, expect, it } from "vitest";
import { findBackupReferenceProblems, parseBackup, serializeBackup } from "@/domain/backup/backup";
import { legacyCookTransactions, recentCooks } from "@/domain/cooking/history";
import { DEFAULT_SETTINGS } from "@/domain/settings/settings";
import { createTestServices } from "@/test/testDatabase";
import { BUILTIN_INGREDIENTS } from "./builtinIngredients";
import { BUILTIN_RECIPES } from "./builtinRecipes";
import { buildDemoBackup } from "./demoData";

const TODAY = "2026-10-10";
const builtinIds = new Set(BUILTIN_INGREDIENTS.map((d) => d.id));

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

  it("writes the note in the chosen language", () => {
    const japanese = buildDemoBackup(TODAY, { ...DEFAULT_SETTINGS, language: "ja-JP" });
    const gyudon = japanese.data.cookingSessions.find((s) => s.id === "session-demo-gyudon");
    expect(gyudon?.note).toBe("つゆを少し多めに。");
  });
});
