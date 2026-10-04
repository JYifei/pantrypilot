import { useTranslation } from "react-i18next";
import type { LineStatus, RecipeMatch } from "@/domain/recipes/matching";
import { cn } from "@/lib/utils";

export function ReadinessBadge({ match, className }: { match: RecipeMatch; className?: string }) {
  const { t } = useTranslation();
  const count = match.shortLines.length;
  const styles = {
    ready: "bg-success/15 text-success ring-1 ring-success/40",
    almost: "bg-warning/20 text-warning-foreground",
    missing: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        styles[match.readiness],
        className,
      )}
    >
      {match.readiness === "ready"
        ? t("recipes.readyBadge")
        : t(match.readiness === "almost" ? "recipes.almostBadge" : "recipes.missingBadge", {
            count,
          })}
    </span>
  );
}

const DOT_STYLES: Record<LineStatus, string> = {
  enough: "bg-success",
  partial: "bg-warning",
  missing: "bg-muted-foreground/40",
};

export function StatusDot({ status, className }: { status: LineStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", DOT_STYLES[status], className)}
    />
  );
}
