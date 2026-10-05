import { describe, expect, it } from "vitest";
import { BUILTIN_INGREDIENTS } from "@/data/builtinIngredients";
import { consumeFromLot } from "../inventory/lotOperations";
import type { InventoryLot } from "../inventory/types";
import {
  matchRecipe,
  planCooking,
  summarizeChoice,
  type MatchContext,
  type RecipeMatch,
} from "./matching";
import type { Recipe, RecipeIngredient } from "./types";

/**
 * P0-B: one allocation decides readiness, explanations and the cooking plan.
 * The first group reproduces the counter-examples from the repository review.
 */

const definitionsById = new Map(BUILTIN_INGREDIENTS.map((d) => [d.id, d]));
const TODAY = "2026-10-04";

function lot(id: string, ingredientDefinitionId: string, extra: Partial<InventoryLot> = {}) {
  return {
    id,
    ingredientDefinitionId,
    processing: [],
    storage: "refrigerated",
    opened: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  } satisfies InventoryLot;
}

const ctx = (lots: InventoryLot[]): MatchContext => ({ lots, definitionsById, today: TODAY });

function recipe(ingredients: RecipeIngredient[], servings = 1): Recipe {
  return {
    id: "test_recipe",
    name: { zhCN: "测试" },
    servings,
    tags: [],
    ingredients,
    seasonings: [],
    steps: [],
    dataQuality: "user",
    isBuiltin: false,
  };
}

const line = (key: string, match: RecipeMatch) =>
  match.lines.find((l) => l.ingredient.key === key)!;

function plannedPerLot(match: RecipeMatch): Map<string, number> {
  const perLot = new Map<string, number>();
  for (const a of planCooking(match)) {
    perLot.set(a.lotId, (perLot.get(a.lotId) ?? 0) + (a.grams ?? a.count ?? 0));
  }
  return perLot;
}

describe("review counter-examples", () => {
  it("does not count 100 g of onion twice for two 80 g lines", () => {
    const onion = lot("onion", "onion_raw", { remainingWeightG: 100 });
    const match = matchRecipe(
      recipe([
        { key: "a", ingredientId: "onion_raw", grams: 80 },
        { key: "b", ingredientId: "onion_raw", grams: 80 },
      ]),
      ctx([onion]),
    );
    expect(match.readiness).not.toBe("ready");
    expect(match.lines.filter((l) => l.status === "enough")).toHaveLength(1);
    const short = match.lines.find((l) => l.status !== "enough")!;
    expect(short.status).toBe("partial");
    expect(short.suppliedGrams).toBe(20);
    expect(short.shortfallGrams).toBe(60);
    expect(short.reasons).toContain("shared");
    expect(plannedPerLot(match).get("onion")).toBe(100);
  });

  it("asks to confirm a bag without a weight instead of calling it ready with an empty plan", () => {
    const bag = lot("bag", "onion_raw", { count: 1, unit: "bag" });
    const match = matchRecipe(
      recipe([{ key: "onion", ingredientId: "onion_raw", grams: 100 }]),
      ctx([bag]),
    );
    expect(match.readiness).toBe("confirm");
    expect(line("onion", match)).toMatchObject({
      status: "unknown",
      amountUnknown: true,
      reasons: ["unknown_amount"],
      suppliedGrams: 0,
    });
    expect(planCooking(match)).toEqual([]);
  });
});

describe("unknown amounts", () => {
  const bag = lot("bag", "onion_raw", { count: 1, unit: "bag" });

  it("does not downgrade a line that known stock already covers", () => {
    const weighed = lot("weighed", "onion_raw", { remainingWeightG: 150 });
    const match = matchRecipe(
      recipe([{ key: "onion", ingredientId: "onion_raw", grams: 100 }]),
      ctx([bag, weighed]),
    );
    expect(match.readiness).toBe("ready");
    expect(line("onion", match).status).toBe("enough");
    expect(planCooking(match)).toEqual([{ ingredientKey: "onion", lotId: "weighed", grams: 100 }]);
  });

  it("asks to confirm when the gap could only be filled by the unknown lot", () => {
    const weighed = lot("weighed", "onion_raw", { remainingWeightG: 40 });
    const match = matchRecipe(
      recipe([{ key: "onion", ingredientId: "onion_raw", grams: 100 }]),
      ctx([bag, weighed]),
    );
    expect(match.readiness).toBe("confirm");
    expect(line("onion", match)).toMatchObject({ status: "unknown", suppliedGrams: 40 });
    expect(planCooking(match)).toEqual([{ ingredientKey: "onion", lotId: "weighed", grams: 40 }]);
  });

  it("treats a lot without any quantity as unknown, never as zero or enough", () => {
    const untracked = lot("untracked", "onion_raw");
    const match = matchRecipe(
      recipe([{ key: "onion", ingredientId: "onion_raw", grams: 100 }]),
      ctx([untracked]),
    );
    expect(line("onion", match).status).toBe("unknown");
    expect(line("onion", match).candidates[0]!.measure).toBe("none");
  });
});

