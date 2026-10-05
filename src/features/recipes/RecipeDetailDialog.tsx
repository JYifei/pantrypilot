import { Clock, Copy, CookingPot, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SectionTitle } from "@/components/SectionTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localize } from "@/domain/common/localizedText";
import {
  estimateRecipeNutritionPerServing,
  matchRecipe,
  type IngredientLineMatch,
} from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";
import { formatNumber, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CookDialog } from "./CookDialog";
import { ReadinessBadge, StatusDot } from "./RecipeBadges";
import { useRecipeText } from "./useRecipeText";

const MAX_SERVINGS = 20;

function LineRow({
  line,
  recipe,
  servings,
}: {
  line: IngredientLineMatch;
  recipe: Recipe;
  servings: number;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { definitionsById } = useApp();
  const { stockText, lineNotes, lotUseLabel } = useRecipeText();
  const { ingredient } = line;
  const count =
    ingredient.count === undefined
      ? undefined
      : Math.round(((ingredient.count * servings) / recipe.servings) * 10) / 10;
  const alternatives = (ingredient.alternatives ?? [])
    .map((a) => nameOf(definitionsById.get(a.ingredientId)))
    .join(", ");
  const notes = lineNotes(line);

  return (
    <li className="flex items-start gap-3 py-2.5">
      <StatusDot status={line.status} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">
            {nameOf(definitionsById.get(ingredient.ingredientId))}
          </span>
          {ingredient.form && (
            <span className="text-xs text-muted-foreground">{t(`form.${ingredient.form}`)}</span>
          )}
          {ingredient.optional && (
            <Badge variant="outline" className="text-[10px]">
              {t("common.optional")}
            </Badge>
          )}
        </div>
        {(ingredient.anySpecies || alternatives) && (
          <div className="text-xs text-muted-foreground">
            {[
              ingredient.anySpecies
                ? t("recipes.anyCut", { species: t(`species.${ingredient.anySpecies}`) })
                : undefined,
              alternatives ? t("recipes.alternatives", { names: alternatives }) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        <div
          className={cn(
            "text-xs",
            line.status === "enough" ? "text-success" : "text-muted-foreground",
            (line.status === "partial" || line.status === "unknown") && "text-warning-foreground",
          )}
        >
          {stockText(line)}
        </div>
        {line.uses.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {t("recipes.usesLots", { items: line.uses.map(lotUseLabel).join(", ") })}
          </div>
        )}
        {notes.map((note) => (
          <div key={note} className="text-xs text-muted-foreground">
            {note}
          </div>
        ))}
      </div>
      <div className="tabular shrink-0 text-right text-sm">
        {formatWeight(line.neededGrams, locale)}
        {count !== undefined && (
          <div className="text-xs text-muted-foreground">
            ≈ {formatNumber(count, locale)} {t("unit.piece")}
          </div>
        )}
      </div>
    </li>
  );
}

export function RecipeDetailDialog({
  recipeId,
  onClose,
  onEdit,
  onOpenRecipe,
}: {
  recipeId: string;
  onClose: () => void;
  onEdit: (recipe: Recipe) => void;
  onOpenRecipe: (id: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { recipes, lots, definitionsById, today, services, reload } = useApp();
  const recipe = recipes.find((r) => r.id === recipeId);
  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [cooking, setCooking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const match = useMemo(
    () => (recipe ? matchRecipe(recipe, { lots, definitionsById, today }, servings) : null),
    [recipe, lots, definitionsById, today, servings],
  );
  const nutrition = useMemo(
    () => (recipe ? estimateRecipeNutritionPerServing(recipe, definitionsById) : null),
    [recipe, definitionsById],
  );

  if (!recipe || !match || !nutrition) return null;
  const canCook = match.lines.some((line) => line.candidates.length > 0);

  async function duplicate() {
    if (!recipe) return;
    const copy = await services.recipes.duplicate(recipe.id, t("recipes.copySuffix"));
    await reload();
    toast.success(t("recipes.toastDuplicated", { name: localize(copy.name, locale) }));
    onOpenRecipe(copy.id);
  }

  async function remove() {
    if (!recipe) return;
    const result = await services.recipes.deleteCustom(recipe.id);
    setConfirmDelete(false);
    if (!result.ok) {
      toast.error(t("common.error"));
      return;
    }
    await reload();
    toast.success(t("recipes.toastDeleted"));
    onClose();
  }

  const macro = (key: "kcal" | "proteinG" | "fatG" | "carbohydrateG", unit: string, digits = 1) => {
    const total = nutrition.totals[key];
    if (total.amount === null) return t("common.unknown");
    const partial = total.unknownCount > 0 ? "*" : "";
    return `${formatNumber(total.amount, locale, digits)} ${unit}${partial}`;
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0">
                <DialogTitle>{localize(recipe.name, locale)}</DialogTitle>
                <DialogDescription>
                  {recipe.description ? localize(recipe.description, locale) : null}
                </DialogDescription>
              </div>
              <ReadinessBadge match={match} />
            </div>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {recipe.timeMinutes !== undefined && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="size-4" />
                {t("recipes.minutes", { count: recipe.timeMinutes })}
              </span>
            )}
            <Badge variant="outline">
              {recipe.isBuiltin ? t("recipes.demoRecipe") : t("recipes.custom")}
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground">{t("recipes.servingsLabel")}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="-"
                disabled={servings <= 1}
                onClick={() => setServings((s) => Math.max(1, s - 1))}
              >
                <Minus />
              </Button>
              <span className="tabular w-6 text-center font-medium">{servings}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="+"
                disabled={servings >= MAX_SERVINGS}
                onClick={() => setServings((s) => Math.min(MAX_SERVINGS, s + 1))}
              >
                <Plus />
              </Button>
            </div>
          </div>

          <section>
            <SectionTitle>{t("recipes.ingredientsTitle")}</SectionTitle>
            <ul className="divide-y">
              {match.lines.map((line) => (
                <LineRow
                  key={line.ingredient.key}
                  line={line}
                  recipe={recipe}
                  servings={servings}
                />
              ))}
            </ul>
          </section>

          {recipe.seasonings.length > 0 && (
            <section>
              <SectionTitle>{t("recipes.seasoningsTitle")}</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {recipe.seasonings.map((s, i) => (
                  <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {localize(s, locale)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {recipe.steps.length > 0 && (
            <section>
              <SectionTitle>{t("recipes.stepsTitle")}</SectionTitle>
              <ol className="flex flex-col gap-2 text-sm">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {i + 1}
                    </span>
                    <span>{localize(step, locale)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="rounded-lg bg-muted/50 p-3">
            <div className="mb-2 text-sm font-medium">{t("recipes.nutritionTitle")}</div>
            <div className="tabular grid grid-cols-4 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{t("nutrient.kcal")}</div>
                {macro("kcal", "kcal", 0)}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("nutrient.proteinG")}</div>
                {macro("proteinG", "g")}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("nutrient.fatG")}</div>
                {macro("fatG", "g")}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("nutrient.carbohydrateG")}</div>
                {macro("carbohydrateG", "g")}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("recipes.nutritionNote")}</p>
          </section>

          <DialogFooter className="flex-wrap gap-2">
            {recipe.isBuiltin ? (
              <Button variant="outline" onClick={() => void duplicate()}>
                <Copy />
                {t("recipes.duplicate")}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                  {t("common.delete")}
                </Button>
                <Button variant="outline" onClick={() => onEdit(recipe)}>
                  <Pencil />
                  {t("common.edit")}
                </Button>
              </>
            )}
            <Button disabled={!canCook} onClick={() => setCooking(true)}>
              <CookingPot />
              {t("recipes.cook")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cooking && (
        <CookDialog
          match={match}
          onClose={() => setCooking(false)}
          onCooked={() => {
            setCooking(false);
            onClose();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={t("recipes.confirmDeleteTitle")}
        description={t("recipes.confirmDeleteBody", { name: localize(recipe.name, locale) })}
        confirmLabel={t("common.delete")}
        onConfirm={remove}
      />
    </>
  );
}
