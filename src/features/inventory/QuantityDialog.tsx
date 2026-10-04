import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIngredientName, useLocale } from "@/app/appContext";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { tracksCount, tracksWeight } from "@/domain/inventory/lotOperations";
import { formatNumber, formatWeight } from "@/lib/format";
import type { LotView } from "./lotView";
import { useLotActions } from "./useLotActions";

export type QuantityDialogMode = "consume" | "adjust";

function parse(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Consume part of a lot, or set its remaining quantity directly. */
export function QuantityDialog({
  view,
  mode,
  onClose,
}: {
  view: LotView;
  mode: QuantityDialogMode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const actions = useLotActions();
  const { lot } = view;
  const byWeight = tracksWeight(lot);
  const byCount = tracksCount(lot);

  const [grams, setGrams] = useState(
    mode === "adjust" && byWeight ? String(lot.remainingWeightG) : "",
  );
  const [count, setCount] = useState(mode === "adjust" && byCount ? String(lot.count) : "");
  const [busy, setBusy] = useState(false);

  const remainingText = byWeight
    ? formatWeight(lot.remainingWeightG!, locale)
    : `${formatNumber(lot.count ?? 0, locale)} ${lot.unit ? t(`unit.${lot.unit}`) : ""}`;

  const gramsValue = parse(grams);
  const afterGrams =
    mode === "consume" && byWeight && gramsValue !== undefined && !Number.isNaN(gramsValue)
      ? lot.remainingWeightG! - gramsValue
      : undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const gramsInput = byWeight ? parse(grams) : undefined;
    const countInput = byCount ? parse(count) : undefined;
    const ok =
      mode === "consume"
        ? await actions.consume(lot.id, { grams: gramsInput, count: countInput })
        : await actions.adjust(lot.id, { remainingWeightG: gramsInput, count: countInput });
    setBusy(false);
    if (ok) onClose();
  }

  const name = nameOf(view.definition);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "consume" ? t("consume.title", { name }) : t("consume.adjustTitle", { name })}
          </DialogTitle>
          <DialogDescription>
            {t("consume.remainingNow", { amount: remainingText })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {byWeight && (
            <FormField
              label={mode === "consume" ? t("consume.grams") : t("consume.newRemainingWeight")}
              htmlFor="qty-grams"
              hint={
                afterGrams !== undefined && afterGrams >= 0
                  ? t("consume.after", { amount: formatWeight(afterGrams, locale) })
                  : afterGrams !== undefined
                    ? undefined
                    : null
              }
              error={
                afterGrams !== undefined && afterGrams < 0
                  ? "inventory.errors.exceeds_remaining"
                  : undefined
              }
            >
              <Input
                id="qty-grams"
                autoFocus
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
              {mode === "consume" && (
                <div className="flex gap-2">
                  {(
                    [
                      ["quarter", 0.25],
                      ["half", 0.5],
                      ["all", 1],
                    ] as const
                  ).map(([key, fraction]) => (
                    <Button
                      key={key}
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() =>
                        setGrams(String(Math.round(lot.remainingWeightG! * fraction * 10) / 10))
                      }
                    >
                      {t(`consume.${key}`)}
                    </Button>
                  ))}
                </div>
              )}
            </FormField>
          )}
          {byCount && (
            <FormField
              label={mode === "consume" ? t("consume.count") : t("consume.newCount")}
              htmlFor="qty-count"
            >
              <Input
                id="qty-count"
                autoFocus={!byWeight}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {mode === "consume" ? t("consume.submit") : t("consume.submitAdjust")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
