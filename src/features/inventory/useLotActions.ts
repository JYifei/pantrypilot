import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useLocale } from "@/app/appContext";
import type { StorageType } from "@/domain/ingredients/taxonomy";
import type { OperationResult, QuantityRequest } from "@/domain/inventory/lotOperations";
import type { InventoryLot } from "@/domain/inventory/types";
import { formatDate, formatNumber, formatWeight } from "@/lib/format";

/**
 * Inventory actions with user feedback (toasts) and data reload.
 * Returns false when an operation was rejected by the domain rules.
 */
export function useLotActions() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { services, reload, today } = useApp();
  const inventory = services.inventory;

  const run = useCallback(
    async <T>(action: () => Promise<T>, onSuccess?: (value: T) => void): Promise<T | undefined> => {
      try {
        const value = await action();
        await reload();
        onSuccess?.(value);
        return value;
      } catch (error) {
        console.error(error);
        toast.error(t("common.error"), { description: String(error) });
        return undefined;
      }
    },
    [reload, t],
  );

  const describeRemaining = useCallback(
    (lot: InventoryLot) =>
      lot.remainingWeightG !== undefined
        ? formatWeight(lot.remainingWeightG, locale)
        : `${formatNumber(lot.count ?? 0, locale)} ${lot.unit ? t(`unit.${lot.unit}`) : ""}`,
    [locale, t],
  );

  const handleResult = useCallback(
    (result: OperationResult | undefined, message: (lot: InventoryLot) => string): boolean => {
      if (!result) return false;
      if (!result.ok) {
        toast.error(t(`inventory.errors.${result.error}`));
        return false;
      }
      toast.success(message(result.lot));
      return true;
    },
    [t],
  );

  return {
    consume: async (id: string, request: QuantityRequest) =>
      handleResult(await run(() => inventory.consume(id, request)), (lot) =>
        t("inventory.toastConsumed", { remaining: describeRemaining(lot) }),
      ),
    adjust: async (id: string, target: { remainingWeightG?: number; count?: number }) =>
      handleResult(await run(() => inventory.adjust(id, target)), () =>
        t("inventory.toastAdjusted"),
      ),
    discard: async (id: string) =>
      handleResult(await run(() => inventory.discard(id)), () => t("inventory.toastDiscarded")),
    setOpened: (id: string, opened: boolean) =>
      run(
        () => inventory.setOpened(id, opened),
        () => toast.success(t("inventory.toastUpdated")),
      ),
    setStorage: (id: string, storage: StorageType) =>
      run(
        () => inventory.setStorage(id, storage),
        (lot) =>
          toast.success(
            storage === "frozen" && lot.expirationDate
              ? t("inventory.toastFrozen", { date: formatDate(lot.expirationDate, locale, today) })
              : t("inventory.toastStorage", { storage: t(`storage.${storage}`) }),
          ),
      ),
    remove: (id: string) =>
      run(
        () => inventory.deleteLot(id),
        () => toast.success(t("inventory.toastDeleted")),
      ),
  };
}