describe("required and optional lines", () => {
  it("lets required lines allocate first even when the optional line is listed first", () => {
    const onion = lot("onion", "onion_raw", { remainingWeightG: 100 });
    const match = matchRecipe(
      recipe([
        { key: "garnish", ingredientId: "onion_raw", grams: 80, optional: true },
        { key: "main", ingredientId: "onion_raw", grams: 80 },
      ]),
      ctx([onion]),
    );
    expect(match.readiness).toBe("ready");
    expect(line("main", match)).toMatchObject({ status: "enough", suppliedGrams: 80 });
    expect(line("garnish", match)).toMatchObject({ status: "partial", suppliedGrams: 20 });
  });
});

describe("shared alternatives", () => {
  const either: RecipeIngredient = {
    key: "either",
    ingredientId: "chicken_thigh_skin_on_raw",
    alternatives: [{ ingredientId: "pork_loin_raw" }],
    grams: 200,
  };
  const chickenOnly: RecipeIngredient = {
    key: "chicken",
    ingredientId: "chicken_thigh_skin_on_raw",
    alternatives: [{ ingredientId: "chicken_breast_skinless_raw" }],
    grams: 200,
  };

  it("moves the flexible line to pork so the chicken-only line is not reported short", () => {
    const thigh = lot("thigh", "chicken_thigh_skin_on_raw", {
      remainingWeightG: 200,
      expirationDate: "2026-10-05",
    });
    const breast = lot("breast", "chicken_breast_skinless_raw", { remainingWeightG: 50 });
    const pork = lot("pork", "pork_loin_raw", { remainingWeightG: 200 });
    // Both lines have two candidates, so the flexible line goes first and grabs the thigh.
    const match = matchRecipe(recipe([either, chickenOnly]), ctx([thigh, breast, pork]));
    expect(match.readiness).toBe("ready");
    expect(match.lines.map((l) => l.status)).toEqual(["enough", "enough"]);
    const perLot = plannedPerLot(match);
    expect(perLot.get("thigh")).toBe(200);
    expect(perLot.get("breast")).toBe(50);
    expect(perLot.get("pork")).toBe(150);
  });

  it("serves the more constrained line first", () => {
    const thigh = lot("thigh", "chicken_thigh_skin_on_raw", { remainingWeightG: 200 });
    const pork = lot("pork", "pork_loin_raw", { remainingWeightG: 200 });
    const match = matchRecipe(
      recipe([either, { ...chickenOnly, alternatives: [] }]),
      ctx([thigh, pork]),
    );
    expect(match.readiness).toBe("ready");
    expect(planCooking(match)).toEqual([
      { ingredientKey: "either", lotId: "pork", grams: 200 },
      { ingredientKey: "chicken", lotId: "thigh", grams: 200 },
    ]);
  });

  it("is certain about a shortage when lines share one lot through different ratios", () => {
    const rawRice = lot("rice", "rice_white_raw", { remainingWeightG: 200 });
    const match = matchRecipe(
      recipe([
        {
          key: "cooked",
          ingredientId: "rice_cooked",
          alternatives: [{ ingredientId: "rice_white_raw", ratio: 0.45 }],
          grams: 300,
        },
        { key: "raw", ingredientId: "rice_white_raw", grams: 200 },
      ]),
      ctx([rawRice]),
    );
    // 300 g cooked needs 135 g raw; with the other 200 g that is 335 g of a 200 g bag.
    expect(match.readiness).toBe("almost");
    expect(match.unconfirmedLines).toEqual([]);
    expect(plannedPerLot(match).get("rice")).toBeLessThanOrEqual(200);
  });
});

