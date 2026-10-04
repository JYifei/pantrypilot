import {
  AlarmClock,
  ArrowRight,
  Package,
  Plus,
  Refrigerator,
  Salad,
  Scale,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EmptyState } from "@/components/EmptyState";
import { ExpirationBadge } from "@/components/ExpirationBadge";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compareByExpiration, isExpiringSoon } from "@/domain/inventory/expiration";
import { LotFormDialog } from "@/features/inventory/LotFormDialog";
import { buildLotView } from "@/features/inventory/lotView";
import { formatNumber, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRIORITY_LIMIT = 5;

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "warning" | "danger";
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon
          className={cn(
            "size-4",
            tone === "warning" && "text-warning",
            tone === "danger" && "text-destructive",
          )}
        />
        {label}
      </div>
      <div className="tabular mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { lots, definitionsById, today, navigate } = useApp();
  const [addOpen, setAddOpen] = useState(false);

  const stats = useMemo(() => {
    const active = lots
      .map((lot) => buildLotView(lot, definitionsById, today))
      .filter((v) => !v.depleted);
    const totalGrams = active.reduce((sum, v) => sum + (v.remaining?.grams ?? 0), 0);
    return {
      active,
      expiringSoon: active.filter((v) => isExpiringSoon(v.status)).length,
      expired: active.filter((v) => v.status === "expired").length,
      totalGrams,
      priority: active
        .filter((v) => v.status !== "unknown")
        .sort((a, b) => compareByExpiration(a.lot, b.lot))
        .slice(0, PRIORITY_LIMIT),
    };
  }, [lots, definitionsById, today]);

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />

      {lots.length === 0 ? (
        <EmptyState
          icon={Refrigerator}
          title={t("dashboard.emptyTitle")}
          description={t("dashboard.emptyBody")}
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus />
              {t("dashboard.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Package}
              label={t("dashboard.activeLots")}
              value={formatNumber(stats.active.length, locale)}
              hint={t("dashboard.activeLotsHint")}
            />
            <StatCard
              icon={AlarmClock}
              label={t("dashboard.expiringSoon")}
              value={formatNumber(stats.expiringSoon, locale)}
              hint={t("dashboard.expiringSoonHint")}
              tone={stats.expiringSoon > 0 ? "warning" : undefined}
            />
            <StatCard
              icon={TriangleAlert}
              label={t("dashboard.expired")}
              value={formatNumber(stats.expired, locale)}
              hint={t("dashboard.expiredHint")}
              tone={stats.expired > 0 ? "danger" : undefined}
            />
            <StatCard
              icon={Scale}
              label={t("dashboard.totalWeight")}
              value={`≈ ${formatWeight(stats.totalGrams, locale)}`}
              hint={t("dashboard.totalWeightHint")}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("dashboard.priorityTitle")}</CardTitle>
                <CardDescription>{t("dashboard.prioritySubtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.priority.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("dashboard.priorityEmpty")}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {stats.priority.map((view) => (
                      <li key={view.lot.id}>
                        <button
                          type="button"
                          onClick={() => navigate("inventory")}
                          className="flex w-full items-center gap-3 py-3 text-left hover:opacity-80"
                        >
                          <CategoryIcon category={view.definition?.category ?? "other"} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{nameOf(view.definition)}</div>
                            <div className="truncate text-sm text-muted-foreground">
                              {[
                                view.lot.form ? t(`form.${view.lot.form}`) : undefined,
                                view.remaining
                                  ? `${view.remaining.isEstimate ? "≈ " : ""}${formatWeight(view.remaining.grams, locale)}`
                                  : undefined,
                                t(`storage.${view.lot.storage}`),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          <ExpirationBadge expirationDate={view.lot.expirationDate} today={today} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => navigate("inventory")}
                >
                  {t("dashboard.viewInventory")}
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/70 to-card">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Salad className="size-5" />
                </div>
                <CardTitle>{t("dashboard.nutritionTitle")}</CardTitle>
                <CardDescription>{t("dashboard.nutritionBody")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => navigate("nutrition")}>
                  {t("dashboard.openNutrition")}
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <LotFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
