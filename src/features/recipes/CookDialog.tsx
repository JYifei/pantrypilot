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
import { newId } from "@/domain/common/ids";
import { localize } from "@/domain/common/localizedText";
import {
  planCooking,
  summarizeChoice,
  type CandidateLot,
  type CookingAllocation,
  type LineChoice,
  type RecipeMatch,
} from "@/domain/recipes/matching";
import { formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRecipeText } from "./useRecipeText";

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
 * Confirm which lots a cooked recipe consumes. Defaults come from planCooking,
 * the same allocation the recipe's readiness is based on; every amount can be
 * changed or set to 0, and each line shows how the choice differs from the recipe.
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
  // One ID per dialog, so retrying after an error cannot deduct twice.
  const [operationId] = useState(newId);
  const { amountOf, lineNotes } = useRecipeText();

  const lotLabel = (candidate: CandidateLot) => {
    const lot = candidate.lot;
    return [
      nameOf(candidate.definition),
      lot.form ? t(`form.${lot.form}`) : undefined,
      candidate.remaining === null
        ? t("recipes.cookNoQuantity")
        : t("recipes.cookRemaining", { amount: amountOf(candidate, candidate.remaining) }),
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const allocations: CookingAllocation[] = [];
  let invalid = false;
  for (const line of match.lines) {
    for (const candidate of line.candidates) {
      if (candidate.measure === "none") continue;
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
        candidate.measure === "weight" ? { ...base, grams: value } : { ...base, count: value },
      );
    }
  }
  const choices = new Map(
    summarizeChoice(match, allocations).map((choice) => [choice.line.ingredient.key, choice]),
  );

  const choiceText = (choice: LineChoice | undefined) => {
    if (!choice || choice.line.candidates.length === 0) return null;
    if (choice.skipped) return t("recipes.cookChoiceSkipped");
    if (choice.grams === null) return t("recipes.cookChoiceUnknown");
    const total = t("recipes.cookChoiceTotal", { amount: formatWeight(choice.grams, locale) });
    return choice.lessGrams > 0
      ? `${total} · ${t("recipes.cookChoiceLess", { amount: formatWeight(choice.lessGrams, locale) })}`
      : total;
  };

  async function confirm() {
    setBusy(true);
    try {
      const result = await services.recipes.cook(match.recipe.id, allocations, operationId);
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
          {match.lines.map((line) => {
            const choice = choices.get(line.ingredient.key);
            const summary = choiceText(choice);
            return (
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
                {lineNotes(line).map((note) => (
                  <p key={note} className="mb-1 text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
                {line.candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("recipes.cookNoStock")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {line.candidates.map((candidate) => {
                      const key = amountKey(line.ingredient.key, candidate.lot.id);
                      const byWeight = candidate.measure === "weight";
                      const untracked = candidate.measure === "none";
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
                              disabled={untracked}
                              value={untracked ? "" : (amounts[key] ?? "")}
                              placeholder={untracked ? "–" : "0"}
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
                {summary && (
                  <p
                    className={cn(
                      "mt-2 text-xs text-muted-foreground",
                      (choice?.lessGrams ?? 0) > 0 && "text-warning-foreground",
                    )}
                  >
                    {summary}
                  </p>
                )}
              </section>
            );
          })}
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
