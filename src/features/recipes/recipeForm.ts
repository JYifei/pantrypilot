import { z } from "zod";
import { localize, type LocaleCode, type LocalizedText } from "@/domain/common/localizedText";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { Recipe, RecipeIngredient } from "@/domain/recipes/types";
import type { RecipeInput } from "@/services/recipeService";

/** Form model for user-created recipes. Text is entered in the current UI language. */

const isBlank = (v: string) => v.trim() === "";
const isPositive = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0;

const ingredientLineSchema = z.object({
  key: z.string(),
  ingredientId: z.string().refine((v) => !isBlank(v), { message: "validation.foodRequired" }),
  grams: z.string().refine(isPositive, { message: "validation.positiveNumber" }),
  optional: z.boolean(),
  anySpecies: z.boolean(),
});

export const recipeFormSchema = z.object({
  name: z.string().refine((v) => !isBlank(v), { message: "validation.recipeNameRequired" }),
  description: z.string(),
  servings: z.string().refine((v) => isPositive(v) && Number.isInteger(Number(v)), {
    message: "validation.positiveInteger",
  }),
  timeMinutes: z
    .string()
    .refine((v) => isBlank(v) || (Number.isInteger(Number(v)) && Number(v) >= 0), {
      message: "validation.nonNegativeNumber",
    }),
  ingredients: z
    .array(ingredientLineSchema)
    .refine((lines) => lines.some((line) => !line.optional), {
      message: "validation.requiredIngredient",
    }),
  seasonings: z.string(),
  steps: z.string(),
});

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;
export type RecipeFormLine = RecipeFormValues["ingredients"][number];

const LOCALE_SLOT: Record<LocaleCode, keyof LocalizedText> = {
  "zh-CN": "zhCN",
  "en-US": "enUS",
  "ja-JP": "jaJP",
};

/**
 * Text typed in one language. Unchanged text keeps all its translations;
 * changed text replaces them, because the other languages would be stale.
 * `zhCN` is always filled because LocalizedText requires it.
 */
export function mergeLocalized(
  previous: LocalizedText | undefined,
  value: string,
  locale: LocaleCode,
): LocalizedText {
  const trimmed = value.trim();
  if (previous && localize(previous, locale) === trimmed) return previous;
  return { zhCN: trimmed, [LOCALE_SLOT[locale]]: trimmed };
}

export function emptyRecipeLine(index: number): RecipeFormLine {
  return { key: `i${index + 1}`, ingredientId: "", grams: "", optional: false, anySpecies: false };
}

export function emptyRecipeForm(): RecipeFormValues {
  return {
    name: "",
    description: "",
    servings: "2",
    timeMinutes: "",
    ingredients: [emptyRecipeLine(0)],
    seasonings: "",
    steps: "",
  };
}

export function recipeToFormValues(recipe: Recipe, locale: LocaleCode): RecipeFormValues {
  return {
    name: localize(recipe.name, locale),
    description: recipe.description ? localize(recipe.description, locale) : "",
    servings: String(recipe.servings),
    timeMinutes: recipe.timeMinutes?.toString() ?? "",
    ingredients: recipe.ingredients.map((line) => ({
      key: line.key,
      ingredientId: line.ingredientId,
      grams: String(line.grams),
      optional: line.optional ?? false,
      anySpecies: line.anySpecies !== undefined,
    })),
    seasonings: recipe.seasonings.map((s) => localize(s, locale)).join(", "),
    steps: recipe.steps.map((s) => localize(s, locale)).join("\n"),
  };
}

const splitList = (text: string, separator: RegExp) =>
  text
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);

/** Make line keys unique (new lines may collide with keys of removed lines). */
function uniqueKeys(lines: readonly RecipeFormLine[]): string[] {
  const used = new Set<string>();
  return lines.map((line, index) => {
    let key = line.key || `i${index + 1}`;
    let n = 0;
    while (used.has(key)) key = `i${++n}`;
    used.add(key);
    return key;
  });
}

export function formValuesToRecipeInput(
  values: RecipeFormValues,
  locale: LocaleCode,
  definitionsById: ReadonlyMap<string, IngredientDefinition>,
  existing?: Recipe,
): RecipeInput {
  const keys = uniqueKeys(values.ingredients);
  const ingredients: RecipeIngredient[] = values.ingredients.map((line, index) => {
    const grams = Number(line.grams);
    const previous = existing?.ingredients.find(
      (i) => i.key === line.key && i.ingredientId === line.ingredientId,
    );
    const species = definitionsById.get(line.ingredientId)?.animalSpecies;
    const result: RecipeIngredient = { key: keys[index]!, ingredientId: line.ingredientId, grams };
    if (previous?.alternatives) result.alternatives = previous.alternatives;
    if (previous?.form) result.form = previous.form;
    if (previous?.count !== undefined && previous.grams === grams) result.count = previous.count;
    if (line.anySpecies && species) result.anySpecies = species;
    if (line.optional) result.optional = true;
    return result;
  });

  const seasonings = splitList(values.seasonings, /[,，、]/).map((text) =>
    mergeLocalized(
      existing?.seasonings.find((s) => localize(s, locale) === text),
      text,
      locale,
    ),
  );
  const steps = splitList(values.steps, /\r?\n/).map((text, index) =>
    mergeLocalized(existing?.steps[index], text, locale),
  );

  return {
    name: mergeLocalized(existing?.name, values.name, locale),
    description: isBlank(values.description)
      ? undefined
      : mergeLocalized(existing?.description, values.description, locale),
    servings: Number(values.servings),
    timeMinutes: isBlank(values.timeMinutes) ? undefined : Number(values.timeMinutes),
    tags: existing?.tags ?? [],
    ingredients,
    seasonings,
    steps,
  };
}
