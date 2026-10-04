import { describe, expect, it } from "vitest";
import { calculateInventoryNutrition, edibleGrams } from "../nutrition/inventoryNutrition";
import type { IngredientDefinition } from "../ingredients/types";
import {
  adjustRemaining,
  consumeFromLot,
  discardRemaining,
  freezeLot,
  getRemainingGrams,
  isLotDepleted,
  suggestExpirationDate,
} from "./lotOperations";
import type { InventoryLot } from "./types";

const NOW = "2026-10-04T10:00:00.000Z";
const ctx = { transactionId: "tx-1", now: NOW };

function lot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    id: "lot-1",
    ingredientDefinitionId: "chicken_thigh_skin_on_raw",
    processing: [],
    storage: "refrigerated",
    opened: false,
    originalWeightG: 420,
    remainingWeightG: 372,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const chickenThigh: IngredientDefinition = {
  id: "chicken_thigh_skin_on_raw",
  name: { zhCN: "鸡腿肉" },
  aliases: [],
  category: "meat",
  nutritionPer100g: { kcal: 190, proteinG: 16.6, fatG: 14.2, carbohydrateG: 0 },
  tags: [],
  dataQuality: "demo",
  isBuiltin: true,
  defaultShelfLife: { refrigeratedDays: 3, frozenDays: 30 },
};

describe("consumeFromLot", () => {
  it("subtracts consumed grams (372 g − 180 g = 192 g)", () => {
    const result = consumeFromLot(lot(), { grams: 180 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lot.remainingWeightG).toBe(192);
    expect(result.lot.originalWeightG).toBe(420);
    expect(result.lot.updatedAt).toBe(NOW);
    expect(result.transaction).toMatchObject({
      id: "tx-1",
      inventoryLotId: "lot-1",
      type: "consume",
      quantityG: 180,
    });
  });

  it("matches the misuji acceptance case (251 g − 100 g = 151 g)", () => {
    const result = consumeFromLot(
      lot({ originalWeightG: 251, remainingWeightG: 251 }),
      { grams: 100 },
      ctx,
    );
    expect(result.ok && result.lot.remainingWeightG).toBe(151);
  });

  it("does not mutate the input lot", () => {
    const original = lot();
    consumeFromLot(original, { grams: 100 }, ctx);
    expect(original.remainingWeightG).toBe(372);
  });

  it("never lets inventory become negative", () => {
    const result = consumeFromLot(lot(), { grams: 400 }, ctx);
    expect(result).toEqual({ ok: false, error: "exceeds_remaining" });
  });

  it("allows consuming exactly what is left", () => {
    const result = consumeFromLot(lot(), { grams: 372 }, ctx);
    expect(result.ok && result.lot.remainingWeightG).toBe(0);
    expect(result.ok && isLotDepleted(result.lot)).toBe(true);
  });

  it("avoids floating-point residue", () => {
    let current = lot({ remainingWeightG: 0.3 });
    for (const grams of [0.1, 0.2]) {
      const result = consumeFromLot(current, { grams }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) current = result.lot;
    }
    expect(current.remainingWeightG).toBe(0);
  });

  it("rejects zero, negative and missing quantities", () => {
    expect(consumeFromLot(lot(), { grams: 0 }, ctx)).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
    expect(consumeFromLot(lot(), { grams: -5 }, ctx)).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
    expect(consumeFromLot(lot(), {}, ctx)).toEqual({ ok: false, error: "invalid_quantity" });
  });

  it("consumes by count for count-tracked lots", () => {
    const eggs = lot({
      remainingWeightG: undefined,
      originalWeightG: undefined,
      count: 10,
      unit: "piece",
    });
    const result = consumeFromLot(eggs, { count: 2 }, ctx);
    expect(result.ok && result.lot.count).toBe(8);
    expect(consumeFromLot(eggs, { grams: 50 }, ctx)).toEqual({
      ok: false,
      error: "weight_not_tracked",
    });
    expect(consumeFromLot(eggs, { count: 11 }, ctx)).toEqual({
      ok: false,
      error: "exceeds_remaining",
    });
  });
});

describe("adjustRemaining / discardRemaining", () => {
  it("records the signed difference when adjusting", () => {
    const result = adjustRemaining(lot(), { remainingWeightG: 350 }, ctx);
    expect(result.ok && result.lot.remainingWeightG).toBe(350);
    expect(result.ok && result.transaction).toMatchObject({ type: "adjust", quantityG: -22 });
  });

  it("rejects negative adjustments", () => {
    expect(adjustRemaining(lot(), { remainingWeightG: -1 }, ctx)).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
  });

  it("discards everything that is left", () => {
    const result = discardRemaining(lot(), ctx);
    expect(result.ok && result.lot.remainingWeightG).toBe(0);
    expect(result.ok && result.transaction).toMatchObject({ type: "discard", quantityG: 372 });
  });
});

describe("freezeLot / suggestExpirationDate", () => {
  it("moves to the freezer and extends the expiration date", () => {
    const frozen = freezeLot(
      lot({ expirationDate: "2026-10-05" }),
      chickenThigh,
      "2026-10-04",
      NOW,
    );
    expect(frozen.storage).toBe("frozen");
    expect(frozen.expirationDate).toBe("2026-11-03");
  });

  it("keeps the label date when no frozen shelf life is known", () => {
    const frozen = freezeLot(lot({ expirationDate: "2026-10-05" }), undefined, "2026-10-04", NOW);
    expect(frozen.expirationDate).toBe("2026-10-05");
  });

  it("suggests an expiration date from shelf life", () => {
    expect(suggestExpirationDate(chickenThigh, "refrigerated", "2026-10-04")).toBe("2026-10-07");
    expect(suggestExpirationDate(chickenThigh, "pantry", "2026-10-04")).toBeUndefined();
  });
});

describe("remaining grams and lot nutrition", () => {
  it("estimates grams from count when weight is not tracked", () => {
    const definition = {
      defaultUnitConversions: { bag: { estimatedGrams: 180, confidence: "low" as const } },
    };
    const bagLot = lot({ remainingWeightG: undefined, count: 1, unit: "bag" });
    expect(getRemainingGrams(bagLot, definition)).toEqual({
      grams: 180,
      isEstimate: true,
      confidence: "low",
    });
    expect(getRemainingGrams(bagLot, {})).toBeNull();
  });

  it("calculates nutrition of what is left in a lot", () => {
    const result = calculateInventoryNutrition(lot({ remainingWeightG: 200 }), chickenThigh);
    expect(result.grams).toBe(200);
    expect(result.values.kcal).toBe(380);
    expect(result.weightIsEstimated).toBe(false);
  });

  it("applies the edible ratio only to bone-in or whole items", () => {
    const definition = { defaultEdibleRatio: 0.6 };
    expect(edibleGrams(100, { boneIn: true }, definition)).toBe(60);
    expect(edibleGrams(100, { form: "whole" }, definition)).toBe(60);
    expect(edibleGrams(100, { form: "fillet" }, definition)).toBe(100);
  });
});
