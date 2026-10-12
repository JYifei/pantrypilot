import { CookingPot, ListChecks, Minus, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { SectionTitle } from "@/components/SectionTitle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localize } from "@/domain/common/localizedText";
import type { ConfirmItem, GapSource, ShoppingGap } from "@/domain/planning/shoppingList";
import {
  MAX_PLAN_SERVINGS,
  MAX_SHOPPING_TEXT_LENGTH,
  planItemId,
  type ShoppingItem,
} from "@/domain/planning/types";
import { matchRecipe } from "@/domain/recipes/matching";
import { LotFormDialog } from "@/features/inventory/LotFormDialog";
import { CookDialog } from "@/features/recipes/CookDialog";
import { ReadinessBadge } from "@/features/recipes/RecipeBadges";
import { formatNumber, formatWeight } from "@/lib/format";
import type { PlanResult } from "@/services/planService";
import { usePlan, type PlanRow } from "./usePlan";

/** Run a plan change, report a refused change, and refresh. */
function usePlanAction() {
  const { t } = useTranslation();
  const { reload } = useApp();
  return async (action: () => Promise<PlanResult | void>) => {
    try {
      const result = await action();
      if (result && !result.ok) toast.error(t(`plan.errors.${result.error}`));
      await reload();
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  };
}

const Checkbox = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <input
    type="checkbox"
    aria-label={label}
    className="mt-1 size-4 shrink-0 accent-primary"
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
  />
);

function DishRow({ row, onCook }: { row: PlanRow; onCook: (row: PlanRow) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { services } = useApp();
  const run = usePlanAction();
  const { entry, recipe, match } = row;
  const setServings = (servings: number) =>
    run(() => services.plan.setServings(entry.id, servings));
  const remove = () => run(() => services.plan.removeEntry(entry.id));

  if (!recipe || !match) {
    return (
      <li className="flex items-center justify-between gap-3 py-3">
        <span className="text-sm text-muted-foreground">{t("plan.recipeMissing")}</span>
        <Button size="sm" variant="ghost" onClick={() => void remove()}>
          <Trash2 />
          {t("plan.remove")}
        </Button>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium">{localize(recipe.name, locale)}</span>
        <ReadinessBadge match={match} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("recipes.servingsLabel")}</span>
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="-"
          disabled={entry.servings <= 1}
          onClick={() => void setServings(entry.servings - 1)}
        >
          <Minus />
        </Button>
        <span className="tabular w-6 text-center font-medium">{entry.servings}</span>
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="+"
          disabled={entry.servings >= MAX_PLAN_SERVINGS}
          onClick={() => void setServings(entry.servings + 1)}
        >
          <Plus />
        </Button>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => void remove()}>
            <Trash2 />
            {t("plan.remove")}
          </Button>
          <Button size="sm" onClick={() => onCook(row)}>
            <CookingPot />
            {t("plan.cook")}
          </Button>
        </div>
      </div>
    </li>
  );
}

function AddDish() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { recipes, planEntries, services } = useApp();
  const run = usePlanAction();
  const options = useMemo(() => {
    const planned = new Set(planEntries.map((e) => e.recipeId));
    return recipes
      .filter((r) => !planned.has(r.id))
      .map((r) => ({ recipe: r, name: localize(r.name, locale) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [recipes, planEntries, locale]);

  return (
    <Select
      value=""
      onValueChange={(id) => {
        const recipe = recipes.find((r) => r.id === id);
        if (recipe) void run(() => services.plan.addRecipe(recipe.id, recipe.servings));
      }}
    >
      <SelectTrigger className="w-full" aria-label={t("plan.addDish")}>
        <SelectValue placeholder={t("plan.addDish")} />
      </SelectTrigger>
      <SelectContent>
        {options.map(({ recipe, name }) => (
          <SelectItem key={recipe.id} value={recipe.id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SourceChoice({ source }: { source: GapSource }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { services, definitionsById, planEntries } = useApp();
  const run = usePlanAction();
  const chosen =
    planEntries.find((e) => e.id === source.entryId)?.choices[source.ingredientKey] ??
    source.options[0]!.ingredientId;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{t("plan.buyAs", { recipe: localize(source.recipe.name, locale) })}</span>
      <Select
        value={chosen}
        onValueChange={(id) =>
          void run(() => services.plan.setChoice(source.entryId, source.ingredientKey, id))
        }
      >
        <SelectTrigger size="sm" className="text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {source.options.map((option) => (
            <SelectItem key={option.ingredientId} value={option.ingredientId}>
              {nameOf(definitionsById.get(option.ingredientId))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function GapRow({
  gap,
  item,
  onEnterStock,
}: {
  gap: ShoppingGap;
  item: ShoppingItem | undefined;
  onEnterStock: (gap: ShoppingGap) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { services, definitionsById } = useApp();
  const run = usePlanAction();
  const name = nameOf(definitionsById.get(gap.ingredientId));
  const update = (patch: Parameters<typeof services.plan.updatePlanItem>[1]) =>
    run(() => services.plan.updatePlanItem(gap.ingredientId, patch));

  function commitAmount(text: string) {
    const trimmed = text.trim();
    if (trimmed === "" && item?.plannedGrams === undefined) return;
    if (trimmed !== "" && Number(trimmed) === item?.plannedGrams) return;
    void update({ plannedGrams: trimmed === "" ? null : Number(trimmed) });
  }

  function commitNote(text: string) {
    if (text.trim() === (item?.note ?? "")) return;
    void update({ note: text });
  }

  return (
    <li className="flex gap-3 py-3">
      <Checkbox
        checked={item?.bought ?? false}
        label={t("plan.bought", { name })}
        onChange={(bought) => void update({ bought })}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className={item?.bought ? "font-medium line-through opacity-60" : "font-medium"}>
            {name}
          </span>
          <span className="tabular text-sm font-medium">
            {t("plan.gap", { amount: formatWeight(gap.gapGrams, locale) })}
            {gap.approxPieces !== undefined && (
              <span className="ml-1 font-normal text-muted-foreground">
                {t("plan.approxPieces", { count: formatNumber(gap.approxPieces, locale) })}
              </span>
            )}
          </span>
        </div>
        <div className="tabular text-xs text-muted-foreground">
          {t("plan.gapBreakdown", {
            needed: formatWeight(gap.neededGrams, locale),
            stock: formatWeight(gap.inStockGrams, locale),
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("plan.fromRecipes", {
            names: gap.sources
              .map(
                (s) => `${localize(s.recipe.name, locale)} ${formatWeight(s.neededGrams, locale)}`,
              )
              .join(", "),
          })}
        </div>
        {gap.sources
          .filter((s) => s.options.length > 1)
          .map((s) => (
            <SourceChoice key={`${s.entryId}|${s.ingredientKey}`} source={s} />
          ))}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="h-8 w-24 text-right"
              aria-label={t("plan.plannedAmount")}
              placeholder={String(gap.gapGrams)}
              defaultValue={item?.plannedGrams ?? ""}
              onBlur={(e) => commitAmount(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">g</span>
          </div>
          <Input
            className="h-8 min-w-40 flex-1"
            maxLength={MAX_SHOPPING_TEXT_LENGTH}
            aria-label={t("plan.packNote")}
            placeholder={t("plan.packNotePlaceholder")}
            defaultValue={item?.note ?? ""}
            onBlur={(e) => commitNote(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => onEnterStock(gap)}>
            <PackagePlus />
            {t("plan.enterStock")}
          </Button>
        </div>
      </div>
    </li>
  );
}

function ConfirmRow({ item }: { item: ConfirmItem }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { definitionsById } = useApp();
  return (
    <li className="py-2.5">
      <div className="font-medium">{nameOf(definitionsById.get(item.ingredientId))}</div>
      <ul className="text-xs text-muted-foreground">
        {item.sources.map((s) => (
          <li key={`${s.entryId}|${s.ingredientKey}`}>
            {localize(s.recipe.name, locale)} · {formatWeight(s.neededGrams, locale)} ·{" "}
            {t(`plan.confirmReason.${s.reason}`)}
          </li>
        ))}
      </ul>
    </li>
  );
}

function ManualItems({ items }: { items: ShoppingItem[] }) {
  const { t } = useTranslation();
  const { services } = useApp();
  const run = usePlanAction();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  async function add() {
    await run(() => services.plan.addManualItem(label, note));
    setLabel("");
    setNote("");
  }

  return (
    <section>
      <SectionTitle>{t("plan.manualTitle")}</SectionTitle>
      {items.length > 0 && (
        <ul className="mb-3 divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2">
              <Checkbox
                checked={item.bought}
                label={t("plan.bought", { name: item.label })}
                onChange={(bought) =>
                  void run(() => services.plan.updateManualItem(item.id, { bought }))
                }
              />
              <div className="min-w-0 flex-1">
                <div className={item.bought ? "line-through opacity-60" : undefined}>
                  {item.label}
                </div>
                {item.note && <div className="text-xs text-muted-foreground">{item.note}</div>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t("common.delete")}
                onClick={() => void run(() => services.plan.removeItem(item.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          className="h-8 min-w-36 flex-1"
          maxLength={MAX_SHOPPING_TEXT_LENGTH}
          placeholder={t("plan.manualLabelPlaceholder")}
          aria-label={t("plan.manualLabelPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          className="h-8 min-w-36 flex-1"
          maxLength={MAX_SHOPPING_TEXT_LENGTH}
          placeholder={t("plan.manualNotePlaceholder")}
          aria-label={t("plan.manualNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" type="submit" disabled={label.trim() === ""}>
          <Plus />
          {t("plan.manualAdd")}
        </Button>
      </form>
    </section>
  );
}

/**
 * Meal plan and shopping list. Everything here is planning: the inventory only
 * changes when a dish is cooked or a purchase is entered through the add-food form.
 */
export function PlanPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { services, shoppingItems, lots, definitionsById, today } = useApp();
  const run = usePlanAction();
  const { rows, list } = usePlan();
  const [cooking, setCooking] = useState<PlanRow | null>(null);
  const [stocking, setStocking] = useState<ShoppingGap | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const itemsById = new Map(shoppingItems.map((i) => [i.id, i]));
  const manualItems = shoppingItems.filter((i) => i.source === "manual");
  const anyBought = shoppingItems.some((i) => i.bought);
  const cookMatch = useMemo(
    () =>
      cooking?.recipe
        ? matchRecipe(cooking.recipe, { lots, definitionsById, today }, cooking.entry.servings)
        : null,
    [cooking, lots, definitionsById, today],
  );

  const stockNotice = (gap: ShoppingGap, item?: ShoppingItem) =>
    [
      t("plan.enterStockNotice", {
        name: nameOf(definitionsById.get(gap.ingredientId)),
        amount: formatWeight(item?.plannedGrams ?? gap.gapGrams, locale),
      }),
      item?.note,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageHeader title={t("plan.title")} description={t("plan.description")} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="gap-3 p-4">
          <SectionTitle
            aside={
              rows.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
                  {t("plan.clearPlan")}
                </Button>
              )
            }
          >
            {t("plan.dishesTitle")}
          </SectionTitle>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("plan.empty")}</p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <DishRow key={row.entry.id} row={row} onCook={setCooking} />
              ))}
            </ul>
          )}
          <AddDish />
          <p className="text-xs text-muted-foreground">{t("plan.noDeductionHint")}</p>
        </Card>

        <Card className="gap-6 p-4">
          <section>
            <SectionTitle>{t("plan.gapsTitle")}</SectionTitle>
            {list.gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? t("plan.gapsNoPlan") : t("plan.gapsNone")}
              </p>
            ) : (
              <ul className="divide-y">
                {list.gaps.map((gap) => (
                  <GapRow
                    // Remount when the stored state is reset, so the inputs clear.
                    key={`${gap.ingredientId}|${itemsById.get(planItemId(gap.ingredientId))?.createdAt ?? ""}`}
                    gap={gap}
                    item={itemsById.get(planItemId(gap.ingredientId))}
                    onEnterStock={setStocking}
                  />
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t("plan.boughtHint")}</p>
          </section>

          {list.toConfirm.length > 0 && (
            <section>
              <SectionTitle>{t("plan.confirmTitle")}</SectionTitle>
              <p className="mb-1 text-xs text-muted-foreground">{t("plan.confirmHint")}</p>
              <ul className="divide-y">
                {list.toConfirm.map((item) => (
                  <ConfirmRow key={item.ingredientId} item={item} />
                ))}
              </ul>
            </section>
          )}

          {list.seasonings.length > 0 && (
            <section>
              <SectionTitle>{t("plan.seasoningsTitle")}</SectionTitle>
              <p className="mb-2 text-xs text-muted-foreground">{t("plan.seasoningsHint")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {list.seasonings.map((s) => (
                  <li
                    key={s.text.zhCN}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs"
                    title={s.recipes.map((r) => localize(r.name, locale)).join(", ")}
                  >
                    {localize(s.text, locale)}
                    {s.recipes.length > 1 && (
                      <span className="ml-1 text-muted-foreground">×{s.recipes.length}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ManualItems items={manualItems} />

          {anyBought && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void run(() => services.plan.clearBought())}
              >
                <ListChecks />
                {t("plan.clearBought")}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {cooking && cookMatch && (
        <CookDialog
          match={cookMatch}
          planEntryId={cooking.entry.id}
          onClose={() => setCooking(null)}
          onCooked={() => setCooking(null)}
        />
      )}

      <LotFormDialog
        open={stocking !== null}
        onOpenChange={(open) => !open && setStocking(null)}
        presetDefinitionId={stocking?.ingredientId}
        notice={
          stocking
            ? stockNotice(stocking, itemsById.get(planItemId(stocking.ingredientId)))
            : undefined
        }
        onSaved={async () => {
          if (!stocking) return;
          await run(() => services.plan.resetPlanItem(stocking.ingredientId));
        }}
      />

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("plan.clearPlanTitle")}
        description={t("plan.clearPlanBody")}
        confirmLabel={t("plan.clearPlan")}
        onConfirm={async () => {
          setConfirmClear(false);
          await run(() => services.plan.clearPlan());
        }}
      />
    </>
  );
}
