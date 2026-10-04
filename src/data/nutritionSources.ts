import type { NutritionSource } from "@/domain/nutrition/types";

export const DEMO_SOURCE_ID = "pantrypilot_demo";

/**
 * Bump whenever src/data changes so existing databases re-seed built-ins on
 * the next launch.
 */
export const BUILTIN_DATASET_VERSION = "demo-2026.10.1";

export const BUILTIN_NUTRITION_SOURCES: readonly NutritionSource[] = [
  {
    id: DEMO_SOURCE_ID,
    name: "PantryPilot demo dataset",
    dataset: "demo-2026.10",
    region: "JP",
    notes:
      "DEMO DATA. Rounded, approximate values typical of published food composition " +
      "tables, entered by hand so the nutrition engine can be developed and tested. " +
      "Not verified against an authoritative source and not suitable for dietary or " +
      "medical decisions. Intended to be replaced by an imported official dataset " +
      "(e.g. the Standard Tables of Food Composition in Japan).",
  },
];
