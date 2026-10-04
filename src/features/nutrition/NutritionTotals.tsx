import { useTranslation } from "react-i18next";
import { useLocale } from "@/app/appContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  isPartialTotal,
  macroEnergyShares,
  type NutrientTotal,
  type NutritionSummary,
} from "@/domain/nutrition/calculate";
import { getNutrientInfo, type NutrientKey } from "@/domain/nutrition/types";
import { formatNumber, nutrientUnitSymbol } from "@/lib/format";

const HEADLINE: NutrientKey[] = ["kcal", "proteinG", "fatG", "carbohydrateG", "fiberG"];
const MICRO: NutrientKey[] = [
  "sodiumMg",
  "potassiumMg",
  "calciumMg",
  "ironMg",
  "magnesiumMg",
  "vitaminAMcg",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminB12Mcg",
  "folateMcg",
];
const OTHER: NutrientKey[] = ["saturatedFatG", "sugarG"];

function TotalValue({ nutrient, total }: { nutrient: NutrientKey; total: NutrientTotal }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const info = getNutrientInfo(nutrient);
  if (total.amount === null) {
    return <span className="text-muted-foreground">{t("nutrition.unknownValue")}</span>;
  }
  const text = (
    <span className="tabular">
      {formatNumber(total.amount, locale, info.decimals)}
      <span className="ml-0.5 text-[0.75em] font-normal text-muted-foreground">
        {nutrientUnitSymbol(info.unit)}
      </span>
      {isPartialTotal(total) && <span className="text-warning">*</span>}
    </span>
  );
  if (!isPartialTotal(total)) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{text}</span>
      </TooltipTrigger>
      <TooltipContent>
        {t("nutrition.partialHint", {
          known: total.knownCount,
          total: total.knownCount + total.unknownCount,
        })}
      </TooltipContent>
    </Tooltip>
  );
}

/** Totals for the sandbox. Unknown values stay "unknown"; partial totals get an asterisk. */
export function NutritionTotals({ summary }: { summary: NutritionSummary }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const shares = macroEnergyShares({
    proteinG: summary.totals.proteinG.amount,
    fatG: summary.totals.fatG.amount,
    carbohydrateG: summary.totals.carbohydrateG.amount,
  });
  const hasPartial = Object.values(summary.totals).some(isPartialTotal);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("nutrition.totalsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {HEADLINE.map((key) => (
            <div key={key} className="rounded-xl bg-muted/60 p-3">
              <div className="text-xs text-muted-foreground">{t(`nutrient.${key}`)}</div>
              <div className="mt-1 text-xl font-semibold">
                <TotalValue nutrient={key} total={summary.totals[key]} />
              </div>
            </div>
          ))}
        </div>

        {shares && (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">{t("nutrition.energyShare")}</div>
            <div className="flex h-2.5 overflow-hidden rounded-full">
              <div className="bg-rose-400" style={{ width: `${shares.protein * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${shares.fat * 100}%` }} />
              <div className="bg-sky-400" style={{ width: `${shares.carbohydrate * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {(
                [
                  ["proteinG", shares.protein, "bg-rose-400"],
                  ["fatG", shares.fat, "bg-amber-400"],
                  ["carbohydrateG", shares.carbohydrate, "bg-sky-400"],
                ] as const
              ).map(([key, share, color]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${color}`} />
                  {t(`nutrient.${key}`)} {formatNumber(share * 100, locale, 0)}%
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {t("nutrition.microTitle")}
            </div>
            <dl className="divide-y text-sm">
              {MICRO.map((key) => (
                <div key={key} className="flex justify-between py-1.5">
                  <dt>{t(`nutrient.${key}`)}</dt>
                  <dd>
                    <TotalValue nutrient={key} total={summary.totals[key]} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {t("nutrition.otherTitle")}
            </div>
            <dl className="divide-y text-sm">
              {OTHER.map((key) => (
                <div key={key} className="flex justify-between py-1.5">
                  <dt>{t(`nutrient.${key}`)}</dt>
                  <dd>
                    <TotalValue nutrient={key} total={summary.totals[key]} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {hasPartial && (
          <p className="text-xs text-muted-foreground">{t("nutrition.partialLegend")}</p>
        )}
      </CardContent>
    </Card>
  );
}
