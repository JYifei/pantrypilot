import { useTranslation } from "react-i18next";
import type { LineStatus, RecipeMatch, RecipeReadiness } from "@/domain/recipes/matching";
import { cn } from "@/lib/utils";

const BADGE_STYLES: Record<RecipeReadiness, string> = {
  ready: "bg-success/15 text-success ring-1 ring-success/40",
  confirm: "bg-background text-warning-foreground ring-1 ring-warning",
  almost: "bg-warning/20 text-warning-foreground",
  missing: "bg-muted text-muted-foreground",
};

export function ReadinessBadge({ match, className }: { match: RecipeMatch; className?: string }) {
  const { t } = useTranslation();
  let label: string;
  switch (match.readiness) {
    case "ready":
      label = t("recipes.readyBadge");
      break;
    case "confirm":
      label = t("recipes.confirmBadge", { count: match.unconfirmedLines.length });
      break;
    case "almost":
      label = t("recipes.almostBadge", { count: match.shortLines.length });
      break;
    case "missing":
      label = t("recipes.missingBadge", { count: match.shortLines.length });
      break;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_STYLES[match.readiness],
        className,
      )}
    >
      {label}
    </span>
  );
}

const DOT_STYLES: Record<LineStatus, string> = {
  enough: "bg-success",
  partial: "bg-warning",
  missing: "bg-muted-foreground/40",
  unknown: "bg-background ring-2 ring-warning ring-inset",
};

export function StatusDot({ status, className }: { status: LineStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", DOT_STYLES[status], className)}
    />
  );
}