describe("one quantity basis", () => {
  it("converts bone-in lots with the edible ratio and deducts purchased grams", () => {
    // 60 % of a wing is edible: 250 g edible needs about 417 g purchased.
    const wings = lot("wings", "chicken_wing_raw", { remainingWeightG: 500, boneIn: true });
    const match = matchRecipe(
      recipe([{ key: "chicken", ingredientId: "chicken_wing_raw", grams: 250 }]),
      ctx([wings]),
    );
    expect(match.readiness).toBe("ready");
    expect(line("chicken", match).availableGrams).toBe(300);
    expect(line("chicken", match).candidates[0]!.notes).toContainEqual({
      kind: "edible_ratio",
      ratio: 0.6,
    });
    const [deduction] = planCooking(match);
    expect(deduction!.grams).toBeCloseTo(416.6, 1);
  });

  it("does not treat bone-in stock as fully edible for the requirement", () => {
    const wings = lot("wings", "chicken_wing_raw", { remainingWeightG: 300, boneIn: true });
    const match = matchRecipe(
      recipe([{ key: "chicken", ingredientId: "chicken_wing_raw", grams: 250 }]),
      ctx([wings]),
    );
    expect(line("chicken", match)).toMatchObject({ status: "partial", availableGrams: 180 });
  });

  it("applies ratio, servings and unit estimates on the same basis", () => {
    const rawRice = lot("rice", "rice_white_raw", { remainingWeightG: 1000 });
    const eggs = lot("eggs", "egg_whole", { count: 6, unit: "piece" });
    const dish = recipe(
      [
        {
          key: "rice",
          ingredientId: "rice_cooked",
          alternatives: [{ ingredientId: "rice_white_raw", ratio: 0.45 }],
          grams: 200,
        },
        { key: "egg", ingredientId: "egg_whole", grams: 60 },
      ],
      1,
    );
    const match = matchRecipe(dish, ctx([rawRice, eggs]), 2);
    expect(line("rice", match).neededGrams).toBe(400);
    expect(line("egg", match).neededGrams).toBe(120);
    expect(line("egg", match).candidates[0]!.notes).toContainEqual({
      kind: "estimated_count",
      unit: "piece",
      gramsPerUnit: 50,
    });
    // 400 g cooked ≈ 180 g raw; 120 g of egg ≈ 2.4 eggs, rounded up to whole eggs.
    expect(planCooking(match)).toEqual([
      { ingredientKey: "rice", lotId: "rice", grams: 180 },
      { ingredientKey: "egg", lotId: "eggs", count: 3 },
    ]);
  });

  it("never rounds unit deductions past what is left across lines", () => {
    const eggs = lot("eggs", "egg_whole", { count: 3, unit: "piece" });
    const match = matchRecipe(
      recipe([
        { key: "a", ingredientId: "egg_whole", grams: 70 },
        { key: "b", ingredientId: "egg_whole", grams: 70 },
      ]),
      ctx([eggs]),
    );
    expect(plannedPerLot(match).get("eggs")).toBeLessThanOrEqual(3);
  });
});

describe("tolerance", () => {
  it("calls 240 g for a 250 g line nearly enough, shows the 10 g gap and plans only 240 g", () => {
    const beef = lot("beef", "beef_sirloin_raw", { remainingWeightG: 240 });
    const match = matchRecipe(
      recipe([{ key: "beef", ingredientId: "beef_sirloin_raw", grams: 250 }]),
      ctx([beef]),
    );
    expect(match.readiness).toBe("ready");
    expect(line("beef", match)).toMatchObject({
      status: "enough",
      reasons: ["nearly_enough"],
      shortfallGrams: 10,
    });
    expect(planCooking(match)).toEqual([{ ingredientKey: "beef", lotId: "beef", grams: 240 }]);
  });

  it("is short below the tolerance", () => {
    const beef = lot("beef", "beef_sirloin_raw", { remainingWeightG: 230 });
    const match = matchRecipe(
      recipe([{ key: "beef", ingredientId: "beef_sirloin_raw", grams: 250 }]),
      ctx([beef]),
    );
    expect(line("beef", match).status).toBe("partial");
  });
});

