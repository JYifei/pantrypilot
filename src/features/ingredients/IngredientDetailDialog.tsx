import { Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { CategoryIcon } from "@/components/CategoryIcon";
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
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { InventoryUnit } from "@/domain/ingredients/taxonomy";
import { NUTRIENTS } from "@/domain/nutrition/types";
import { formatNumber, formatNutrient } from "@/lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function IngredientDetailDialog({
  definition,
  onClose,
  onEdit,
  onDelete,
}: {
  definition: IngredientDefinition;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { sources } = useApp();
  const d = definition;
  const source = sources.find((s) => s.id === d.sourceId);
  const conversions = Object.entries(d.defaultUnitConversions ?? {}) as [
    InventoryUnit,
    { estimatedGrams: number; confidence: "low" | "medium" | "high" },
  ][];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CategoryIcon category={d.category} />
            <div className="min-w-0">
              <DialogTitle>{nameOf(d)}</DialogTitle>
              <DialogDescription>
                {[d.name.zhCN, d.name.enUS, d.name.jaJP].filter(Boolean).join(" · ")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{t(`category.${d.category}`)}</Badge>
          <Badge variant="outline">
            {d.isBuiltin ? t("ingredients.builtin") : t("ingredients.custom")}
          </Badge>
          {d.dataQuality === "demo" && (
            <Badge className="bg-warning/20 text-warning-foreground">{t("common.demoData")}</Badge>
          )}
        </div>

        {d.dataQuality === "demo" && d.nutritionPer100g && (
          <div className="flex gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning-foreground">
            <TriangleAlert className="size-4 shrink-0" />
            {t("ingredients.demoWarning")}
          </div>
        )}

        <section>
          <h4 className="mb-1 text-sm font-semibold">{t("ingredients.per100g")}</h4>
          {d.nutritionPer100g ? (
            <dl className="grid grid-cols-2 gap-x-6 divide-y text-sm">
              {NUTRIENTS.map((info) => {
                const value = d.nutritionPer100g![info.key];
                return (
                  <div key={info.key} className="flex justify-between py-1.5">
                    <dt>{t(`nutrient.${info.key}`)}</dt>
                    <dd className="tabular">
                      {value === undefined ? (
                        <span className="text-muted-foreground">{t("common.unknown")}</span>
                      ) : (
                        formatNutrient(value, info, locale)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t("ingredients.noNutrition")}</p>
          )}
        </section>

        <dl className="divide-y">
          {d.aliases.length > 0 && (
            <Row label={t("ingredients.detailAliases")}>{d.aliases.join(", ")}</Row>
          )}
          {d.animalSpecies && (
            <Row label={t("ingredients.detailSpecies")}>{t(`species.${d.animalSpecies}`)}</Row>
          )}
          {d.anatomicalCut && (
            <Row label={t("ingredients.detailCut")}>{t(`cut.${d.anatomicalCut}`)}</Row>
          )}
          {d.defaultEdibleRatio !== undefined && (
            <Row label={t("ingredients.detailEdibleRatio")}>
              {formatNumber(d.defaultEdibleRatio * 100, locale, 0)}%
            </Row>
          )}
          {d.defaultShelfLife && (
            <Row label={t("ingredients.detailShelfLife")}>
              {[
                d.defaultShelfLife.refrigeratedDays !== undefined
                  ? t("ingredients.refrigeratedDays", { days: d.defaultShelfLife.refrigeratedDays })
                  : undefined,
                d.defaultShelfLife.frozenDays !== undefined
                  ? t("ingredients.frozenDays", { days: d.defaultShelfLife.frozenDays })
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Row>
          )}
          {conversions.length > 0 && (
            <Row label={t("ingredients.detailConversions")}>
              {conversions.map(([unit, c]) => (
                <div key={unit}>
                  {t("ingredients.conversion", {
                    unit: t(`unit.${unit}`),
                    grams: formatNumber(c.estimatedGrams, locale, 2),
                    confidence: t(`confidence.${c.confidence}`),
                  })}
                </div>
              ))}
            </Row>
          )}
          {source && (
            <Row label={t("ingredients.detailSource")}>
              <div className="font-medium">{source.name}</div>
              {source.notes && <p className="mt-1 text-xs text-muted-foreground">{source.notes}</p>}
            </Row>
          )}
          <Row label={t("ingredients.detailId")}>
            <code className="text-xs">{d.id}</code>
          </Row>
        </dl>

        {!d.isBuiltin && (
          <DialogFooter>
            <Button variant="outline" onClick={onDelete}>
              <Trash2 />
              {t("common.delete")}
            </Button>
            <Button onClick={onEdit}>
              <Pencil />
              {t("common.edit")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
