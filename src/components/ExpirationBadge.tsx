import { useTranslation } from "react-i18next";
import type { IsoDate } from "@/domain/common/dates";
import { daysUntilExpiration, getExpirationStatus } from "@/domain/inventory/expiration";
import type { ExpirationStatus } from "@/domain/inventory/expiration";
import { cn } from "@/lib/utils";

const STYLES: Record<ExpirationStatus, string> = {
  expired: "bg-destructive text-white",
  today: "bg-destructive/15 text-destructive ring-1 ring-destructive/40",
  tomorrow: "bg-warning/25 text-warning-foreground ring-1 ring-warning/60",
  soon: "bg-warning/15 text-warning-foreground",
  normal: "bg-muted text-muted-foreground",
  unknown: "border border-dashed text-muted-foreground",
};

export function ExpirationBadge({
  expirationDate,
  today,
  className,
}: {
  expirationDate?: IsoDate;
  today: IsoDate;
  className?: string;
}) {
  const { t } = useTranslation();
  const status = getExpirationStatus(expirationDate, today);
  const days = daysUntilExpiration(expirationDate, today) ?? 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STYLES[status],
        className,
      )}
    >
      {t(`expiration.${status}`, { count: Math.abs(days) })}
    </span>
  );
}