describe("form and state compatibility", () => {
  const steak: RecipeIngredient = {
    key: "beef",
    ingredientId: "beef_sirloin_raw",
    anySpecies: "beef",
    form: "steak",
    grams: 250,
  };

  it("does not offer minced beef for a steak", () => {
    const ground = lot("ground", "beef_ground_raw", { remainingWeightG: 500 });
    const match = matchRecipe(recipe([steak]), ctx([ground]));
    expect(line("beef", match)).toMatchObject({ status: "missing", candidates: [] });
    expect(line("beef", match).excluded).toEqual([
      expect.objectContaining({ reason: "form", lot: ground }),
    ]);
  });

  it("does not offer thin slices for a steak", () => {
    const slices = lot("slices", "beef_misuji_raw", { remainingWeightG: 300, form: "thin_slice" });
    expect(line("beef", matchRecipe(recipe([steak]), ctx([slices]))).status).toBe("missing");
  });

  it("uses a block for a steak with a note that it needs cutting", () => {
    const block = lot("block", "beef_misuji_raw", { remainingWeightG: 300, form: "block" });
    const match = matchRecipe(recipe([steak]), ctx([block]));
    expect(match.readiness).toBe("ready");
    expect(line("beef", match).candidates[0]!.notes).toContainEqual({
      kind: "form_differs",
      form: "steak",
    });
  });

  it("accepts sliced pork for a diced curry and komagire for thin slices", () => {
    const curry: RecipeIngredient = {
      key: "pork",
      ingredientId: "pork_shoulder_loin_raw",
      anySpecies: "pork",
      form: "diced",
      grams: 250,
    };
    const slices = lot("slices", "pork_belly_raw", { remainingWeightG: 300, form: "thin_slice" });
    expect(matchRecipe(recipe([curry]), ctx([slices])).readiness).toBe("ready");

    const komagire = lot("komagire", "pork_unspecified_raw", {
      remainingWeightG: 300,
      cut: "komagire",
    });
    const stirFry = { ...curry, form: "thin_slice" as const };
    expect(matchRecipe(recipe([stirFry]), ctx([komagire])).readiness).toBe("ready");
  });

  it("does not offer cooked meat as 'any cut', but keeps lots without a form", () => {
    const cooked = lot("cooked", "beef_misuji_raw", {
      remainingWeightG: 300,
      processing: ["cooked"],
    });
    const plain = lot("plain", "beef_round_raw", { remainingWeightG: 300 });
    const match = matchRecipe(recipe([steak]), ctx([cooked, plain]));
    expect(line("beef", match).candidates.map((c) => c.lot.id)).toEqual(["plain"]);
    expect(line("beef", match).excluded).toEqual([
      expect.objectContaining({ reason: "prepared", lot: cooked }),
    ]);
  });
});

describe("order and explanations", () => {
  it("allocates earliest expiration first, undated lots last, and ignores input order", () => {
    const undated = lot("undated", "onion_raw", { remainingWeightG: 100 });
    const later = lot("later", "onion_raw", {
      remainingWeightG: 100,
      expirationDate: "2026-10-20",
    });
    const sooner = lot("sooner", "onion_raw", {
      remainingWeightG: 100,
      expirationDate: "2026-10-05",
    });
    const dish = recipe([{ key: "onion", ingredientId: "onion_raw", grams: 150 }]);
    const forward = planCooking(matchRecipe(dish, ctx([undated, later, sooner])));
    const backward = planCooking(matchRecipe(dish, ctx([sooner, later, undated])));
    expect(forward).toEqual([
      { ingredientKey: "onion", lotId: "sooner", grams: 100 },
      { ingredientKey: "onion", lotId: "later", grams: 50 },
    ]);
    expect(backward).toEqual(forward);
  });

  it("breaks ties by stable lot ID", () => {
    const b = lot("b", "onion_raw", { remainingWeightG: 100 });
    const a = lot("a", "onion_raw", { remainingWeightG: 100 });
    const dish = recipe([{ key: "onion", ingredientId: "onion_raw", grams: 50 }]);
    expect(planCooking(matchRecipe(dish, ctx([b, a])))[0]!.lotId).toBe("a");
  });

  it("only cites expiring food that the allocation actually uses", () => {
    const expired = lot("expired", "onion_raw", {
      remainingWeightG: 500,
      expirationDate: "2026-10-03",
    });
    const expiring = lot("expiring", "onion_raw", {
      remainingWeightG: 100,
      expirationDate: "2026-10-05",
    });
    const plenty = lot("plenty", "onion_raw", {
      remainingWeightG: 500,
      expirationDate: "2026-10-04",
    });
    const dish = recipe([{ key: "onion", ingredientId: "onion_raw", grams: 50 }]);
    const match = matchRecipe(dish, ctx([expired, expiring, plenty]));
    // The lot expiring today is used first; the one expiring tomorrow is not touched.
    expect(match.expiringUses.map((u) => [u.use.candidate.lot.id, u.use.amount])).toEqual([
      ["plenty", 50],
    ]);
    expect(match.expiringLotIds).toEqual(["plenty"]);
  });
});

