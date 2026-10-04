/**
 * Canonical vocabulary for foods as they appear in shops and kitchens.
 *
 * Every value here is a stable, language-independent identifier. Display names
 * live in src/locales (e.g. `cut.misuji`, `form.steak`); Japanese supermarket
 * label strings are mapped to these values in ./japaneseLabels.ts.
 * Never use translated strings as business logic.
 */

export const FOOD_CATEGORIES = [
  "meat",
  "fish",
  "seafood",
  "egg",
  "tofu",
  "vegetable",
  "mushroom",
  "fruit",
  "grain",
  "noodle",
  "dairy",
  "seasoning",
  "prepared_food",
  "other",
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export const ANIMAL_SPECIES = ["beef", "pork", "chicken"] as const;
export type AnimalSpecies = (typeof ANIMAL_SPECIES)[number];

/**
 * Anatomical cuts and common mixed-cut retail categories.
 *
 * `komagire` (こま切れ) and `kiriotoshi` (切り落とし) are not anatomical cuts but
 * mixed trimmings sold as their own product; `ground` is minced meat. They are
 * listed here because supermarkets sell them alongside cuts and they have their
 * own nutritional profiles.
 */
export const MEAT_CUTS = [
  "sirloin",
  "rib_loin",
  "shoulder_loin",
  "misuji",
  "rump",
  "round",
  "tenderloin",
  "belly",
  "loin",
  "leg",
  "thigh",
  "breast",
  "tender",
  "wing",
  "drumette",
  "komagire",
  "kiriotoshi",
  "ground",
] as const;
export type MeatCut = (typeof MEAT_CUTS)[number];

/** Which cuts are sold for which species (display order matters). */
export const CUTS_BY_SPECIES: Record<AnimalSpecies, readonly MeatCut[]> = {
  beef: [
    "sirloin",
    "rib_loin",
    "shoulder_loin",
    "misuji",
    "rump",
    "round",
    "tenderloin",
    "belly",
    "komagire",
    "kiriotoshi",
    "ground",
  ],
  pork: ["belly", "loin", "shoulder_loin", "tenderloin", "leg", "komagire", "kiriotoshi", "ground"],
  chicken: ["thigh", "breast", "tender", "wing", "drumette", "ground"],
};

/**
 * Supermarket / cooking form. Form affects recipe compatibility (future) but
 * usually not nutrition, so it is stored on the inventory lot, not on the
 * ingredient definition. Attributes like bone-in or skin-on are separate
 * boolean flags on the lot.
 */
export const PRODUCT_FORMS = [
  "whole",
  "block",
  "steak",
  "thick_slice",
  "thin_slice",
  "yakiniku_slice",
  "shabu_shabu_slice",
  "sukiyaki_slice",
  "shogayaki_slice",
  "ground",
  "minced",
  "diced",
  "fillet",
  "strip",
  "prepared",
  "other",
] as const;
export type ProductForm = (typeof PRODUCT_FORMS)[number];

const MEAT_FORMS: readonly ProductForm[] = [
  "steak",
  "block",
  "thick_slice",
  "thin_slice",
  "yakiniku_slice",
  "shabu_shabu_slice",
  "sukiyaki_slice",
  "shogayaki_slice",
  "ground",
  "diced",
  "strip",
  "whole",
  "other",
];

/** Forms worth offering in the UI for a given category. All forms remain valid. */
export function suggestedFormsForCategory(category: FoodCategory): readonly ProductForm[] {
  switch (category) {
    case "meat":
      return MEAT_FORMS;
    case "fish":
    case "seafood":
      return ["fillet", "whole", "block", "thin_slice", "diced", "other"];
    case "vegetable":
    case "mushroom":
    case "fruit":
      return ["whole", "diced", "strip", "thin_slice", "prepared", "other"];
    case "tofu":
      return ["block", "diced", "other"];
    default:
      return ["whole", "prepared", "other"];
  }
}

export const PROCESSING_TYPES = [
  "raw",
  "cooked",
  "smoked",
  "salted",
  "marinated",
  "fermented",
  "frozen",
  "preseasoned",
] as const;
export type ProcessingType = (typeof PROCESSING_TYPES)[number];

export const INVENTORY_UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "piece",
  "pack",
  "bag",
  "bunch",
  "slice",
  "bottle",
] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

/** Units that can be counted (anything other than mass). */
export const COUNT_UNITS: readonly InventoryUnit[] = [
  "piece",
  "pack",
  "bag",
  "bunch",
  "slice",
  "bottle",
  "ml",
  "l",
];

export const STORAGE_TYPES = ["pantry", "refrigerated", "frozen"] as const;
export type StorageType = (typeof STORAGE_TYPES)[number];

/** Sensible default storage when a user adds a food of this category. */
export function defaultStorageForCategory(category: FoodCategory): StorageType {
  switch (category) {
    case "grain":
    case "noodle":
    case "seasoning":
      return "pantry";
    default:
      return "refrigerated";
  }
}
