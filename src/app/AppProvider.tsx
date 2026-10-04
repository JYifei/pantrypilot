import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { todayIsoDate } from "@/domain/common/dates";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { InventoryLot } from "@/domain/inventory/types";
import type { NutritionSource } from "@/domain/nutrition/types";
import type { Recipe } from "@/domain/recipes/types";
import type { AppSettings } from "@/domain/settings/settings";
import i18n from "@/lib/i18n";
import type { AppServices } from "@/services/appServices";
import { AppContext, type AppContextValue, type PageId, type SandboxEntry } from "./appContext";
import { useThemeEffect } from "./useThemeEffect";

export interface InitialAppData {
  settings: AppSettings;
  definitions: IngredientDefinition[];
  sources: NutritionSource[];
  lots: InventoryLot[];
  recipes: Recipe[];
}

/** Holds app-wide state loaded from the database and exposes it via AppContext. */
export function AppProvider({
  services,
  initial,
  children,
}: {
  services: AppServices;
  initial: InitialAppData;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState(initial.settings);
  const [definitions, setDefinitions] = useState(initial.definitions);
  const [sources, setSources] = useState(initial.sources);
  const [lots, setLots] = useState(initial.lots);
  const [recipes, setRecipes] = useState(initial.recipes);
  const [today, setToday] = useState(() => todayIsoDate());
  const [page, setPage] = useState<PageId>("dashboard");
  const [sandbox, setSandbox] = useState<SandboxEntry[]>([]);

  const reload = useCallback(async () => {
    const [nextDefinitions, nextSources, nextLots, nextRecipes] = await Promise.all([
      services.ingredients.listAll(),
      services.ingredients.listSources(),
      services.inventory.listLots(),
      services.recipes.listAll(),
    ]);
    setDefinitions(nextDefinitions);
    setSources(nextSources);
    setLots(nextLots);
    setRecipes(nextRecipes);
    setToday(todayIsoDate());
  }, [services]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      await services.repositories.settings.save(next);
      setSettings(next);
    },
    [services, settings],
  );

  useEffect(() => {
    void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  // Keep "today" correct when the app stays open across midnight.
  useEffect(() => {
    const refresh = () => setToday(todayIsoDate());
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  useThemeEffect(settings.theme);

  const value = useMemo<AppContextValue>(
    () => ({
      services,
      settings,
      updateSettings,
      definitions,
      definitionsById: new Map(definitions.map((d) => [d.id, d])),
      sources,
      lots,
      recipes,
      today,
      reload,
      page,
      navigate: setPage,
      sandbox,
      setSandbox,
    }),
    [
      services,
      settings,
      updateSettings,
      definitions,
      sources,
      lots,
      recipes,
      today,
      reload,
      page,
      sandbox,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