describe("summarizeChoice", () => {
  it("reports lines the user skips or uses less of", () => {
    const onion = lot("onion", "onion_raw", { remainingWeightG: 500 });
    const carrot = lot("carrot", "carrot_raw", { remainingWeightG: 500 });
    const match = matchRecipe(
      recipe([
        { key: "onion", ingredientId: "onion_raw", grams: 200 },
        { key: "carrot", ingredientId: "carrot_raw", grams: 100 },
      ]),
      ctx([onion, carrot]),
    );
    const choice = summarizeChoice(match, [{ ingredientKey: "onion", lotId: "onion", grams: 120 }]);
    expect(choice.map(({ grams, skipped, lessGrams }) => ({ grams, skipped, lessGrams }))).toEqual([
      { grams: 120, skipped: false, lessGrams: 80 },
      { grams: 0, skipped: true, lessGrams: 0 },
    ]);
  });
});

// --- Seeded property checks ----------------------------------------------------

/** Small deterministic PRNG (mulberry32) so failures can be replayed from the seed. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = ["onion_raw", "carrot_raw", "egg_whole", "chicken_thigh_skin_on_raw", "pork_loin_raw"];

function randomCase(seed: number) {
  const random = prng(seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const lots: InventoryLot[] = [];
  const lotCount = 1 + Math.floor(random() * 6);
  for (let i = 0; i < lotCount; i++) {
    const id = pick(POOL);
    const kind = random();
    const extra: Partial<InventoryLot> =
      kind < 0.6
        ? { remainingWeightG: Math.round(random() * 400) }
        : kind < 0.85
          ? { count: Math.floor(random() * 6), unit: "piece" }
          : { count: 1, unit: "bag" };
    if (random() < 0.5)
      extra.expirationDate = `2026-10-${String(4 + Math.floor(random() * 20)).padStart(2, "0")}`;
    if (random() < 0.2) extra.form = "whole";
    lots.push(lot(`lot-${seed}-${i}`, id, extra));
  }
  const lineCount = 1 + Math.floor(random() * 4);
  const ingredients: RecipeIngredient[] = [];
  for (let i = 0; i < lineCount; i++) {
    const primary = pick(POOL);
    const alternative = random() < 0.4 ? pick(POOL) : undefined;
    ingredients.push({
      key: `line-${i}`,
      ingredientId: primary,
      alternatives:
        alternative && alternative !== primary
          ? [{ ingredientId: alternative, ratio: random() < 0.5 ? 1 : 0.5 }]
          : undefined,
      grams: 20 + Math.round(random() * 300),
      optional: random() < 0.25,
    });
  }
  return { lots, dish: recipe(ingredients, 1 + Math.floor(random() * 3)) };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = prng(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const SEEDS = Array.from({ length: 300 }, (_, i) => 1000 + i);

/** Maximum flow from lines to lots (ratio 1, weights only): the most that any allocation can cover. */
function maxCoverable(needs: number[], usable: boolean[][], stock: number[]): number {
  const lineCount = needs.length;
  const size = lineCount + stock.length + 2;
  const source = size - 2;
  const sink = size - 1;
  const capacity = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  needs.forEach((need, i) => (capacity[source]![i] = need));
  stock.forEach((grams, j) => (capacity[lineCount + j]![sink] = grams));
  usable.forEach((row, i) =>
    row.forEach((ok, j) => {
      if (ok) capacity[i]![lineCount + j] = Infinity;
    }),
  );
  let flow = 0;
  for (;;) {
    const previous = new Array<number>(size).fill(-1);
    previous[source] = source;
    const queue = [source];
    while (queue.length > 0 && previous[sink] === -1) {
      const node = queue.shift()!;
      for (let next = 0; next < size; next++) {
        if (previous[next] === -1 && capacity[node]![next]! > 1e-9) {
          previous[next] = node;
          queue.push(next);
        }
      }
    }
    if (previous[sink] === -1) return flow;
    let push = Infinity;
    for (let v = sink; v !== source; v = previous[v]!) {
      push = Math.min(push, capacity[previous[v]!]![v]!);
    }
    for (let v = sink; v !== source; v = previous[v]!) {
      capacity[previous[v]!]![v]! -= push;
      capacity[v]![previous[v]!]! += push;
    }
    flow += push;
  }
}

