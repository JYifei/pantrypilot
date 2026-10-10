import { daysBetween, type IsoDate } from "../common/dates";
import type { IngredientDefinition } from "../ingredients/types";
import type { InventoryLot, InventoryTransaction } from "../inventory/types";
import { convertToGrams } from "../inventory/units";
import { compareRecipeMatches, readinessRank, type RecipeMatch } from "../recipes/matching";
import type { Recipe } from "../recipes/types";
import type { CookingSession, CookingSessionItem } from "./types";

/** The history page groups sessions from the last this-many days (today included). */
export const RECENT_HISTORY_DAYS = 7;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Copy what one recipe line took from one lot, with how its weight is known. */
export function snapshotItem(
  ingredientKey: string,
  lot: InventoryLot,
  definition: IngredientDefinition | undefined,
  amount: { grams?: number; count?: number },
): CookingSessionItem {
  const item: CookingSessionItem = {
    ingredientKey,
    lotId: lot.id,
    ingredientDefinitionId: lot.ingredientDefinitionId,
    ingredientName: definition?.name ?? { zhCN: lot.ingredientDefinitionId },
    weightBasis: "unknown",
  };
  if (lot.form) item.form = lot.form;
  if (lot.boneIn) item.boneIn = true;
  if (amount.grams !== undefined) {
    item.grams = amount.grams;
    item.weightBasis = "exact";
    return item;
  }
  item.count = amount.count ?? 0;
  if (lot.unit) {
    item.unit = lot.unit;
    const estimate = convertToGrams(item.count, lot.unit, definition?.defaultUnitConversions);
    if (estimate) {
      item.estimatedGrams = round1(estimate.grams);
      item.weightBasis = estimate.isEstimate ? "estimated" : "exact";
    }
  }
  return item;
}

/** Whole days between a session and today; negative if recorded "in the future". */
export function daysAgo(session: Pick<CookingSession, "localDate">, today: IsoDate): number {
  return daysBetween(session.localDate, today);
}

export interface RecentCook {
  recipeId: string;
  /** Days since the most recent session: 0 = today. */
  daysAgo: number;
  times: number;
}

/**
 * Recipes cooked within the last `days` calendar days (today counts as one).
 * Sessions whose recipe link is empty are ignored: they cannot be matched to
 * a current recipe. `days` of 0 turns the hint off.
 */
export function recentCooks(
  sessions: readonly CookingSession[],
  today: IsoDate,
  days: number,
): Map<string, RecentCook> {
  const recent = new Map<string, RecentCook>();
  if (days <= 0) return recent;
  for (const session of sessions) {
    if (!session.recipeId) continue;
    const ago = daysAgo(session, today);
    if (ago < 0 || ago >= days) continue;
    const previous = recent.get(session.recipeId);
    recent.set(session.recipeId, {
      recipeId: session.recipeId,
      daysAgo: previous ? Math.min(previous.daysAgo, ago) : ago,
      times: (previous?.times ?? 0) + 1,
    });
  }
  return recent;
}

/**
 * Readiness first, as before. Within the same readiness, recipes cooked
 * recently move after the others; otherwise the usual order applies.
 * Nothing is hidden or blocked.
 */
export function sortWithRepeatHints(
  matches: readonly RecipeMatch[],
  recent: ReadonlyMap<string, RecentCook>,
): RecipeMatch[] {
  const repeated = (match: RecipeMatch) => (recent.has(match.recipe.id) ? 1 : 0);
  return [...matches].sort(
    (a, b) =>
      readinessRank(a.readiness) - readinessRank(b.readiness) ||
      repeated(a) - repeated(b) ||
      compareRecipeMatches(a, b),
  );
}

/** Newest first; ties keep a stable order by ID. */
export function sortSessions(sessions: readonly CookingSession[]): CookingSession[] {
  return [...sessions].sort(
    (a, b) => b.cookedAt.localeCompare(a.cookedAt) || a.id.localeCompare(b.id),
  );
}

export interface SessionDay {
  localDate: IsoDate;
  sessions: CookingSession[];
}

/**
 * Sessions split into the last `recentDays` days and everything older, each
 * grouped by local date, newest first.
 */
export function groupSessionsByDay(
  sessions: readonly CookingSession[],
  today: IsoDate,
  recentDays = RECENT_HISTORY_DAYS,
): { recent: SessionDay[]; older: SessionDay[] } {
  const recent: SessionDay[] = [];
  const older: SessionDay[] = [];
  for (const session of sortSessions(sessions)) {
    const target = daysAgo(session, today) < recentDays ? recent : older;
    const last = target[target.length - 1];
    if (last && last.localDate === session.localDate) last.sessions.push(session);
    else target.push({ localDate: session.localDate, sessions: [session] });
  }
  return { recent, older };
}

/**
 * How the recipe a session came from relates to it now. "changed" means the
 * recipe was saved after cooking; the session still shows what was cooked.
 */
export type SessionRecipeStatus = "unlinked" | "deleted" | "changed" | "current";

export function sessionRecipeStatus(
  session: CookingSession,
  recipesById: ReadonlyMap<string, Recipe>,
): SessionRecipeStatus {
  if (!session.recipeId) return "unlinked";
  const recipe = recipesById.get(session.recipeId);
  if (!recipe) return "deleted";
  // Built-ins cannot be edited; their timestamps only record when they were seeded.
  if (!recipe.isBuiltin && recipe.updatedAt && recipe.updatedAt > session.cookedAt) {
    return "changed";
  }
  return "current";
}

/**
 * Consumption recorded for a recipe before cooking sessions existed. Each
 * transaction stands alone: servings and which deductions belonged to the
 * same meal were never recorded, so they are not inferred.
 */
export function legacyCookTransactions(
  transactions: readonly InventoryTransaction[],
): InventoryTransaction[] {
  return transactions
    .filter((t) => t.type === "consume" && t.recipeId && !t.cookingSessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
