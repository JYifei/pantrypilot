import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { ExpirationBadge } from "@/components/ExpirationBadge";
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
import { localize } from "@/domain/common/localizedText";
import { tracksWeight } from "@/domain/inventory/lotOperations";
import {
  planCooking,
  type CandidateLot,
  type CookingAllocation,
  type RecipeMatch,
} from "@/domain/recipes/matching";
import { formatNumber, formatWeight } from "@/lib/format";

const amountKey = (ingredientKey: string, lotId: string) => `${ingredientKey}|${lotId}`;

function initialAmounts(match: RecipeMatch): Record<string, string> {
  const amounts: Record<string, string> = {};
  for (const allocation of planCooking(match)) {
    amounts[amountKey(allocation.ingredientKey, allocation.lotId)] = String(
      allocation.grams ?? allocation.count ?? 0,
    );
  }
  return amounts;
}

/**
 * Confirm which lots a cooked recipe consumes. Defaults come from planCooking
 * (earliest expiration first); every amount can be changed or set to 0.
 */
export function CookDialog({
  match,
  onClose,
  onCooked,
}: {
  match: RecipeMatch;
  onClose: () => void;
  onCooked: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { services, reload, today, definitionsById } = useApp();
  const [amounts, setAmounts] = useState(() => initialAmounts(match));
  const [busy, setBusy] = useState(false);

  const lotLabel = (candidate: CandidateLot) => {
    const lot = candidate.lot;
    const remaining = tracksWeight(lot)
      ? formatWeight(lot.remainingWeightG!, locale)
      : `${formatNumber(lot.count ?? 0, locale)} ${lot.unit ? t(`unit.${lot.unit}`) : ""}`;
    return [
      nameOf(candidate.definition),
      lot.form ? t(`form.${lot.form}`) : undefined,
      t("recipes.cookRemaining", { amount: remaining }),
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const allocations: CookingAllocation[] = [];
  let invalid = false;
  for (const line of match.lines) {
    for (const candidate of line.candidates) {
      const raw = amounts[amountKey(line.ingredient.key, candidate.lot.id)] ?? "";
      if (raw.trim() === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        invalid = true;
        continue;
      }
      if (value === 0) continue;
      const base = { ingredientKey: line.ingredient.key, lotId: candidate.lot.id };
      allocations.push(
        tracksWeight(candidate.lot) ? { ...base, grams: value } : { ...base, count: value },
      );
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const result = await services.recipes.cook(match.recipe.id, allocations);
      if (!result.ok) {
        const lotName =
          "lotId" in result
            ? nameOf(
                definitionsById.get(
                  match.lines.flatMap((l) => l.candidates).find((c) => c.lot.id === result.lotId)
                    ?.lot.ingredientDefinitionId ?? "",
                ),
              )
            : "";
        toast.error(t(`recipes.cookErrors.${result.error}`, { name: lotName }));
        return;
      }
      await reload();
      toast.success(t("recipes.cookDone", { count: result.transactionCount }));
      onCooked();
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("recipes.cookTitle", { name: localize(match.recipe.name, locale) })}
          </DialogTitle>
          <DialogDescription>
            {t("recipes.cookDescription", { count: match.servings })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {match.lines.map((line) => (
            <section key={line.ingredient.key} className="rounded-lg border p-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {nameOf(definitionsById.get(line.ingredient.ingredientId))}
                  {line.ingredient.optional && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t("common.optional")}
                    </span>
                  )}
                </span>
                <span className="tabular text-sm text-muted-foreground">
                  {t("recipes.cookNeed", { amount: formatWeight(line.neededGrams, locale) })}
                </span>
              </div>
              {line.candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("recipes.cookNoStock")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {line.candidates.map((candidate) => {
                    const key = amountKey(line.ingredient.key, candidate.lot.id);
                    const byWeight = tracksWeight(candidate.lot);
                    return (
                      <li key={candidate.lot.id} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{lotLabel(candidate)}</div>
                          <ExpirationBadge
                            expirationDate={candidate.lot.expirationDate}
                            today={today}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            aria-label={lotLabel(candidate)}
                            className="w-24 text-right"
                            value={amounts[key] ?? ""}
                            placeholder="0"
                            onChange={(e) =>
                              setAmounts((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                          <span className="w-8 text-sm text-muted-foreground">
                            {byWeight
                              ? "g"
                              : candidate.lot.unit
                                ? t(`unit.${candidate.lot.unit}`)
                                : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy || invalid || allocations.length === 0}
            onClick={() => void confirm()}
          >
            {t("recipes.cookConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