const MEATS = [
  "chicken_thigh_skin_on_raw",
  "chicken_breast_skinless_raw",
  "pork_loin_raw",
  "pork_belly_raw",
];

describe("properties (fixed seeds)", () => {
  it.each(SEEDS)(
    "seed %i: never claims a certain shortage when a full allocation exists",
    (seed) => {
      const random = prng(seed);
      const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
      const lots = Array.from({ length: 1 + Math.floor(random() * 5) }, (_, i) =>
        lot(`m${i}`, pick(MEATS), { remainingWeightG: 50 + Math.round(random() * 250) }),
      );
      const ingredients: RecipeIngredient[] = Array.from(
        { length: 1 + Math.floor(random() * 4) },
        (_, i) => {
          const primary = pick(MEATS);
          const alternatives = MEATS.filter((m) => m !== primary && random() < 0.35).map(
            (ingredientId) => ({ ingredientId }),
          );
          return {
            key: `l${i}`,
            ingredientId: primary,
            alternatives,
            grams: 50 + Math.round(random() * 200),
          };
        },
      );
      const match = matchRecipe(recipe(ingredients), ctx(lots));
      const usable = ingredients.map((ingredient) =>
        lots.map(
          (l) =>
            l.ingredientDefinitionId === ingredient.ingredientId ||
            ingredient.alternatives!.some((a) => a.ingredientId === l.ingredientDefinitionId),
        ),
      );
      const needs = ingredients.map((i) => i.grams);
      const total = needs.reduce((a, b) => a + b, 0);
      const coverable = maxCoverable(
        needs,
        usable,
        lots.map((l) => l.remainingWeightG!),
      );
      if (coverable >= total - 1e-6) {
        expect(match.shortLines).toEqual([]);
      }
    },
  );

  it.each(SEEDS)(
    "seed %i: never plans more than a lot holds, and the plan can be applied",
    (seed) => {
      const { lots, dish } = randomCase(seed);
      const match = matchRecipe(dish, ctx(lots));
      for (const [lotId, amount] of plannedPerLot(match)) {
        const stocked = lots.find((l) => l.id === lotId)!;
        const remaining = stocked.remainingWeightG ?? stocked.count!;
        expect(amount).toBeLessThanOrEqual(remaining + 1e-9);
        const applied = consumeFromLot(
          stocked,
          stocked.remainingWeightG !== undefined ? { grams: amount } : { count: amount },
          { transactionId: "t", now: "2026-10-04T00:00:00.000Z" },
        );
        expect(applied.ok).toBe(true);
      }
    },
  );

  it.each(SEEDS)("seed %i: lot order does not change the result", (seed) => {
    const { lots, dish } = randomCase(seed);
    const a = matchRecipe(dish, ctx(lots));
    const b = matchRecipe(dish, ctx(shuffled(lots, seed)));
    expect(planCooking(b)).toEqual(planCooking(a));
    expect(b.lines.map((l) => l.status)).toEqual(a.lines.map((l) => l.status));
  });

  it.each(SEEDS)("seed %i: optional lines never change what required lines get", (seed) => {
    const { lots, dish } = randomCase(seed);
    const withOptional = matchRecipe(dish, ctx(lots));
    const requiredOnly = matchRecipe(
      { ...dish, ingredients: dish.ingredients.filter((i) => !i.optional) },
      ctx(lots),
    );
    const requiredPlan = (m: RecipeMatch) =>
      planCooking(m).filter(
        (a) => !dish.ingredients.find((i) => i.key === a.ingredientKey)!.optional,
      );
    expect(requiredPlan(withOptional)).toEqual(planCooking(requiredOnly));
  });

  it.each(SEEDS)("seed %i: unknown amounts never make a recipe ready or count as zero", (seed) => {
    const { lots, dish } = randomCase(seed);
    const match = matchRecipe(dish, ctx(lots));
    for (const l of match.lines) {
      if (l.amountUnknown && l.status !== "enough") expect(l.status).toBe("unknown");
      if (l.status === "enough")
        expect(l.suppliedGrams).toBeGreaterThanOrEqual(l.neededGrams * 0.95 - 0.5);
    }
    if (match.readiness === "ready") {
      for (const l of match.lines.filter((x) => !x.ingredient.optional)) {
        expect(l.status).toBe("enough");
      }
    }
  });
});
