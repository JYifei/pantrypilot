import type { AnimalSpecies, MeatCut } from "./taxonomy";
import type { IngredientDefinition } from "./types";

/** ID of the fallback definition used when a species' cut has no dedicated record. */
export function unspecifiedCutDefinitionId(species: AnimalSpecies): string {
  return `${species}_unspecified_raw`;
}

/**
 * Find the nutritional identity for "species + cut" as chosen in the Add Food flow.
 *
 * Prefers a definition with exactly that species and cut. When the taxonomy
 * knows the cut but no nutrition record exists yet (e.g. beef rump in the demo
 * dataset), falls back to the species' "unspecified" definition. The chosen
 * cut is still stored on the inventory lot.
 */
export function resolveDefinitionForCut(
  definitions: readonly IngredientDefinition[],
  species: AnimalSpecies,
  cut: MeatCut | undefined,
): IngredientDefinition | undefined {
  if (cut) {
    const exact = definitions.find((d) => d.animalSpecies === species && d.anatomicalCut === cut);
    if (exact) return exact;
  }
  return (
    definitions.find((d) => d.id === unspecifiedCutDefinitionId(species)) ??
    definitions.find((d) => d.animalSpecies === species && d.anatomicalCut === undefined)
  );
}
