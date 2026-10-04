import { z } from "zod";
import {
  ANIMAL_SPECIES,
  FOOD_CATEGORIES,
  MEAT_CUTS,
  type AnimalSpecies,
  type MeatCut,
} from "@/domain/ingredients/taxonomy";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import {
  NUTRIENT_KEYS,
  NUTRIENTS,
  type NutrientKey,
  type NutritionFacts,
} from "@/domain/nutrition/types";
import type { CustomIngredientInput } from "@/services/ingredientService";

/** Form model for user-created ingredients. Blank nutrition fields mean "unknown". */

const isBlank = (v: string) => v.trim() === "";
const isNonNegative = (v: string) => Number.isFinite(Number(v)) && Number(v) >= 0;

const optionalNonNegative = z
  .string()
  .refine((v) => isBlank(v) || isNonNegative(v), { message: "validation.nonNegativeNumber" });

const optionalDays = z
  .string()
  .refine((v) => isBlank(v) || (isNonNegative(v) && Number.isInteger(Number(v))), {
    message: "validation.nonNegativeNumber",
  });

const nutritionShape = Object.fromEntries(
  NUTRIENT_KEYS.map((key) => [key, optionalNonNegative]),
) as Record<NutrientKey, typeof optionalNonNegative>;

const REQUIRED_NUTRIENTS = NUTRIENTS.filter((n) => n.required).map((n) => n.key);

export const customIngredientSchema = z
  .object({
    nameZh: z.string().refine((v) => !isBlank(v), { message: "validation.nameRequired" }),
    nameEn: z.string(),
    nameJa: z.string(),
    aliases: z.string(),
    category: z.enum(FOOD_CATEGORIES),
    species: z.union([z.enum(ANIMAL_SPECIES), z.literal("")]),
    cut: z.union([z.enum(MEAT_CUTS), z.literal("")]),
    refrigeratedDays: optionalDays,
    frozenDays: optionalDays,
    nutrition: z.object(nutritionShape),
  })
  .superRefine((values, ctx) => {
    const anyFilled = NUTRIENT_KEYS.some((key) => !isBlank(values.nutrition[key]));
    if (!anyFilled) return;
    for (const key of REQUIRED_NUTRIENTS) {
      if (isBlank(values.nutrition[key])) {
        ctx.addIssue({
          code: "custom",
          path: ["nutrition", key],
          message: "validation.nutritionIncomplete",
        });
      }
    }
  });

export type CustomIngredientFormValues = z.infer<typeof customIngredientSchema>;

function emptyNutrition(): Record<NutrientKey, string> {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, ""])) as Record<NutrientKey, string>;
}

export function emptyCustomIngredientForm(): CustomIngredientFormValues {
  return {
    nameZh: "",
    nameEn: "",
    nameJa: "",
    aliases: "",
    category: "other",
    species: "",
    cut: "",
    refrigeratedDays: "",
    frozenDays: "",
    nutrition: emptyNutrition(),
  };
}

export function definitionToCustomForm(d: IngredientDefinition): CustomIngredientFormValues {
  const nutrition = emptyNutrition();
  for (const key of NUTRIENT_KEYS) {
    const value = d.nutritionPer100g?.[key];
    if (value !== undefined) nutrition[key] = String(value);
  }
  return {
    nameZh: d.name.zhCN,
    nameEn: d.name.enUS ?? "",
    nameJa: d.name.jaJP ?? "",
    aliases: d.aliases.join(", "),
    category: d.category,
    species: d.animalSpecies ?? "",
    cut: d.anatomicalCut ?? "",
    refrigeratedDays: d.defaultShelfLife?.refrigeratedDays?.toString() ?? "",
    frozenDays: d.defaultShelfLife?.frozenDays?.toString() ?? "",
    nutrition,
  };
}

const optionalText = (v: string) => (isBlank(v) ? undefined : v.trim());
const optionalNumber = (v: string) => (isBlank(v) ? undefined : Number(v));

export function customFormToInput(values: CustomIngredientFormValues): CustomIngredientInput {
  const anyNutrition = NUTRIENT_KEYS.some((key) => !isBlank(values.nutrition[key]));
  let nutritionPer100g: NutritionFacts | null = null;
  if (anyNutrition) {
    const facts: Partial<Record<NutrientKey, number>> = {};
    for (const key of NUTRIENT_KEYS) {
      const value = optionalNumber(values.nutrition[key]);
      if (value !== undefined) facts[key] = value;
    }
    nutritionPer100g = facts as NutritionFacts;
  }
  const refrigeratedDays = optionalNumber(values.refrigeratedDays);
  const frozenDays = optionalNumber(values.frozenDays);
  const isMeat = values.category === "meat";
  return {
    name: {
      zhCN: values.nameZh.trim(),
      enUS: optionalText(values.nameEn),
      jaJP: optionalText(values.nameJa),
    },
    aliases: values.aliases
      .split(/[,，、]/)
      .map((a) => a.trim())
      .filter(Boolean),
    category: values.category,
    animalSpecies: isMeat && values.species ? (values.species as AnimalSpecies) : undefined,
    anatomicalCut: isMeat && values.species && values.cut ? (values.cut as MeatCut) : undefined,
    nutritionPer100g,
    tags: [],
    defaultShelfLife:
      refrigeratedDays === undefined && frozenDays === undefined
        ? undefined
        : { refrigeratedDays, frozenDays },
  };
}
