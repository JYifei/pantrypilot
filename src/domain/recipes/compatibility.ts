import type { IngredientDefinition } from "../ingredients/types";
import type { ProductForm } from "../ingredients/taxonomy";
import type { InventoryLot } from "../inventory/types";

/**
 * Which stocked forms can stand in for the form a recipe line suggests.
 *
 * Forms are grouped by what you can still do with them in a home kitchen: a
 * piece (block, steak, fillet, whole) can be sliced, diced or minced; slices
 * can be used in a diced dish or minced but never become a steak; minced meat
 * stays minced. Forms outside these groups (prepared, other) and lots without
 * a recorded form are not judged.
 */
type FormGroup = "piece" | "slice" | "diced" | "ground";

const FORM_GROUP: Partial<Record<ProductForm, FormGroup>> = {
  whole: "piece",
  block: "piece",
  steak: "piece",
  thick_slice: "piece",
  fillet: "piece",
  thin_slice: "slice",
  yakiniku_slice: "slice",
  shabu_shabu_slice: "slice",
  sukiyaki_slice: "slice",
  shogayaki_slice: "slice",
  strip: "slice",
  diced: "diced",
  ground: "ground",
  minced: "ground",
};

/** For each requested group, the stocked groups that can be used. */
const USABLE: Record<FormGroup, readonly FormGroup[]> = {
  piece: ["piece"],
  slice: ["slice", "piece"],
  diced: ["diced", "piece", "slice"],
  ground: ["ground", "piece", "slice", "diced"],
};

function stockedGroup(
  lot: Pick<InventoryLot, "form" | "cut">,
  definition: Pick<IngredientDefinition, "anatomicalCut"> | undefined,
): FormGroup | undefined {
  if (lot.form) return FORM_GROUP[lot.form];
  const cut = lot.cut ?? definition?.anatomicalCut;
  if (cut === "ground") return "ground";
  if (cut === "komagire" || cut === "kiriotoshi") return "slice";
  return undefined;
}

/**
 * - `same`: the lot has the suggested form, or nothing can be judged.
 * - `differs`: usable after cutting, or as a common stand-in (slices in a curry).
 * - `incompatible`: cannot be turned into the suggested form (minced meat for a steak).
 */
export type FormFit = "same" | "differs" | "incompatible";

export function checkFormFit(
  wanted: ProductForm | undefined,
  lot: Pick<InventoryLot, "form" | "cut">,
  definition: Pick<IngredientDefinition, "anatomicalCut"> | undefined,
): FormFit {
  if (!wanted) return "same";
  const wantedGroup = FORM_GROUP[wanted];
  const group = stockedGroup(lot, definition);
  if (!wantedGroup || !group) return "same";
  if (!USABLE[wantedGroup].includes(group)) return "incompatible";
  return lot.form === wanted ? "same" : "differs";
}

/** Already cooked or smoked: not a raw cut, whatever its definition says. */
export function isPreparedLot(lot: Pick<InventoryLot, "processing">): boolean {
  return lot.processing.includes("cooked") || lot.processing.includes("smoked");
}
