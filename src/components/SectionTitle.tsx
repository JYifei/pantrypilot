import type { ReactNode } from "react";

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-foreground/80">{children}</h3>
      {aside}
    </div>
  );
}
