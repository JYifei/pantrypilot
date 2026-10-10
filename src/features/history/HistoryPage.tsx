import { History, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SectionTitle } from "@/components/SectionTitle";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { daysBetween } from "@/domain/common/dates";
import { localize } from "@/domain/common/localizedText";
import {
  groupSessionsByDay,
  legacyCookTransactions,
  RECENT_HISTORY_DAYS,
  sessionRecipeStatus,
  type SessionDay,
  type SessionRecipeStatus,
} from "@/domain/cooking/history";
import type { CookingSession, CookingSessionItem } from "@/domain/cooking/types";
import type { InventoryTransaction } from "@/domain/inventory/types";
import { formatDate, formatDateTime, formatNumber, formatTime, formatWeight } from "@/lib/format";

const STATUS_KEYS: Partial<Record<SessionRecipeStatus, string>> = {
  deleted: "history.recipeDeleted",
  changed: "history.recipeChanged",
};

function useItemAmount() {
  const { t } = useTranslation();
  const locale = useLocale();
  return (item: CookingSessionItem) => {
    if (item.grams !== undefined) {
      const weight = formatWeight(item.grams, locale);
      return item.boneIn ? `${weight} ${t("history.boneInWeight")}` : weight;
    }
    const count = `${formatNumber(item.count ?? 0, locale)}${item.unit ? ` ${t(`unit.${item.unit}`)}` : ""}`;
    if (item.estimatedGrams === undefined) return `${count} · ${t("history.weightUnknown")}`;
    const grams = formatWeight(item.estimatedGrams, locale);
    return item.weightBasis === "estimated"
      ? `${count} · ${t("history.approxWeight", { amount: grams })}`
      : `${count} · ${grams}`;
  };
}

function SessionCard({ session }: { session: CookingSession }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { recipes } = useApp();
  const amountOf = useItemAmount();
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const statusKey = STATUS_KEYS[sessionRecipeStatus(session, recipesById)];

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{localize(session.recipeName, locale)}</span>
          {statusKey && <Badge variant="outline">{t(statusKey)}</Badge>}
        </div>
        <span className="tabular text-sm text-muted-foreground">
          {formatTime(session.cookedAt, locale)} ·{" "}
          {t("recipes.servings", { count: session.servings })}
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {session.items.map((item) => (
          <li key={`${item.ingredientKey}|${item.lotId}`} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {localize(item.ingredientName, locale)}
              {item.form && (
                <span className="text-muted-foreground"> · {t(`form.${item.form}`)}</span>
              )}
            </span>
            <span className="tabular shrink-0 text-muted-foreground">{amountOf(item)}</span>
          </li>
        ))}
      </ul>
      {session.note && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
          {session.note}
        </p>
      )}
    </Card>
  );
}

function DayGroups({ days }: { days: SessionDay[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { today } = useApp();
  const dayLabel = (localDate: string) => {
    const ago = daysBetween(localDate, today);
    if (ago === 0) return t("history.today");
    if (ago === 1) return t("history.yesterday");
    return formatDate(localDate, locale, today);
  };
  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <div key={day.localDate} className="flex flex-col gap-2">
          <div className="text-sm font-medium text-muted-foreground">{dayLabel(day.localDate)}</div>
          {day.sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ))}
    </div>
  );
}

function LegacySection({ transactions }: { transactions: InventoryTransaction[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { recipes, lots, definitionsById } = useApp();
  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const lotsById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);

  const amountOf = (transaction: InventoryTransaction) => {
    if (transaction.quantityG !== undefined) return formatWeight(transaction.quantityG, locale);
    const unit = lotsById.get(transaction.inventoryLotId)?.unit;
    return `${formatNumber(transaction.quantityCount ?? 0, locale)}${unit ? ` ${t(`unit.${unit}`)}` : ""}`;
  };

  return (
    <section>
      <SectionTitle>{t("history.legacyTitle")}</SectionTitle>
      <div className="mb-3 flex gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>{t("history.legacyExplanation")}</p>
      </div>
      <Card className="gap-0 divide-y p-0">
        {transactions.map((transaction) => {
          const recipe = transaction.recipeId ? recipesById.get(transaction.recipeId) : undefined;
          const lot = lotsById.get(transaction.inventoryLotId);
          return (
            <div
              key={transaction.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span>
                  {lot
                    ? nameOf(definitionsById.get(lot.ingredientDefinitionId))
                    : t("history.lotDeleted")}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {recipe ? localize(recipe.name, locale) : t("history.recipeDeleted")}
                </span>
              </div>
              <span className="tabular text-muted-foreground">
                {amountOf(transaction)} · {formatDateTime(transaction.createdAt, locale)}
              </span>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

/**
 * Cooking sessions, newest first: the last 7 days, then older ones. Below
 * them, deductions recorded before sessions existed, shown one by one.
 */
export function HistoryPage() {
  const { t } = useTranslation();
  const { services, sessions, lots, today } = useApp();
  const [legacy, setLegacy] = useState<InventoryTransaction[]>([]);

  useEffect(() => {
    let cancelled = false;
    void services.inventory.listTransactions().then((transactions) => {
      if (!cancelled) setLegacy(legacyCookTransactions(transactions));
    });
    return () => {
      cancelled = true;
    };
  }, [services, lots]);

  const { recent, older } = useMemo(() => groupSessionsByDay(sessions, today), [sessions, today]);

  return (
    <>
      <PageHeader title={t("history.title")} description={t("history.description")} />
      {sessions.length === 0 && legacy.length === 0 ? (
        <EmptyState
          icon={History}
          title={t("history.empty")}
          description={t("history.emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <SectionTitle>{t("history.recentTitle", { count: RECENT_HISTORY_DAYS })}</SectionTitle>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("history.recentEmpty")}</p>
            ) : (
              <DayGroups days={recent} />
            )}
          </section>
          {older.length > 0 && (
            <section>
              <SectionTitle>{t("history.olderTitle")}</SectionTitle>
              <DayGroups days={older} />
            </section>
          )}
          {legacy.length > 0 && <LegacySection transactions={legacy} />}
        </div>
      )}
    </>
  );
}
