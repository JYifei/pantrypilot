import type { LocalizedText } from "../common/localizedText";
import type { IngredientDefinition } from "../ingredients/types";
import { displayIngredientId, type RecipeMatch } from "../recipes/matching";
import type { Recipe, RecipeIngredient } from "../recipes/types";

/**
 * The shopping list of a plan, derived from `matchPlan` (one shared allocation
 * for all dishes). Pure: callers recompute it whenever the plan or the
 * inventory changes. Three separate parts:
 * - gaps: certain shortages, merged per ingredient to buy;
 * - toConfirm: lines whose stock amount is unknown or undecided; they are
 *   never counted as gaps;
 * - seasonings: pantry staples to check at home; never counted as stock.
 */

const round1 = (value: number) => Math.round(value * 10) / 10;

/** An ingredient that can be bought for a recipe line. */
export interface BuyOption {
  ingredientId: string;
  /** Grams of this ingredient per gram of the requirement. */
  ratio: number;
}

/** The recipe's own ingredient first, then its alternatives. */
export function buyOptions(ingredient: RecipeIngredient): BuyOption[] {
  return [
    { ingredientId: ingredient.ingredientId, ratio: 1 },
    ...(ingredient.alternatives ?? []).map((a) => ({
      ingredientId: a.ingredientId,
      ratio: a.ratio ?? 1,
    })),
  ];
}

/** The option the user picked for the line, else the recipe's own ingredient. */
export function chosenBuyOption(
  ingredient: RecipeIngredient,
  choices: Readonly<Record<string, string>>,
): BuyOption {
  const options = buyOptions(ingredient);
  const chosen = choices[ingredient.key];
  return options.find((o) => o.ingredientId === chosen) ?? options[0]!;
}

export interface PlanDish {
  entryId: string;
  match: RecipeMatch;
  choices: Readonly<Record<string, string>>;
}

/** One recipe line behind a gap. Grams are of the item's ingredient. */
export interface GapSource {
  entryId: string;
  recipe: Recipe;
  ingredientKey: string;
  neededGrams: number;
  inStockGrams: number;
  gapGrams: number;
  options: BuyOption[];
}

export interface ShoppingGap {
  ingredientId: string;
  /** What the lines buying this ingredient need in total. */
  neededGrams: number;
  /** What the shared allocation covers from stock. */
  inStockGrams: number;
  /** needed − in stock, rounded up to whole grams. */
  gapGrams: number;
  /** About this many pieces, when the ingredient has a per-piece estimate. */
  approxPieces?: number;
  sources: GapSource[];
}

export interface ConfirmSource {
  entryId: string;
  recipe: Recipe;
  ingredientKey: string;
  neededGrams: number;
  /** `unknown_amount`: a lot records no usable quantity. `allocation_uncertain`: shared stock may not suffice. */
  reason: "unknown_amount" | "allocation_uncertain";
}

export interface ConfirmItem {
  ingredientId: string;
  sources: ConfirmSource[];
}

export interface SeasoningCheck {
  text: LocalizedText;
  recipes: Recipe[];
}

export interface ShoppingList {
  gaps: ShoppingGap[];
  toConfirm: ConfirmItem[];
  seasonings: SeasoningCheck[];
}

function piecesFor(grams: number, definition: IngredientDefinition | undefined) {
  const perPiece = definition?.defaultUnitConversions?.piece?.estimatedGrams;
  return perPiece ? Math.ceil(round1(grams / perPiece) - 1e-9) : undefined;
}

/**
 * Build the list. Optional lines are left out: they never make a dish short.
 * A gap is listed only for the ingredient chosen for the line, so alternatives
 * are never bought all at once; lines that buy the same ingredient are merged
 * and the shared allocation decides how much stock each of them already has.
 */
export function buildShoppingList(
  dishes: readonly PlanDish[],
  definitionsById: ReadonlyMap<string, IngredientDefinition>,
): ShoppingList {
  const gapGroups = new Map<string, GapSource[]>();
  const confirmGroups = new Map<string, ConfirmSource[]>();
  const seasonings = new Map<string, SeasoningCheck>();

  for (const { entryId, match, choices } of dishes) {
    const recipe = match.recipe;
    for (const line of match.lines) {
      if (line.ingredient.optional) continue;
      const ingredientKey = line.ingredient.key;
      if (line.status === "unknown") {
        const id = displayIngredientId(line);
        const sources = confirmGroups.get(id) ?? [];
        sources.push({
          entryId,
          recipe,
          ingredientKey,
          neededGrams: line.neededGrams,
          reason: line.reasons.includes("unknown_amount")
            ? "unknown_amount"
            : "allocation_uncertain",
        });
        confirmGroups.set(id, sources);
        continue;
      }
      const option = chosenBuyOption(line.ingredient, choices);
      const short = line.status === "partial" || line.status === "missing";
      const sources = gapGroups.get(option.ingredientId) ?? [];
      sources.push({
        entryId,
        recipe,
        ingredientKey,
        neededGrams: round1(line.neededGrams * option.ratio),
        inStockGrams: round1(Math.min(line.suppliedGrams, line.neededGrams) * option.ratio),
        gapGrams: short ? round1(line.shortfallGrams * option.ratio) : 0,
        options: buyOptions(line.ingredient),
      });
      gapGroups.set(option.ingredientId, sources);
    }
    for (const text of recipe.seasonings) {
      const key = text.zhCN.trim();
      const entry = seasonings.get(key) ?? { text, recipes: [] };
      if (!entry.recipes.some((r) => r.id === recipe.id)) entry.recipes.push(recipe);
      seasonings.set(key, entry);
    }
  }

  const gaps: ShoppingGap[] = [];
  for (const [ingredientId, sources] of gapGroups) {
    const gap = round1(sources.reduce((sum, s) => sum + s.gapGrams, 0));
    if (gap <= 0) continue;
    const gapGrams = Math.ceil(gap - 1e-9);
    const item: ShoppingGap = {
      ingredientId,
      neededGrams: round1(sources.reduce((sum, s) => sum + s.neededGrams, 0)),
      inStockGrams: round1(sources.reduce((sum, s) => sum + s.inStockGrams, 0)),
      gapGrams,
      sources,
    };
    const pieces = piecesFor(gapGrams, definitionsById.get(ingredientId));
    if (pieces !== undefined) item.approxPieces = pieces;
    gaps.push(item);
  }

  return {
    gaps,
    toConfirm: [...confirmGroups].map(([ingredientId, sources]) => ({ ingredientId, sources })),
    seasonings: [...seasonings.values()],
  };
}
