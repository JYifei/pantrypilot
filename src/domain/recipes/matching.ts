import type { IsoDate } from "../common/dates";
import type { IngredientDefinition } from "../ingredients/types";
import {
  compareByExpiration,
  getExpirationStatus,
  type ExpirationStatus,
} from "../inventory/expiration";
import { getRemainingGrams, isLotDepleted, tracksWeight } from "../inventory/lotOperations";
import type { InventoryLot } from "../inventory/types";
import {
  calculateNutritionForWeight,
  sumNutrition,
  type NutrientValues,
  type NutritionSummary,
} from "../nutrition/calculate";
import { NUTRIENT_KEYS } from "../nutrition/types";
import type { Recipe, RecipeIngredient } from "./types";

/**
 * Matching recipes against the current inventory, and planning which lots a
 * cooked recipe consumes. Pure functions: callers pass lots, definitions and today.
 */

export interface MatchContext {
  lots: readonly InventoryLot[];
  definitionsById: ReadonlyMap<string, IngredientDefinition>;
  today: IsoDate;
}

/** Amounts are rounded to this precision to avoid floating-point noise. */
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Allow small rounding gaps (e.g. 248 g of a 250 g requirement still counts). */
const ENOUGH_TOLERANCE = 0.95;

export interface CandidateLot {
  lot: InventoryLot;
  definition: IngredientDefinition | undefined;
  /** Grams of this lot's ingredient per gram of the requirement. */
  ratio: number;
  /** Remaining grams of the lot (estimated for count-only lots); null when unknown. */
  lotGrams: number | null;
  expiration: ExpirationStatus;
}

export type LineStatus = "enough" | "partial" | "missing";

export interface IngredientLineMatch {
  ingredient: RecipeIngredient;
  /** Required grams after scaling to the requested servings. */
  neededGrams: number;
  /** Usable lots, earliest expiration first. Expired and depleted lots are excluded. */
  candidates: CandidateLot[];
  /** Available amount expressed in grams of the requirement. */
  availableGrams: number;
  /** True when a candidate lot exists but its quantity cannot be determined. */
  amountUnknown: boolean;
  status: LineStatus;
}

export type RecipeReadiness = "ready" | "almost" | "missing";

export interface RecipeMatch {
  recipe: Recipe;
  servings: number;
  lines: IngredientLineMatch[];
  /** Required lines that are missing or only partly available. */
  shortLines: IngredientLineMatch[];
  readiness: RecipeReadiness;
  /** Higher when the recipe would use lots that expire soon. */
  urgency: number;
  /** Lots expiring within a few days that this recipe would use. */
  expiringLotIds: string[];
}

const URGENCY_BY_STATUS: Partial<Record<ExpirationStatus, number>> = {
  today: 5,
  tomorrow: 4,
  soon: 3,
};

/** Grams of the requirement satisfied by one gram of the given ingredient, or null if it does not match. */
export function requirementRatio(
  ingredient: RecipeIngredient,
  definition: IngredientDefinition | undefined,
  ingredientId: string,
): number | null {
  if (ingredientId === ingredient.ingredientId) return 1;
  const alternative = ingredient.alternatives?.find((a) => a.ingredientId === ingredientId);
  if (alternative) return alternative.ratio ?? 1;
  if (ingredient.anySpecies && definition?.animalSpecies === ingredient.anySpecies) return 1;
  return null;
}

/**
 * The ingredient to show for a line: the recipe's own ingredient, unless only
 * substitutes (alternatives or other cuts) are in stock.
 */
export function displayIngredientId(line: IngredientLineMatch): string {
  const primary = line.ingredient.ingredientId;
  if (line.candidates.length === 0) return primary;
  if (line.candidates.some((c) => c.lot.ingredientDefinitionId === primary)) return primary;
  return line.candidates[0]!.lot.ingredientDefinitionId;
}

export function scaleGrams(ingredient: RecipeIngredient, recipe: Recipe, servings: number): number {
  return round((ingredient.grams * servings) / recipe.servings, 1);
}

function matchLine(
  ingredient: RecipeIngredient,
  neededGrams: number,
  context: MatchContext,
): IngredientLineMatch {
  const candidates: CandidateLot[] = [];
  for (const lot of context.lots) {
    if (isLotDepleted(lot)) continue;
    const expiration = getExpirationStatus(lot.expirationDate, context.today);
    if (expiration === "expired") continue;
    const definition = context.definitionsById.get(lot.ingredientDefinitionId);
    const ratio = requirementRatio(ingredient, definition, lot.ingredientDefinitionId);
    if (ratio === null) continue;
    const grams = getRemainingGrams(lot, definition);
    candidates.push({ lot, definition, ratio, lotGrams: grams?.grams ?? null, expiration });
  }
  candidates.sort(
    (a, b) => compareByExpiration(a.lot, b.lot) || a.lot.createdAt.localeCompare(b.lot.createdAt),
  );

  let availableGrams = 0;
  let amountUnknown = false;
  for (const candidate of candidates) {
    if (candidate.lotGrams === null) amountUnknown = true;
    else availableGrams += candidate.lotGrams / candidate.ratio;
  }
  availableGrams = round(availableGrams, 1);

  let status: LineStatus;
  if (candidates.length === 0) status = "missing";
  else if (amountUnknown || availableGrams >= neededGrams * ENOUGH_TOLERANCE) status = "enough";
  else status = "partial";

  return { ingredient, neededGrams, candidates, availableGrams, amountUnknown, status };
}

