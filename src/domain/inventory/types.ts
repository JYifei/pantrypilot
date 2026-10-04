import type { IsoDate, IsoDateTime } from "../common/dates";
import type {
  InventoryUnit,
  MeatCut,
  ProcessingType,
  ProductForm,
  StorageType,
} from "../ingredients/taxonomy";

/**
 * One actual package or batch owned by the user, e.g.
 * "beef misuji, steak cut, 251 g, 35 mm thick, ¥940, refrigerated".
 *
 * A lot is tracked by weight (`remainingWeightG`), by count (`count` + `unit`),
 * or both (e.g. "salmon, 2 fillets, 190 g total").
 */
export interface InventoryLot {
  id: string;
  /** Nutritional identity. */
  ingredientDefinitionId: string;
  /**
   * Cut as labelled in the shop. Usually equal to the definition's cut, but may
   * differ when the definition is a fallback (e.g. "beef, unspecified cut").
   */
  cut?: MeatCut;
  form?: ProductForm;

  originalWeightG?: number;
  remainingWeightG?: number;

  count?: number;
  unit?: InventoryUnit;

  thicknessMm?: number;
  fatPercent?: number;

  boneIn?: boolean;
  skinOn?: boolean;

  processing: ProcessingType[];

  purchaseDate?: IsoDate;
  expirationDate?: IsoDate;

  storage: StorageType;
  opened: boolean;

  purchasePrice?: number;
  /** ISO 4217 code, e.g. "JPY". */
  currency?: string;

  brand?: string;
  /** Raw label text as typed or (in the future) recognised from a photo. */
  labelText?: string;
  notes?: string;

  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export const TRANSACTION_TYPES = ["add", "consume", "adjust", "discard"] as const;
export type InventoryTransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * A quantity change on a lot. `consume` events are the hook for a future
 * MealLog: a meal will reference the transactions that supplied its ingredients.
 *
 * Quantities are positive amounts for add / consume / discard, and signed
 * deltas for adjust.
 */
export interface InventoryTransaction {
  id: string;
  inventoryLotId: string;
  type: InventoryTransactionType;
  quantityG?: number;
  quantityCount?: number;
  createdAt: IsoDateTime;
  notes?: string;
  /** Set when the change came from cooking a recipe. */
  recipeId?: string;
}
