import {
  Archive,
  Ellipsis,
  PackageOpen,
  Pencil,
  Refrigerator,
  Scale,
  Snowflake,
  Trash2,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIngredientName, useLocale } from "@/app/appContext";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ExpirationBadge } from "@/components/ExpirationBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IsoDate } from "@/domain/common/dates";
import { STORAGE_TYPES, type StorageType } from "@/domain/ingredients/taxonomy";
import { formatCurrency, formatDate, formatNumber, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LotView } from "./lotView";

export const STORAGE_ICONS: Record<StorageType, LucideIcon> = {
  pantry: Archive,
  refrigerated: Refrigerator,
  frozen: Snowflake,
};

export type LotAction =
  "consume" | "adjust" | "edit" | "toggleOpened" | "discard" | "delete" | { storage: StorageType };

export function LotCard({
  view,
  today,
  onAction,
}: {
  view: LotView;
  today: IsoDate;
  onAction: (action: LotAction) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { lot, definition, depleted, remaining } = view;
  const StorageIcon = STORAGE_ICONS[lot.storage];

  const details = [
    lot.cut && definition?.anatomicalCut !== lot.cut ? t(`cut.${lot.cut}`) : undefined,
    lot.form ? t(`form.${lot.form}`) : undefined,
    lot.thicknessMm !== undefined
      ? t("inventory.thickness", { value: formatNumber(lot.thicknessMm, locale) })
      : undefined,
    lot.fatPercent !== undefined
      ? t("inventory.fat", { value: formatNumber(lot.fatPercent, locale) })
      : undefined,
    lot.boneIn ? t("inventory.boneIn") : undefined,
    lot.skinOn ? t("inventory.skinOn") : undefined,
    ...lot.processing.map((p) => t(`processing.${p}`)),
  ].filter(Boolean);

  const tracksWeight = lot.remainingWeightG !== undefined;
  const progress =
    tracksWeight && lot.originalWeightG
      ? Math.max(0, Math.min(1, lot.remainingWeightG! / lot.originalWeightG))
      : null;

  return (
    <Card
      className={cn(
        "gap-0 p-5 transition-shadow hover:shadow-md",
        depleted && "opacity-60",
        view.status === "expired" && !depleted && "ring-1 ring-destructive/40",
      )}
    >
      <div className="flex items-start gap-3">
        <CategoryIcon category={definition?.category ?? "other"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-medium" title={nameOf(definition)}>
              {nameOf(definition)}
            </h3>
            {!depleted && <ExpirationBadge expirationDate={lot.expirationDate} today={today} />}
          </div>
          {details.length > 0 && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{details.join(" · ")}</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t("inventory.remaining")}</span>
          <span className="tabular text-lg font-semibold">
            {depleted ? (
              <span className="text-sm font-normal text-muted-foreground">
                {t("inventory.depleted")}
              </span>
            ) : tracksWeight ? (
              <>
                {formatWeight(lot.remainingWeightG!, locale)}
                {lot.originalWeightG !== undefined &&
                  lot.originalWeightG !== lot.remainingWeightG && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {formatWeight(lot.originalWeightG, locale)}
                    </span>
                  )}
              </>
            ) : lot.count !== undefined ? (
              <>
                {formatNumber(lot.count, locale)} {lot.unit ? t(`unit.${lot.unit}`) : ""}
                {remaining?.isEstimate && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    ≈ {formatWeight(remaining.grams, locale)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm font-normal text-muted-foreground">
                {t("inventory.noQuantity")}
              </span>
            )}
          </span>
        </div>
        {progress !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <StorageIcon className="size-3.5" />
          {t(`storage.${lot.storage}`)}
        </span>
        {lot.opened && (
          <span className="inline-flex items-center gap-1">
            <PackageOpen className="size-3.5" />
            {t("inventory.opened")}
          </span>
        )}
        {lot.expirationDate && (
          <span>
            {t("inventory.expires", { date: formatDate(lot.expirationDate, locale, today) })}
          </span>
        )}
        {lot.purchasePrice !== undefined && (
          <span>{formatCurrency(lot.purchasePrice, lot.currency ?? "JPY", locale)}</span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={depleted}
          onClick={() => onAction("consume")}
        >
          <Utensils />
          {t("inventory.actionConsume")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label={t("inventory.moreActions")}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onAction("adjust")}>
              <Scale />
              {t("inventory.actionAdjust")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("toggleOpened")}>
              <PackageOpen />
              {lot.opened ? t("inventory.actionMarkUnopened") : t("inventory.actionMarkOpened")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <StorageIcon />
                {t("inventory.actionStorage")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {STORAGE_TYPES.map((storage) => {
                  const Icon = STORAGE_ICONS[storage];
                  return (
                    <DropdownMenuItem
                      key={storage}
                      disabled={storage === lot.storage}
                      onSelect={() => onAction({ storage })}
                    >
                      <Icon />
                      {storage === "frozen" ? t("inventory.actionFreeze") : t(`storage.${storage}`)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => onAction("edit")}>
              <Pencil />
              {t("inventory.actionEdit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={depleted} onSelect={() => onAction("discard")}>
              <Trash2 />
              {t("inventory.actionDiscard")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete")}>
              <Trash2 />
              {t("inventory.actionDelete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
