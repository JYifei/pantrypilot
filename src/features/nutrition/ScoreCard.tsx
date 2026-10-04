import { FlaskConical } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/app/appContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HeuristicScore } from "@/services/nutritionScore";

function basisText(
  score: HeuristicScore,
  t: TFunction,
  locale: Parameters<typeof formatNumber>[1],
): string | undefined {
  if (score.basis === undefined) return undefined;
  switch (score.key) {
    case "proteinShare":
      return t("scores.basisProtein", { value: formatNumber(score.basis, locale, 0) });
    case "plantDiversity":
      return t("scores.basisDiversity", { value: score.basis });
    case "fiberDensity":
      return t("scores.basisFiber", { value: formatNumber(score.basis, locale, 1) });
    default:
      return undefined;
  }
}

/** Experimental, clearly labelled heuristic scores. Derived on the fly, never stored. */
export function ScoreCard({ scores }: { scores: HeuristicScore[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-muted-foreground" />
          {t("scores.title")}
        </CardTitle>
        <CardDescription>{t("scores.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {scores.map((score) => (
          <div key={score.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className={cn(score.key === "overall" && "font-medium")}>
                {t(`scores.${score.key}`)}
              </span>
              <span className="tabular font-semibold">
                {score.score === null ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("scores.notEnoughData")}
                  </span>
                ) : (
                  <>
                    {score.score}
                    <span className="text-xs font-normal text-muted-foreground"> / 10</span>
                  </>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${((score.score ?? 0) / 10) * 100}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {[basisText(score, t, locale), score.partial ? t("scores.partial") : undefined]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
