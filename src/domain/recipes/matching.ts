import type { IsoDate } from "../common/dates";
import type { InventoryUnit, ProductForm } from "../ingredients/taxonomy";
import type { IngredientDefinition } from "../ingredients/types";
import {
  compareByExpiration,
  getExpirationStatus,
  isExpiringSoon,
  type ExpirationStatus,
} from "../inventory/expiration";
import { isLotDepleted, tracksCount, tracksWeight } from "../inventory/lotOperations";
import type { InventoryLot } from "../inventory/types";
import { convertToGrams } from "../inventory/units";
import {
  calculateNutritionForWeight,
  sumNutrition,
  type NutrientValues,
  type NutritionSummary,
} from "../nutrition/calculate";
import { edibleGrams } from "../nutrition/inventoryNutrition";
import { NUTRIENT_KEYS } from "../nutrition/types";
import { checkFormFit, isPreparedLot } from "./compatibility";
import type { Recipe, RecipeIngredient } from "./types";

/**
 * Matching recipes against the current inventory. One allocator decides which
 * lots each recipe line would use; readiness, explanations and the suggested
 * cooking deductions are all read from that single allocation. Pure functions:
 * callers pass lots, definitions and today.
 *
 * Quantities:
 * - Recipe grams are edible grams of the primary ingredient.
 * - Lots are measured in remaining purchased grams, or in units (pieces, bags…).
 *   Bone-in and whole lots are converted with the definition's edible ratio;
 *   unit lots with the definition's grams-per-unit estimate.
 * - An alternative with `ratio` r supplies 1 / r grams of the requirement per gram.
 */

export interface MatchContext {
  lots: readonly InventoryLot[];
  definitionsById: ReadonlyMap<string, IngredientDefinition>;
  today: IsoDate;
}

/** Amounts are rounded to this precision to avoid floating-point noise. */
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * A line with at least this share of its requirement counts as covered for
 * home cooking. The gap is still reported, and deductions never exceed stock.
 */
export const NEARLY_ENOUGH = 0.95;

/** Gaps below this many grams come from rounding and are not reported. */
const GRAM_SLACK = 0.5;
const EPSILON = 1e-6;

// --- Types ------------------------------------------------------------------

export type CandidateNote =
  /** Unit lot converted with an estimate, e.g. one egg ≈ 50 g. */
  | { kind: "estimated_count"; unit: InventoryUnit; gramsPerUnit: number }
  /** Bone-in or whole lot: only this share of the weight is edible. */
  | { kind: "edible_ratio"; ratio: number }
  /** Bone-in lot without a known edible ratio: the full weight is used as an estimate. */
  | { kind: "edible_ratio_unknown" }
  /** The recipe suggests another form; the lot needs cutting or is a common stand-in. */
  | { kind: "form_differs"; form: ProductForm };

/** How deductions from a lot are expressed. */
export type LotMeasure = "weight" | "count" | "none";

export interface CandidateLot {
  lot: InventoryLot;
  definition: IngredientDefinition | undefined;
  /** Grams of this lot's ingredient per gram of the requirement (alternative ratio). */
  ratio: number;
  measure: LotMeasure;
  /** Remaining grams or units; null when the lot records no quantity. */
  remaining: number | null;
  /** Requirement grams supplied by one gram or unit of the lot; null when unknown. */
  yieldPerUnit: number | null;
  /** Remaining purchased weight in grams (estimated for unit lots); null when unknown. */
  lotGrams: number | null;
  expiration: ExpirationStatus;
  notes: CandidateNote[];
}

/** Lots of a matching ingredient that cannot be used for this line, and why. */
export interface ExcludedLot {
  lot: InventoryLot;
  definition: IngredientDefinition | undefined;
  /** `form`: e.g. minced meat for a steak. `prepared`: cooked or smoked, offered as any cut. */
  reason: "form" | "prepared";
}

export interface LotUse {
  candidate: CandidateLot;
  /** Amount taken from the lot, in grams or units (see `candidate.measure`). */
  amount: number;
  /** Requirement grams this supplies. */
  grams: number;
}

/**
 * - `enough`: covered (possibly within NEARLY_ENOUGH, see `shortfallGrams`).
 * - `partial` / `missing`: not enough known stock.
 * - `unknown`: needs the user to confirm: an amount is unrecorded, or the
 *   allocator could not decide whether lots shared with other lines suffice.
 */
