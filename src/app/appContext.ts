import { createContext, useCallback, useContext, type Dispatch, type SetStateAction } from "react";
import type { IsoDate } from "@/domain/common/dates";
import { localize, type LocaleCode } from "@/domain/common/localizedText";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { InventoryLot } from "@/domain/inventory/types";
import type { NutritionSource } from "@/domain/nutrition/types";
import type { AppSettings } from "@/domain/settings/settings";
import type { AppServices } from "@/services/appServices";

export const PAGES = ["dashboard", "inventory", "nutrition", "ingredients", "settings"] as const;
export type PageId = (typeof PAGES)[number];

/** One line in the nutrition sandbox. Kept in memory only. */
export interface SandboxEntry {
  id: string;
  definitionId: string;
  lotId?: string;
  grams: number;
}

export interface AppContextValue {
  services: AppServices;
  settings: AppSettings;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  definitions: IngredientDefinition[];
  definitionsById: ReadonlyMap<string, IngredientDefinition>;
  sources: NutritionSource[];
  lots: InventoryLot[];
  today: IsoDate;
  /** Re-read ingredients, sources and inventory from the database. */
  reload(): Promise<void>;
  page: PageId;
  navigate(page: PageId): void;
  sandbox: SandboxEntry[];
  setSandbox: Dispatch<SetStateAction<SandboxEntry[]>>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

export function useLocale(): LocaleCode {
  return useApp().settings.language;
}

/** Display name of an ingredient definition in the current UI language. */
export function useIngredientName(): (definition: IngredientDefinition | undefined) => string {
  const locale = useLocale();
  return useCallback(
    (definition) => (definition ? localize(definition.name, locale) : "?"),
    [locale],
  );
}
