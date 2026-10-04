import { z } from "zod";
import { isValidIsoDate, type IsoDate } from "@/domain/common/dates";
import {
  INVENTORY_UNITS,
  MEAT_CUTS,
  PROCESSING_TYPES,
  PRODUCT_FORMS,
  STORAGE_TYPES,
  type InventoryUnit,
  type MeatCut,
  type ProductForm,
} from "@/domain/ingredients/taxonomy";
import type { InventoryLot } from "@/domain/inventory/types";
import type { LotInput } from "@/services/inventoryService";

/**
 * Form model for adding / editing an inventory lot. Numeric inputs are kept
 * as strings so that "empty" stays distinguishable from 0; conversion to the
 * domain model happens in `formValuesToLotInput`.
 * Validation messages are i18n keys.
 */

function parseOptionalNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function isEmpty(text: string): boolean {
  return text.trim() === "";
}

function isNumberText(text: string): boolean {
  return !isEmpty(text) && Number.isFinite(Number(text.trim()));
}

const optionalNonNegative = z
  .string()
  .refine((v) => isEmpty(v) || (isNumberText(v) && Number(v) >= 0), {
    message: "validation.nonNegativeNumber",
  });

const optionalDate = z
  .string()
  .refine((v) => isEmpty(v) || isValidIsoDate(v.trim()), { message: "validation.date" });

export const lotFormSchema = z
  .object({
    ingredientDefinitionId: z.string().min(1, { message: "validation.foodRequired" }),
    cut: z.union([z.enum(MEAT_CUTS), z.literal("")]),
    form: z.union([z.enum(PRODUCT_FORMS), z.literal("")]),
    quantityMode: z.enum(["weight", "count"]),
    weightG: z.string(),
    remainingWeightG: optionalNonNegative,
    count: z.string(),
    unit: z.union([z.enum(INVENTORY_UNITS), z.literal("")]),
    storage: z.enum(STORAGE_TYPES),
    purchaseDate: optionalDate,
    expirationDate: optionalDate,
    price: optionalNonNegative,
    currency: z.string(),
    thicknessMm: optionalNonNegative,
    fatPercent: z
      .string()
      .refine((v) => isEmpty(v) || (isNumberText(v) && Number(v) >= 0 && Number(v) <= 100), {
        message: "validation.percent",
      }),
    boneIn: z.boolean(),
    skinOn: z.boolean(),
    opened: z.boolean(),
    processing: z.array(z.enum(PROCESSING_TYPES)),
    brand: z.string(),
    labelText: z.string(),
    notes: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.quantityMode === "weight") {
      if (!isNumberText(values.weightG) || Number(values.weightG) <= 0) {
        ctx.addIssue({ code: "custom", path: ["weightG"], message: "validation.positiveNumber" });
      }
    } else {
      if (!isNumberText(values.count) || Number(values.count) < 0) {
        ctx.addIssue({ code: "custom", path: ["count"], message: "validation.nonNegativeNumber" });
      }
      if (values.unit === "") {
        ctx.addIssue({ code: "custom", path: ["unit"], message: "validation.unitRequired" });
      }
    }
  });

export type LotFormValues = z.infer<typeof lotFormSchema>;

export function emptyLotForm(defaults: { currency: string; today: IsoDate }): LotFormValues {
  return {
    ingredientDefinitionId: "",
    cut: "",
    form: "",
    quantityMode: "weight",
    weightG: "",
    remainingWeightG: "",
    count: "",
    unit: "piece",
    storage: "refrigerated",
    purchaseDate: defaults.today,
    expirationDate: "",
    price: "",
    currency: defaults.currency,
    thicknessMm: "",
    fatPercent: "",
    boneIn: false,
    skinOn: false,
    opened: false,
    processing: [],
    brand: "",
    labelText: "",
    notes: "",
  };
}

const str = (value: number | undefined) => (value === undefined ? "" : String(value));

export function lotToFormValues(lot: InventoryLot, defaultCurrency: string): LotFormValues {
  const byWeight = lot.remainingWeightG !== undefined || lot.count === undefined;
  return {
    ingredientDefinitionId: lot.ingredientDefinitionId,
    cut: lot.cut ?? "",
    form: lot.form ?? "",
    quantityMode: byWeight ? "weight" : "count",
    weightG: str(lot.originalWeightG ?? lot.remainingWeightG),
    remainingWeightG: str(lot.remainingWeightG),
    count: str(lot.count),
    unit: lot.unit ?? "piece",
    storage: lot.storage,
    purchaseDate: lot.purchaseDate ?? "",
    expirationDate: lot.expirationDate ?? "",
    price: str(lot.purchasePrice),
    currency: lot.currency ?? defaultCurrency,
    thicknessMm: str(lot.thicknessMm),
    fatPercent: str(lot.fatPercent),
    boneIn: lot.boneIn ?? false,
    skinOn: lot.skinOn ?? false,
    opened: lot.opened,
    processing: lot.processing,
    brand: lot.brand ?? "",
    labelText: lot.labelText ?? "",
    notes: lot.notes ?? "",
  };
}

function optionalText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Convert validated form values into a lot.
 * In "add" mode the remaining weight equals the purchased weight; in "edit"
 * mode an explicit remaining weight is kept (and never exceeds the original).
 */
export function formValuesToLotInput(values: LotFormValues, mode: "add" | "edit"): LotInput {
  const byWeight = values.quantityMode === "weight";
  const original = byWeight ? parseOptionalNumber(values.weightG) : undefined;
  let remaining = original;
  if (byWeight && mode === "edit") {
    const explicit = parseOptionalNumber(values.remainingWeightG);
    if (explicit !== undefined && original !== undefined) remaining = Math.min(explicit, original);
  }
  const price = parseOptionalNumber(values.price);
  return {
    ingredientDefinitionId: values.ingredientDefinitionId,
    cut: values.cut === "" ? undefined : (values.cut as MeatCut),
    form: values.form === "" ? undefined : (values.form as ProductForm),
    originalWeightG: original,
    remainingWeightG: remaining,
    count: byWeight ? undefined : parseOptionalNumber(values.count),
    unit: byWeight || values.unit === "" ? undefined : (values.unit as InventoryUnit),
    thicknessMm: parseOptionalNumber(values.thicknessMm),
    fatPercent: parseOptionalNumber(values.fatPercent),
    boneIn: values.boneIn ? true : undefined,
    skinOn: values.skinOn ? true : undefined,
    processing: values.processing,
    purchaseDate: optionalText(values.purchaseDate),
    expirationDate: optionalText(values.expirationDate),
    storage: values.storage,
    opened: values.opened,
    purchasePrice: price,
    currency: price === undefined ? undefined : values.currency,
    brand: optionalText(values.brand),
    labelText: optionalText(values.labelText),
    notes: optionalText(values.notes),
  };
}
