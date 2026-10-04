import { Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { CategoryIcon } from "@/components/CategoryIcon";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { newId } from "@/domain/common/ids";
import { searchIngredients } from "@/domain/ingredients/search";
import { isLotDepleted, getRemainingGrams } from "@/domain/inventory/lotOperations";
import { calculateNutritionForWeight, sumNutrition } from "@/domain/nutrition/calculate";
import { edibleGrams } from "@/domain/nutrition/inventoryNutrition";
import { formatNumber, formatWeight } from "@/lib/format";
import { calculateHeuristicScores } from "@/services/nutritionScore";
import { NutritionTotals } from "./NutritionTotals";
import { ScoreCard } from "./ScoreCard";

const DEFAULT_GRAMS = 100;

/**
 * V0.1 nutrition sandbox: combine foods from the inventory or the ingredient
 * library with weights and see deterministic totals. Nothing is persisted and
 * no inventory is consumed.
 */
export function NutritionPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { lots, definitions, definitionsById, sandbox, setSandbox } = useApp();
  const [query, setQuery] = useState("");

  const activeLots = useMemo(() => lots.filter((lot) => !isLotDepleted(lot)), [lots]);
  const libraryResults = useMemo(
    () => searchIngredients(definitions, query).slice(0, 40),
    [definitions, query],
  );

  const rows = useMemo(
    () =>
      sandbox.map((entry) => {
        const definition = definitionsById.get(entry.definitionId);
        const lot = entry.lotId ? lots.find((l) => l.id === entry.lotId) : undefined;
        const grams = lot && definition ? edibleGrams(entry.grams, lot, definition) : entry.grams;
        return {
          entry,
          definition,
          values: calculateNutritionForWeight(definition?.nutritionPer100g, Math.max(0, grams)),
        };
      }),
    [sandbox, definitionsById, lots],
  );
  const summary = useMemo(() => sumNutrition(rows.map((r) => r.values)), [rows]);
  const scores = useMemo(
    () =>
      calculateHeuristicScores(
        rows
          .filter((r) => r.definition)
          .map((r) => ({
            definitionId: r.definition!.id,
            category: r.definition!.category,
            grams: r.entry.grams,
          })),
        summary,
      ),
    [rows, summary],
  );

  function addEntry(definitionId: string, grams: number, lotId?: string) {
    setSandbox((entries) => [...entries, { id: newId(), definitionId, lotId, grams }]);
  }

  function updateGrams(id: string, text: string) {
    const grams = Number(text);
    setSandbox((entries) =>
      entries.map((e) =>
        e.id === id ? { ...e, grams: Number.isFinite(grams) && grams >= 0 ? grams : 0 } : e,
      ),
    );
  }

  return (
    <>
      <PageHeader title={t("nutrition.title")} description={t("nutrition.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Picker */}
        <Card className="gap-4 self-start">
          <CardContent>
            <Tabs defaultValue={activeLots.length > 0 ? "inventory" : "library"}>
              <TabsList className="w-full">
                <TabsTrigger value="inventory">{t("nutrition.fromInventory")}</TabsTrigger>
                <TabsTrigger value="library">{t("nutrition.fromLibrary")}</TabsTrigger>
              </TabsList>
              <TabsContent value="inventory" className="mt-3">
                {activeLots.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("nutrition.noInventory")}
                  </p>
                ) : (
                  <ScrollArea className="h-[420px] pr-3">
                    <ul className="flex flex-col gap-1">
                      {activeLots.map((lot) => {
                        const definition = definitionsById.get(lot.ingredientDefinitionId);
                        const remaining = getRemainingGrams(lot, definition);
                        return (
                          <li
                            key={lot.id}
                            className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/60"
                          >
                            <CategoryIcon
                              category={definition?.category ?? "other"}
                              className="size-8"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">
                                {nameOf(definition)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {remaining
                                  ? `${remaining.isEstimate ? "≈ " : ""}${formatWeight(remaining.grams, locale)}`
                                  : "—"}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                addEntry(
                                  lot.ingredientDefinitionId,
                                  Math.round(
                                    Math.min(remaining?.grams ?? DEFAULT_GRAMS, DEFAULT_GRAMS),
                                  ),
                                  lot.id,
                                )
                              }
                            >
                              <Plus />
                              {t("nutrition.addItem")}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollArea>
                )}
              </TabsContent>
              <TabsContent value="library" className="mt-3 flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("nutrition.searchPlaceholder")}
                    className="pl-9"
                  />
                </div>
                <ScrollArea className="h-[372px] pr-3">
                  <ul className="flex flex-col gap-1">
                    {libraryResults.map((definition) => (
                      <li
                        key={definition.id}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/60"
                      >
                        <CategoryIcon category={definition.category} className="size-8" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{nameOf(definition)}</div>
                          <div className="text-xs text-muted-foreground">
                            {definition.nutritionPer100g
                              ? `${formatNumber(definition.nutritionPer100g.kcal, locale, 0)} kcal / 100 g`
                              : t("ingredients.noNutrition")}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addEntry(definition.id, DEFAULT_GRAMS)}
                        >
                          <Plus />
                          {t("nutrition.addItem")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Selection and results */}
        <div className="flex flex-col gap-6">
          <Card className="gap-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("nutrition.itemsTitle")}</CardTitle>
              {sandbox.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSandbox([])}>
                  <Trash2 />
                  {t("nutrition.clear")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("nutrition.itemsEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {rows.map(({ entry, definition, values }) => (
                    <li key={entry.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{nameOf(definition)}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {entry.lotId ? t("nutrition.sourceLot") : t("nutrition.sourceLibrary")}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {values.kcal === null
                            ? t("nutrition.itemNoData")
                            : `${formatNumber(values.kcal, locale, 0)} kcal`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          className="tabular h-8 w-24 text-right"
                          value={entry.grams}
                          onChange={(e) => updateGrams(entry.id, e.target.value)}
                          aria-label={t("nutrition.grams")}
                        />
                        <span className="text-sm text-muted-foreground">g</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("common.remove")}
                        onClick={() => setSandbox((list) => list.filter((e) => e.id !== entry.id))}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {rows.length > 0 && (
            <>
              <NutritionTotals summary={summary} />
              <ScoreCard scores={scores} />
            </>
          )}
          <p className="text-xs text-muted-foreground">{t("nutrition.disclaimer")}</p>
        </div>
      </div>
    </>
  );
}
