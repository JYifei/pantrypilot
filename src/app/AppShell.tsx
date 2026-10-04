import {
  BookOpen,
  LayoutDashboard,
  Refrigerator,
  Salad,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { IngredientsPage } from "@/features/ingredients/IngredientsPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { NutritionPage } from "@/features/nutrition/NutritionPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { cn } from "@/lib/utils";
import { useApp, type PageId } from "./appContext";

const NAV_ITEMS: { id: PageId; icon: LucideIcon }[] = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "inventory", icon: Refrigerator },
  { id: "nutrition", icon: Salad },
  { id: "ingredients", icon: BookOpen },
  { id: "settings", icon: Settings },
];

function CurrentPage({ page }: { page: PageId }) {
  switch (page) {
    case "dashboard":
      return <DashboardPage />;
    case "inventory":
      return <InventoryPage />;
    case "nutrition":
      return <NutritionPage />;
    case "ingredients":
      return <IngredientsPage />;
    case "settings":
      return <SettingsPage />;
  }
}

function Logo() {
  return (
    <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
      <Salad className="size-5" />
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { page, navigate, services } = useApp();
  const isPreview = services.database.kind === "sqljs";

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-2">
          <Logo />
          <div className="min-w-0">
            <div className="font-semibold tracking-tight">{t("app.name")}</div>
            <div className="truncate text-xs text-muted-foreground">{t("app.tagline")}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              aria-current={page === id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                page === id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4.5" />
              {t(`nav.${id}`)}
            </button>
          ))}
        </nav>
        {isPreview && (
          <div className="mt-auto rounded-lg border border-dashed border-warning/60 p-3 text-xs text-muted-foreground">
            {t("app.devPreview")}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b px-3 py-2 md:hidden">
          <Logo />
          {NAV_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              aria-label={t(`nav.${id}`)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm",
                page === id ? "bg-accent font-medium" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(`nav.${id}`)}
            </button>
          ))}
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10">
            <CurrentPage page={page} />
          </div>
        </main>
      </div>
    </div>
  );
}