export function matchRecipe(
  recipe: Recipe,
  context: MatchContext,
  servings: number = recipe.servings,
): RecipeMatch {
  const lines = recipe.ingredients.map((ingredient) =>
    matchLine(ingredient, scaleGrams(ingredient, recipe, servings), context),
  );
  const required = lines.filter((line) => !line.ingredient.optional);
  const shortLines = required.filter((line) => line.status !== "enough");

  const hasSomeStock = required.some((line) => line.status !== "missing");
  let readiness: RecipeReadiness;
  if (shortLines.length === 0) readiness = "ready";
  else if (shortLines.length <= 2 && hasSomeStock) readiness = "almost";
  else readiness = "missing";

  const expiringLotIds = new Set<string>();
  let urgency = 0;
  for (const allocation of planLineAllocations(lines)) {
    const candidate = allocation.candidate;
    const weight = URGENCY_BY_STATUS[candidate.expiration] ?? 0;
    if (weight > 0 && !expiringLotIds.has(candidate.lot.id)) {
      expiringLotIds.add(candidate.lot.id);
      urgency += weight;
    }
  }

  return {
    recipe,
    servings,
    lines,
    shortLines,
    readiness,
    urgency,
    expiringLotIds: [...expiringLotIds],
  };
}

const READINESS_ORDER: Record<RecipeReadiness, number> = { ready: 0, almost: 1, missing: 2 };

/** Ready recipes first, then those using soon-to-expire food, then fewest missing items. */
export function compareRecipeMatches(a: RecipeMatch, b: RecipeMatch): number {
  return (
    READINESS_ORDER[a.readiness] - READINESS_ORDER[b.readiness] ||
    b.urgency - a.urgency ||
    a.shortLines.length - b.shortLines.length ||
    a.recipe.id.localeCompare(b.recipe.id)
  );
}

export function matchAllRecipes(recipes: readonly Recipe[], context: MatchContext): RecipeMatch[] {
  return recipes.map((recipe) => matchRecipe(recipe, context)).sort(compareRecipeMatches);
}

// --- Cooking plan -----------------------------------------------------------

/** One planned deduction from a lot. Exactly one of grams / count is set. */
export interface CookingAllocation {
  ingredientKey: string;
  lotId: string;
  grams?: number;
  count?: number;
}

interface LineAllocation {
  line: IngredientLineMatch;
  candidate: CandidateLot;
  /** Grams of the lot's own ingredient to take. */
  lotGrams: number;
}

/** Greedy allocation: earliest-expiring lots first, until each line is covered. */
function planLineAllocations(lines: readonly IngredientLineMatch[]): LineAllocation[] {
  const result: LineAllocation[] = [];
  const usedGrams = new Map<string, number>();
  for (const line of lines) {
    let remaining = line.neededGrams;
    for (const candidate of line.candidates) {
      if (remaining <= 0) break;
      if (candidate.lotGrams === null) continue;
      const free = candidate.lotGrams - (usedGrams.get(candidate.lot.id) ?? 0);
      if (free <= 0) continue;
      const take = Math.min(free, remaining * candidate.ratio);
      usedGrams.set(candidate.lot.id, (usedGrams.get(candidate.lot.id) ?? 0) + take);
      remaining -= take / candidate.ratio;
      result.push({ line, candidate, lotGrams: take });
    }
  }
  return result;
}

/**
 * Suggested deductions for cooking a matched recipe. Weight-tracked lots are
 * reduced in grams; count-only lots (e.g. "6 eggs") in pieces, converted
 * with the ingredient's unit estimate.
 */
export function planCooking(match: RecipeMatch): CookingAllocation[] {
  const allocations: CookingAllocation[] = [];
  for (const { line, candidate, lotGrams } of planLineAllocations(match.lines)) {
    const base = { ingredientKey: line.ingredient.key, lotId: candidate.lot.id };
    if (tracksWeight(candidate.lot)) {
      allocations.push({ ...base, grams: round(Math.min(lotGrams, candidate.lotGrams!), 1) });
    } else {
      const perUnit =
        candidate.lot.unit && candidate.definition?.defaultUnitConversions?.[candidate.lot.unit];
      if (!perUnit) continue;
      const count = Math.min(candidate.lot.count ?? 0, round(lotGrams / perUnit.estimatedGrams));
      if (count > 0) allocations.push({ ...base, count });
    }
  }
  return allocations;
}

// --- Nutrition ----------------------------------------------------------------

/**
 * Estimated nutrition per serving from the primary ingredients (optional lines
 * included, seasonings excluded). Unknown values stay unknown.
 */
export function estimateRecipeNutritionPerServing(
  recipe: Recipe,
  definitionsById: ReadonlyMap<string, IngredientDefinition>,
): NutritionSummary {
  const portions: NutrientValues[] = recipe.ingredients.map((ingredient) => {
    const definition = definitionsById.get(ingredient.ingredientId);
    const values = calculateNutritionForWeight(definition?.nutritionPer100g, ingredient.grams);
    for (const key of NUTRIENT_KEYS) {
      const value = values[key];
      if (value !== null) values[key] = value / recipe.servings;
    }
    return values;
  });
  return sumNutrition(portions);
}

/** All ingredient IDs a recipe refers to (primary and alternatives). */
export function referencedIngredientIds(recipe: Recipe): string[] {
  const ids = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    ids.add(ingredient.ingredientId);
    for (const alternative of ingredient.alternatives ?? []) ids.add(alternative.ingredientId);
  }
  return [...ids];
}
