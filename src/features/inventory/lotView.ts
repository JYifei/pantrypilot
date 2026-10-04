import type { IsoDate } from "@/domain/common/dates";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import { getExpirationStatus, type ExpirationStatus } from "@/domain/inventory/expiration";
import { getRemainingGrams, isLotDepleted } from "@/domain/inventory/lotOperations";
import type { InventoryLot } from "@/domain/inventory/types";
import type { GramAmount } from "@/domain/inventory/units";

/** Derived, display-oriented facts about a lot. */
export interface LotView {
  lot: InventoryLot;
  definition: IngredientDefinition | undefined;
  status: ExpirationStatus;
  depleted: boolean;
  remaining: GramAmount | null;
}

export function buildLotView(
  lot: InventoryLot,
  definitionsById: ReadonlyMap<string, IngredientDefinition>,
  today: IsoDate,
): LotView {
  const definition = definitionsById.get(lot.ingredientDefinitionId);
  return {
    lot,
    definition,
    status: getExpirationStatus(lot.expirationDate, today),
    depleted: isLotDepleted(lot),
    remaining: getRemainingGrams(lot, definition),
  };
}
