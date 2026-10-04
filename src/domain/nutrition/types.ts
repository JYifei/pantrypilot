/**
 * Raw nutrient quantities per 100 g of the edible portion of a food.
 *
 * Core macronutrients are required whenever a nutrition record exists.
 * Optional fields are `undefined` when the source does not report them —
 * which means "unknown", never "zero". A known zero is stored as `0`.
 */
export interface NutritionFacts {
  kcal: number;
  proteinG: number;
  fatG: number;
  saturatedFatG?: number;
  carbohydrateG: number;
  sugarG?: number;
  fiberG?: number;

  sodiumMg?: number;
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  magnesiumMg?: number;

  vitaminAMcg?: number;
  vitaminCMg?: number;
  vitaminDMcg?: number;
  vitaminB12Mcg?: number;
  folateMcg?: number;
}

export type NutrientKey = keyof NutritionFacts;

export type NutrientUnit = "kcal" | "g" | "mg" | "mcg";
export type NutrientGroup = "energy" | "macro" | "mineral" | "vitamin";

export interface NutrientInfo {
  key: NutrientKey;
  unit: NutrientUnit;
  group: NutrientGroup;
  /** Decimal places used when displaying amounts. */
  decimals: number;
  required: boolean;
}

/** Display / iteration order for all nutrients. Labels live in locales under `nutrient.<key>`. */
export const NUTRIENTS: readonly NutrientInfo[] = [
  { key: "kcal", unit: "kcal", group: "energy", decimals: 0, required: true },
  { key: "proteinG", unit: "g", group: "macro", decimals: 1, required: true },
  { key: "fatG", unit: "g", group: "macro", decimals: 1, required: true },
  { key: "saturatedFatG", unit: "g", group: "macro", decimals: 1, required: false },
  { key: "carbohydrateG", unit: "g", group: "macro", decimals: 1, required: true },
  { key: "sugarG", unit: "g", group: "macro", decimals: 1, required: false },
  { key: "fiberG", unit: "g", group: "macro", decimals: 1, required: false },
  { key: "sodiumMg", unit: "mg", group: "mineral", decimals: 0, required: false },
  { key: "potassiumMg", unit: "mg", group: "mineral", decimals: 0, required: false },
  { key: "calciumMg", unit: "mg", group: "mineral", decimals: 0, required: false },
  { key: "ironMg", unit: "mg", group: "mineral", decimals: 1, required: false },
  { key: "magnesiumMg", unit: "mg", group: "mineral", decimals: 0, required: false },
  { key: "vitaminAMcg", unit: "mcg", group: "vitamin", decimals: 0, required: false },
  { key: "vitaminCMg", unit: "mg", group: "vitamin", decimals: 0, required: false },
  { key: "vitaminDMcg", unit: "mcg", group: "vitamin", decimals: 1, required: false },
  { key: "vitaminB12Mcg", unit: "mcg", group: "vitamin", decimals: 1, required: false },
  { key: "folateMcg", unit: "mcg", group: "vitamin", decimals: 0, required: false },
];

export const NUTRIENT_KEYS: readonly NutrientKey[] = NUTRIENTS.map((n) => n.key);

export function getNutrientInfo(key: NutrientKey): NutrientInfo {
  const info = NUTRIENTS.find((n) => n.key === key);
  if (!info) throw new Error(`Unknown nutrient: ${key}`);
  return info;
}

/**
 * Provenance of a nutrition record. Multiple regional datasets (e.g. the
 * Japanese Standard Tables of Food Composition, USDA FoodData Central) can
 * coexist; each IngredientDefinition points at one source.
 */
export interface NutritionSource {
  id: string;
  name: string;
  dataset?: string;
  reference?: string;
  region?: string;
  retrievedAt?: string;
  notes?: string;
}