export type LineStatus = "enough" | "partial" | "missing" | "unknown";

export type LineReason =
  | "nearly_enough"
  | "unknown_amount"
  | "allocation_uncertain"
  /** Stock exists but other lines of the recipe use it. */
  | "shared";

export interface IngredientLineMatch {
  ingredient: RecipeIngredient;
  /** Required edible grams after scaling to the requested servings. */
  neededGrams: number;
  /** Usable lots, earliest expiration first. Expired and depleted lots are left out. */
  candidates: CandidateLot[];
  excluded: ExcludedLot[];
  /** What this line takes from each lot in the allocation. */
  uses: LotUse[];
  suppliedGrams: number;
  shortfallGrams: number;
  /** Known stock for this line alone, in requirement grams, ignoring other lines. */
  availableGrams: number;
  /** A usable lot exists whose quantity cannot be expressed in grams. */
  amountUnknown: boolean;
  status: LineStatus;
  reasons: LineReason[];
}

export type RecipeReadiness = "ready" | "confirm" | "almost" | "missing";

export interface ExpiringUse {
  line: IngredientLineMatch;
  use: LotUse;
}

export interface RecipeMatch {
  recipe: Recipe;
  servings: number;
  lines: IngredientLineMatch[];
  /** Required lines that are missing or only partly available. */
  shortLines: IngredientLineMatch[];
  /** Required lines waiting for the user to confirm an amount. */
  unconfirmedLines: IngredientLineMatch[];
  readiness: RecipeReadiness;
  /** Higher when the allocation uses lots that expire soon. */
  urgency: number;
  /** Allocated uses of lots expiring within a few days. */
  expiringUses: ExpiringUse[];
  expiringLotIds: string[];
}

const URGENCY_BY_STATUS: Partial<Record<ExpirationStatus, number>> = {
  today: 5,
  tomorrow: 4,
  soon: 3,
};

// --- Candidates -------------------------------------------------------------

/** Grams of the requirement satisfied by one gram of the given ingredient, or null if it does not match. */
export function requirementRatio(
  ingredient: RecipeIngredient,
  definition: IngredientDefinition | undefined,
  ingredientId: string,
): number | null {
  return matchIngredient(ingredient, definition, ingredientId)?.ratio ?? null;
}

function matchIngredient(
  ingredient: RecipeIngredient,
  definition: IngredientDefinition | undefined,
  ingredientId: string,
): { ratio: number; bySpecies: boolean } | null {
  if (ingredientId === ingredient.ingredientId) return { ratio: 1, bySpecies: false };
  const alternative = ingredient.alternatives?.find((a) => a.ingredientId === ingredientId);
  if (alternative) return { ratio: alternative.ratio ?? 1, bySpecies: false };
  if (ingredient.anySpecies && definition?.animalSpecies === ingredient.anySpecies) {
    return { ratio: 1, bySpecies: true };
  }
  return null;
}

