import type { IsoDateTime } from "../common/dates";
import type { LocalizedText } from "../common/localizedText";
import type { NutritionFacts } from "../nutrition/types";
import type { AnimalSpecies, FoodCategory, InventoryUnit, MeatCut } from "./taxonomy";

/** How much to trust a grams-per-unit estimate such as "1 bag ≈ 180 g". */
export type EstimateConfidence = "low" | "medium" | "high";

export interface UnitConversionEstimate {
  /** Estimated grams for ONE unit (e.g. one bag, one piece, one ml). */
  estimatedGrams: number;
  confidence: EstimateConfidence;
}

/**
 * Where the nutrition numbers came from.
 * - `demo`: approximate placeholder values for development; not authoritative.
 * - `reference`: imported from a cited public dataset.
 * - `user`: entered by the user.
 */
export type NutritionDataQuality = "demo" | "reference" | "user";

/**
 * A nutritionally meaningful food definition, e.g. `pork_belly_raw`.
 *
 * Cuts with meaningfully different nutrition are separate definitions.
 * Supermarket form (steak, thin slice…) and package details are NOT part of a
 * definition — they belong to InventoryLot.
 *
 * Built-in definitions use stable snake_case IDs; user-created ones use UUIDs.
 */
export interface IngredientDefinition {
  id: string;
  name: LocalizedText;
  /** Extra search terms in any language (e.g. 五花肉, 豚バラ, sanmai-niku). */
  aliases: string[];
  category: FoodCategory;
  animalSpecies?: AnimalSpecies;
  anatomicalCut?: MeatCut;
  /**
   * Fraction of the purchased weight that is edible (0–1) for bone-in / whole
   * items. Applied only when a lot is bone-in or sold whole.
   */
  defaultEdibleRatio?: number;
  /** Per 100 g edible portion. `null` when no nutrition data is available. */
  nutritionPer100g: NutritionFacts | null;
  tags: string[];
  defaultShelfLife?: {
    refrigeratedDays?: number;
    frozenDays?: number;
  };
  /** Optional, overridable estimates. Never assume these are universally true. */
  defaultUnitConversions?: Partial<Record<InventoryUnit, UnitConversionEstimate>>;
  sourceId?: string;
  dataQuality: NutritionDataQuality;
  isBuiltin: boolean;
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}
