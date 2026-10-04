import { z } from "zod";
import { isValidIsoDate } from "./common/dates";
import {
  ANIMAL_SPECIES,
  FOOD_CATEGORIES,
  INVENTORY_UNITS,
  MEAT_CUTS,
  PROCESSING_TYPES,
  PRODUCT_FORMS,
  STORAGE_TYPES,
} from "./ingredients/taxonomy";
import { TRANSACTION_TYPES } from "./inventory/types";

/**
 * Runtime validation for domain records crossing a trust boundary
 * (backup import, future dataset import, future LLM output).
 * Types are declared in the domain modules; these schemas must stay in sync.
 */

const nonNegative = z.number().finite().nonnegative();
const isoDate = z.string().refine(isValidIsoDate, { message: "Invalid date (YYYY-MM-DD)" });
const isoDateTime = z.string().min(1);

export const localizedTextSchema = z.object({
  zhCN: z.string(),
  enUS: z.string().optional(),
  jaJP: z.string().optional(),
});

export const nutritionFactsSchema = z.object({
  kcal: nonNegative,
  proteinG: nonNegative,
  fatG: nonNegative,
  saturatedFatG: nonNegative.optional(),
  carbohydrateG: nonNegative,
  sugarG: nonNegative.optional(),
  fiberG: nonNegative.optional(),
  sodiumMg: nonNegative.optional(),
  potassiumMg: nonNegative.optional(),
  calciumMg: nonNegative.optional(),
  ironMg: nonNegative.optional(),
  magnesiumMg: nonNegative.optional(),
  vitaminAMcg: nonNegative.optional(),
  vitaminCMg: nonNegative.optional(),
  vitaminDMcg: nonNegative.optional(),
  vitaminB12Mcg: nonNegative.optional(),
  folateMcg: nonNegative.optional(),
});

const unitConversionSchema = z.object({
  estimatedGrams: z.number().finite().positive(),
  confidence: z.enum(["low", "medium", "high"]),
});

export const ingredientDefinitionSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  aliases: z.array(z.string()),
  category: z.enum(FOOD_CATEGORIES),
  animalSpecies: z.enum(ANIMAL_SPECIES).optional(),
  anatomicalCut: z.enum(MEAT_CUTS).optional(),
  defaultEdibleRatio: z.number().gt(0).lte(1).optional(),
  nutritionPer100g: nutritionFactsSchema.nullable(),
  tags: z.array(z.string()),
  defaultShelfLife: z
    .object({
      refrigeratedDays: z.number().int().nonnegative().optional(),
      frozenDays: z.number().int().nonnegative().optional(),
    })
    .optional(),
  defaultUnitConversions: z.partialRecord(z.enum(INVENTORY_UNITS), unitConversionSchema).optional(),
  sourceId: z.string().optional(),
  dataQuality: z.enum(["demo", "reference", "user"]),
  isBuiltin: z.boolean(),
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});

export const inventoryLotSchema = z.object({
  id: z.string().min(1),
  ingredientDefinitionId: z.string().min(1),
  cut: z.enum(MEAT_CUTS).optional(),
  form: z.enum(PRODUCT_FORMS).optional(),
  originalWeightG: nonNegative.optional(),
  remainingWeightG: nonNegative.optional(),
  count: nonNegative.optional(),
  unit: z.enum(INVENTORY_UNITS).optional(),
  thicknessMm: nonNegative.optional(),
  fatPercent: z.number().min(0).max(100).optional(),
  boneIn: z.boolean().optional(),
  skinOn: z.boolean().optional(),
  processing: z.array(z.enum(PROCESSING_TYPES)),
  purchaseDate: isoDate.optional(),
  expirationDate: isoDate.optional(),
  storage: z.enum(STORAGE_TYPES),
  opened: z.boolean(),
  purchasePrice: nonNegative.optional(),
  currency: z.string().length(3).optional(),
  brand: z.string().optional(),
  labelText: z.string().optional(),
  notes: z.string().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const inventoryTransactionSchema = z.object({
  id: z.string().min(1),
  inventoryLotId: z.string().min(1),
  type: z.enum(TRANSACTION_TYPES),
  quantityG: z.number().finite().optional(),
  quantityCount: z.number().finite().optional(),
  createdAt: isoDateTime,
  notes: z.string().optional(),
  recipeId: z.string().min(1).optional(),
});

export const recipeSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  servings: z.number().int().positive(),
  timeMinutes: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()),
  ingredients: z
    .array(
      z.object({
        key: z.string().min(1),
        ingredientId: z.string().min(1),
        alternatives: z
          .array(
            z.object({
              ingredientId: z.string().min(1),
              ratio: z.number().finite().positive().optional(),
            }),
          )
          .optional(),
        anySpecies: z.enum(ANIMAL_SPECIES).optional(),
        form: z.enum(PRODUCT_FORMS).optional(),
        grams: z.number().finite().positive(),
        count: z.number().finite().positive().optional(),
        optional: z.boolean().optional(),
      }),
    )
    .min(1),
  seasonings: z.array(localizedTextSchema),
  steps: z.array(localizedTextSchema),
  dataQuality: z.enum(["demo", "user"]),
  isBuiltin: z.boolean(),
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});