/** Earliest expiration first (undated last), then oldest, then by ID so input order never matters. */
function compareLots(a: InventoryLot, b: InventoryLot): number {
  return (
    compareByExpiration(a, b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

function describeCandidate(
  lot: InventoryLot,
  definition: IngredientDefinition | undefined,
  ratio: number,
  expiration: ExpirationStatus,
  differentForm: ProductForm | undefined,
): CandidateLot {
  const notes: CandidateNote[] = [];
  let measure: LotMeasure = "none";
  let remaining: number | null = null;
  let purchasedGramsPerUnit: number | null = null;
  if (tracksWeight(lot)) {
    measure = "weight";
    remaining = lot.remainingWeightG!;
    purchasedGramsPerUnit = 1;
  } else if (tracksCount(lot)) {
    measure = "count";
    remaining = lot.count!;
    const perUnit = lot.unit
      ? convertToGrams(1, lot.unit, definition?.defaultUnitConversions)
      : null;
    if (perUnit) {
      purchasedGramsPerUnit = perUnit.grams;
      if (perUnit.isEstimate) {
        notes.push({ kind: "estimated_count", unit: lot.unit!, gramsPerUnit: perUnit.grams });
      }
    }
  }

  const edibleShare = definition ? edibleGrams(1, lot, definition) : 1;
  if (edibleShare !== 1) notes.push({ kind: "edible_ratio", ratio: edibleShare });
  else if (lot.boneIn && definition?.defaultEdibleRatio === undefined) {
    notes.push({ kind: "edible_ratio_unknown" });
  }
  if (differentForm) notes.push({ kind: "form_differs", form: differentForm });

  const yieldPerUnit =
    purchasedGramsPerUnit === null ? null : (purchasedGramsPerUnit * edibleShare) / ratio;
  const lotGrams =
    purchasedGramsPerUnit === null || remaining === null
      ? null
      : round(remaining * purchasedGramsPerUnit, 1);
  return { lot, definition, ratio, measure, remaining, yieldPerUnit, lotGrams, expiration, notes };
}

function findCandidates(
  ingredient: RecipeIngredient,
  context: MatchContext,
): { candidates: CandidateLot[]; excluded: ExcludedLot[] } {
  const candidates: CandidateLot[] = [];
  const excluded: ExcludedLot[] = [];
  for (const lot of context.lots) {
    if (isLotDepleted(lot)) continue;
    const expiration = getExpirationStatus(lot.expirationDate, context.today);
    if (expiration === "expired") continue;
    const definition = context.definitionsById.get(lot.ingredientDefinitionId);
    const matched = matchIngredient(ingredient, definition, lot.ingredientDefinitionId);
    if (!matched) continue;
    // "Any cut of this species" means raw cuts; cooked leftovers need to be named explicitly.
    if (matched.bySpecies && isPreparedLot(lot)) {
      excluded.push({ lot, definition, reason: "prepared" });
      continue;
    }
    const fit = checkFormFit(ingredient.form, lot, definition);
    if (fit === "incompatible") {
      excluded.push({ lot, definition, reason: "form" });
      continue;
    }
    candidates.push(
      describeCandidate(
        lot,
        definition,
        matched.ratio,
        expiration,
        fit === "differs" ? ingredient.form : undefined,
      ),
    );
  }
  candidates.sort((a, b) => compareLots(a.lot, b.lot));
  excluded.sort((a, b) => compareLots(a.lot, b.lot));
  return { candidates, excluded };
}

const isKnown = (candidate: CandidateLot) =>
  candidate.remaining !== null && candidate.yieldPerUnit !== null && candidate.yieldPerUnit > 0;

// --- Allocation ---------------------------------------------------------------

interface LineState {
  index: number;
  ingredient: RecipeIngredient;
  neededGrams: number;
  candidates: CandidateLot[];
  excluded: ExcludedLot[];
  /** Candidates with a known amount, in allocation order. */
  known: CandidateLot[];
  amountUnknown: boolean;
  /** Amount taken per lot ID, in the lot's measure. */
  taken: Map<string, number>;
}

/** Shared balances: no lot is ever allocated beyond its remaining amount across all lines. */
class Ledger {
  private readonly used = new Map<string, number>();

  free(candidate: CandidateLot): number {
    return candidate.remaining! - (this.used.get(candidate.lot.id) ?? 0);
  }

  add(line: LineState, lotId: string, amount: number): void {
    this.used.set(lotId, (this.used.get(lotId) ?? 0) + amount);
    line.taken.set(lotId, (line.taken.get(lotId) ?? 0) + amount);
  }
}

function suppliedGrams(line: LineState): number {
  let total = 0;
  for (const candidate of line.known) {
    total += (line.taken.get(candidate.lot.id) ?? 0) * candidate.yieldPerUnit!;
  }
  return total;
}

const gramsShort = (line: LineState) => Math.max(0, line.neededGrams - suppliedGrams(line));

/** Take free stock, earliest-expiring lot first, until the line is covered. */
function fill(line: LineState, ledger: Ledger): void {
  for (const candidate of line.known) {
    const short = gramsShort(line);
    if (short <= EPSILON) return;
    const free = ledger.free(candidate);
    if (free <= EPSILON) continue;
    ledger.add(line, candidate.lot.id, Math.min(free, short / candidate.yieldPerUnit!));
  }
}

/**
 * One round of reallocation for a short line: other required lines holding one
 * of its lots move to their own alternatives where those have free stock.
 * Example: line A takes chicken or pork, line B only chicken; if A took the
 * chicken first, A moves to pork so B can have the chicken.
 */
function makeRoom(line: LineState, others: readonly LineState[], ledger: Ledger): void {
  for (const candidate of line.known) {
    const short = gramsShort(line);
    if (short <= EPSILON) return;
    let toFree = short / candidate.yieldPerUnit! - ledger.free(candidate);
    for (const other of others) {
      if (toFree <= EPSILON) break;
      const held = other.known.find((c) => c.lot.id === candidate.lot.id);
      if (!held) continue;
      for (const alternative of other.known) {
        if (toFree <= EPSILON) break;
        const holding = other.taken.get(candidate.lot.id) ?? 0;
        if (holding <= EPSILON) break;
        if (alternative.lot.id === candidate.lot.id) continue;
        const free = ledger.free(alternative);
        if (free <= EPSILON) continue;
        const release = Math.min(
          toFree,
          holding,
          (free * alternative.yieldPerUnit!) / held.yieldPerUnit!,
        );
        ledger.add(other, candidate.lot.id, -release);
        ledger.add(
          other,
          alternative.lot.id,
          (release * held.yieldPerUnit!) / alternative.yieldPerUnit!,
        );
        toFree -= release;
      }
    }
    fill(line, ledger);
  }
}

/** Whole pieces and slices; millilitres; tenths of a bag, pack, bunch… */
function unitStep(unit: InventoryUnit | undefined): number {
  return unit === "piece" || unit === "slice" || unit === "ml" ? 1 : 0.1;
}

/** Round up to the step, ignoring a 10 % overshoot (2.05 eggs → 2, 2.4 eggs → 3). */
function roundUpToStep(value: number, step: number): number {
  return round(Math.ceil(round(value / step, 6) - 0.1) * step, 6);
}

function roundDownToStep(value: number, step: number): number {
  return round(Math.floor(round(value / step, 6)) * step, 6);
}

/**
 * Turn the continuous allocation into amounts that can be deducted: grams to
 * 0.1 g (rounded down), units to their step (rounded up when there is room).
 * Lines are processed in allocation order, and the rounded total per lot never
 * exceeds what remains. Required lines are rounded before optional ones look
 * at what is left.
 */
function roundAllocation(order: readonly LineState[], roundedUsed: Map<string, number>): void {
  order.forEach((line, position) => {
    for (const candidate of line.known) {
      const id = candidate.lot.id;
      const amount = line.taken.get(id) ?? 0;
      if (amount <= EPSILON) {
        line.taken.delete(id);
        continue;
      }
      const laterUse = order
        .slice(position + 1)
        .reduce((sum, later) => sum + (later.taken.get(id) ?? 0), 0);
      const room = candidate.remaining! - (roundedUsed.get(id) ?? 0) - laterUse;
      const step = candidate.measure === "count" ? unitStep(candidate.lot.unit) : 0.1;
      const target = candidate.measure === "count" ? roundUpToStep(amount, step) : amount;
      const rounded = Math.max(0, roundDownToStep(Math.min(target, room + EPSILON), step));
      if (rounded <= 0) line.taken.delete(id);
      else line.taken.set(id, rounded);
      roundedUsed.set(id, (roundedUsed.get(id) ?? 0) + rounded);
    }
  });
}

function knownStock(line: LineState): number {
  return line.known.reduce((sum, c) => sum + c.remaining! * c.yieldPerUnit!, 0);
}

/**
 * True when the shortage of `line` is certain: the required lines that can only
 * use lots `line` can use need more than those lots hold (a Hall-type bound).
 * Amounts are compared in grams of the lots' own ingredients, so each line in
 * the group must use one alternative ratio for all its lots; otherwise the
 * answer is "unsure" and the user is asked to confirm.
 */
function shortageIsCertain(line: LineState, required: readonly LineState[]): boolean {
  const lotIds = new Set(line.known.map((c) => c.lot.id));
  const group = required.filter(
    (other) =>
      !other.amountUnknown &&
      other.known.length > 0 &&
      other.known.every((c) => lotIds.has(c.lot.id)),
  );
  const lotGrams = new Map<string, number>();
  let needed = 0;
  for (const other of group) {
    const ratio = other.known[0]!.ratio;
    if (other.known.some((c) => Math.abs(c.ratio - ratio) > EPSILON)) return false;
    needed += other.neededGrams * NEARLY_ENOUGH * ratio;
    for (const candidate of other.known) {
      // Edible grams of the lot's own ingredient, independent of the line.
      lotGrams.set(candidate.lot.id, candidate.remaining! * candidate.yieldPerUnit! * ratio);
    }
  }
  let capacity = 0;
  for (const grams of lotGrams.values()) capacity += grams;
  return needed > capacity + EPSILON;
}

function toLineMatch(line: LineState, required: readonly LineState[]): IngredientLineMatch {
  const uses: LotUse[] = [];
  for (const candidate of line.known) {
    const amount = line.taken.get(candidate.lot.id);
    if (amount === undefined || amount <= 0) continue;
    uses.push({ candidate, amount, grams: round(amount * candidate.yieldPerUnit!, 1) });
  }
  const supplied = round(suppliedGrams(line), 1);
  const needed = line.neededGrams;
  const availableGrams = round(knownStock(line), 1);
  const shortfall = needed - supplied > GRAM_SLACK ? round(needed - supplied, 1) : 0;
  const reasons: LineReason[] = [];
  let status: LineStatus;
  if (shortfall === 0) {
    status = "enough";
  } else if (supplied >= needed * NEARLY_ENOUGH) {
    status = "enough";
    reasons.push("nearly_enough");
  } else if (line.amountUnknown) {
    status = "unknown";
    reasons.push("unknown_amount");
  } else if (availableGrams >= needed * NEARLY_ENOUGH) {
    reasons.push("shared");
    if (!line.ingredient.optional && !shortageIsCertain(line, required)) {
      status = "unknown";
      reasons.push("allocation_uncertain");
    } else {
      status = supplied > 0 ? "partial" : "missing";
    }
  } else {
    status = supplied > 0 ? "partial" : "missing";
  }
  return {
    ingredient: line.ingredient,
    neededGrams: needed,
    candidates: line.candidates,
    excluded: line.excluded,
    uses,
    suppliedGrams: supplied,
    shortfallGrams: shortfall,
    availableGrams,
    amountUnknown: line.amountUnknown,
    status,
    reasons,
  };
}

/**
 * Allocate stock to every line of a recipe:
 * 1. Required lines first, those with the fewest candidate lots first; each
 *    takes free stock, earliest expiration first.
 * 2. One round of reallocation for required lines that are still short.
 * 3. Optional lines only take what is left.
 * 4. Round to deductible amounts, then classify each line.
 */
function allocateLines(recipe: Recipe, servings: number, context: MatchContext) {
  const states: LineState[] = recipe.ingredients.map((ingredient, index) => {
    const { candidates, excluded } = findCandidates(ingredient, context);
    const known = candidates.filter(isKnown);
    return {
      index,
      ingredient,
      neededGrams: scaleGrams(ingredient, recipe, servings),
      candidates,
      excluded,
      known,
      amountUnknown: known.length < candidates.length,
      taken: new Map(),
    };
  });
  const required = states
    .filter((s) => !s.ingredient.optional)
    .sort((a, b) => a.candidates.length - b.candidates.length || a.index - b.index);
  const optional = states.filter((s) => s.ingredient.optional);

  const ledger = new Ledger();
  for (const line of required) fill(line, ledger);
  for (const line of required) {
    if (gramsShort(line) > EPSILON) {
      makeRoom(
        line,
        required.filter((other) => other !== line),
        ledger,
      );
    }
  }
  for (const line of optional) fill(line, ledger);
  const roundedUsed = new Map<string, number>();
  roundAllocation(required, roundedUsed);
  roundAllocation(optional, roundedUsed);

  return states.map((line) => toLineMatch(line, required));
}

// --- Matching -----------------------------------------------------------------

/**
 * The ingredient to show for a line: the lot actually used, else the recipe's
 * own ingredient when stocked, else the first stocked substitute.
 */
export function displayIngredientId(line: IngredientLineMatch): string {
  const used = line.uses[0];
  if (used) return used.candidate.lot.ingredientDefinitionId;
  const primary = line.ingredient.ingredientId;
  if (line.candidates.length === 0) return primary;
  if (line.candidates.some((c) => c.lot.ingredientDefinitionId === primary)) return primary;
  return line.candidates[0]!.lot.ingredientDefinitionId;
}

export function scaleGrams(ingredient: RecipeIngredient, recipe: Recipe, servings: number): number {
  return round((ingredient.grams * servings) / recipe.servings, 1);
}

export function matchRecipe(
  recipe: Recipe,
  context: MatchContext,
  servings: number = recipe.servings,
): RecipeMatch {
  const lines = allocateLines(recipe, servings, context);
  const required = lines.filter((line) => !line.ingredient.optional);
  const shortLines = required.filter(
    (line) => line.status === "partial" || line.status === "missing",
  );
  const unconfirmedLines = required.filter((line) => line.status === "unknown");

  let readiness: RecipeReadiness;
  if (shortLines.length === 0) readiness = unconfirmedLines.length === 0 ? "ready" : "confirm";
  else if (shortLines.length <= 2 && required.some((line) => line.status !== "missing")) {
    readiness = "almost";
  } else readiness = "missing";

  const expiringUses: ExpiringUse[] = [];
  const expiringLotIds = new Set<string>();
  let urgency = 0;
  for (const line of lines) {
    for (const use of line.uses) {
      if (!isExpiringSoon(use.candidate.expiration)) continue;
      expiringUses.push({ line, use });
      if (!expiringLotIds.has(use.candidate.lot.id)) {
        expiringLotIds.add(use.candidate.lot.id);
        urgency += URGENCY_BY_STATUS[use.candidate.expiration] ?? 0;
      }
    }
  }

  return {
    recipe,
    servings,
    lines,
    shortLines,
    unconfirmedLines,
    readiness,
    urgency,
    expiringUses,
    expiringLotIds: [...expiringLotIds],
  };
}

const READINESS_ORDER: Record<RecipeReadiness, number> = {
  ready: 0,
  confirm: 1,
  almost: 2,
  missing: 3,
};

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

/** One deduction from a lot. Exactly one of grams / count is set. */
export interface CookingAllocation {
  ingredientKey: string;
  lotId: string;
  grams?: number;
  count?: number;
}

/**
 * Suggested deductions for cooking a matched recipe: exactly the allocation
 * behind its readiness. Weight lots are reduced in grams, unit lots in units.
 * Lots with an unknown amount are never deducted automatically.
 */
export function planCooking(match: RecipeMatch): CookingAllocation[] {
  const allocations: CookingAllocation[] = [];
  for (const line of match.lines) {
    for (const use of line.uses) {
      const base = { ingredientKey: line.ingredient.key, lotId: use.candidate.lot.id };
      allocations.push(
        use.candidate.measure === "weight"
          ? { ...base, grams: use.amount }
          : { ...base, count: use.amount },
      );
    }
  }
  return allocations;
}

export interface LineChoice {
  line: IngredientLineMatch;
  /** Requirement grams supplied by the chosen amounts; null when a chosen lot's grams are unknown. */
  grams: number | null;
  skipped: boolean;
  /** Grams less than the recipe asks for, beyond NEARLY_ENOUGH; 0 otherwise. */
  lessGrams: number;
}

/** Compare the amounts the user is about to deduct with what each line asks for. */
export function summarizeChoice(
  match: RecipeMatch,
  allocations: readonly CookingAllocation[],
): LineChoice[] {
  return match.lines.map((line) => {
    let grams: number | null = 0;
    let chosen = 0;
    for (const allocation of allocations) {
      if (allocation.ingredientKey !== line.ingredient.key) continue;
      const amount = allocation.grams ?? allocation.count ?? 0;
      if (amount <= 0) continue;
      chosen += 1;
      const candidate = line.candidates.find((c) => c.lot.id === allocation.lotId);
      if (!candidate || candidate.yieldPerUnit === null || grams === null) grams = null;
      else grams += amount * candidate.yieldPerUnit;
    }
    const rounded = grams === null ? null : round(grams, 1);
    const less =
      rounded !== null && rounded < line.neededGrams * NEARLY_ENOUGH
        ? round(line.neededGrams - rounded, 1)
        : 0;
    return { line, grams: rounded, skipped: chosen === 0, lessGrams: chosen === 0 ? 0 : less };
  });
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
