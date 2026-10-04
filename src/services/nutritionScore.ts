/**
 * EXPERIMENTAL heuristic scores (1–10).
 *
 * These are rough, derived indicators meant to help compare meals at a glance.
 * They are NOT medical or dietary advice, use generic reference points rather
 * than personal targets, and are never stored — always recomputed from raw
 * nutrition data. Change the heuristics freely; nothing persists them.
 */
import type { FoodCategory } from "@/domain/ingredients/taxonomy";
import type { NutritionSummary } from "@/domain/nutrition/calculate";
import { isPartialTotal } from "@/domain/nutrition/calculate";

export type ScoreKey = "proteinShare" | "plantDiversity" | "fiberDensity" | "overall";

export interface HeuristicScore {
  key: ScoreKey;
  /** 1–10, or null when there is not enough data. */
  score: number | null;
  /** True when the inputs were incomplete (some nutrient values unknown). */
  partial: boolean;
  /** The measured quantity the score is based on, for display. */
  basis?: number;
}

export interface ScoredItem {
  definitionId: string;
  category: FoodCategory;
  grams: number;
}

/** Reference points (heuristics, not targets). */
const PROTEIN_SHARE_LOW = 0.05;
const PROTEIN_SHARE_HIGH = 0.2;
/** Roughly 14 g fibre per 1000 kcal is a commonly cited dietary-guideline reference. */
const FIBER_PER_1000_KCAL_REFERENCE = 14;
/** Minimum grams for a plant food to count towards diversity. */
const DIVERSITY_MIN_GRAMS = 20;
const PLANT_CATEGORIES: readonly FoodCategory[] = ["vegetable", "mushroom", "fruit"];

function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

/** Share of energy from protein: 5 % → 1, 20 % or more → 10. */
function proteinShareScore(summary: NutritionSummary): HeuristicScore {
  const protein = summary.totals.proteinG;
  const kcal = summary.totals.kcal;
  if (protein.amount === null || kcal.amount === null || kcal.amount <= 0) {
    return { key: "proteinShare", score: null, partial: false };
  }
  const share = (protein.amount * 4) / kcal.amount;
  const scaled = 1 + (9 * (share - PROTEIN_SHARE_LOW)) / (PROTEIN_SHARE_HIGH - PROTEIN_SHARE_LOW);
  return {
    key: "proteinShare",
    score: clampScore(scaled),
    partial: isPartialTotal(protein) || isPartialTotal(kcal),
    basis: share * 100,
  };
}

/** Number of distinct vegetables / mushrooms / fruits: 0 → 1 … 5+ → 10. */
function plantDiversityScore(items: readonly ScoredItem[]): HeuristicScore {
  if (items.length === 0) return { key: "plantDiversity", score: null, partial: false };
  const distinct = new Set(
    items
      .filter((i) => PLANT_CATEGORIES.includes(i.category) && i.grams >= DIVERSITY_MIN_GRAMS)
      .map((i) => i.definitionId),
  ).size;
  const table = [1, 3, 5, 7, 9, 10];
  return {
    key: "plantDiversity",
    score: table[Math.min(distinct, table.length - 1)]!,
    partial: false,
    basis: distinct,
  };
}

/** Fibre per 1000 kcal relative to the reference: 0 → 1, reference or more → 10. */
function fiberDensityScore(summary: NutritionSummary): HeuristicScore {
  const fiber = summary.totals.fiberG;
  const kcal = summary.totals.kcal;
  if (fiber.amount === null || kcal.amount === null || kcal.amount <= 0) {
    return { key: "fiberDensity", score: null, partial: false };
  }
  const per1000 = (fiber.amount / kcal.amount) * 1000;
  return {
    key: "fiberDensity",
    score: clampScore((10 * per1000) / FIBER_PER_1000_KCAL_REFERENCE),
    partial: isPartialTotal(fiber) || isPartialTotal(kcal),
    basis: per1000,
  };
}

export function calculateHeuristicScores(
  items: readonly ScoredItem[],
  summary: NutritionSummary,
): HeuristicScore[] {
  const components = [
    proteinShareScore(summary),
    plantDiversityScore(items),
    fiberDensityScore(summary),
  ];
  const known = components.filter((c) => c.score !== null);
  const overall: HeuristicScore =
    known.length === 0
      ? { key: "overall", score: null, partial: false }
      : {
          key: "overall",
          score: clampScore(known.reduce((sum, c) => sum + c.score!, 0) / known.length),
          partial: known.length < components.length || known.some((c) => c.partial),
        };
  return [...components, overall];
}
