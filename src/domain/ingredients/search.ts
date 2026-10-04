import { allLocalizedValues } from "../common/localizedText";
import type { IngredientDefinition } from "./types";

/**
 * Normalize text for language-agnostic matching:
 * - NFKC (full-width → half-width, compatibility forms)
 * - lower case
 * - katakana → hiragana, so ミスジ matches みすじ
 * - strip whitespace and common separators
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s_\-・/()（）]+/g, "");
}

/** All strings a definition can be found by, in every language. */
export function ingredientSearchTerms(definition: IngredientDefinition): string[] {
  return [
    ...allLocalizedValues(definition.name),
    ...definition.aliases,
    definition.id,
    ...definition.tags,
  ];
}

/** Lower is better; null means no match. */
function matchRank(terms: string[], query: string): number | null {
  let best: number | null = null;
  for (const term of terms) {
    const normalized = normalizeSearchText(term);
    let rank: number | null = null;
    if (normalized === query) rank = 0;
    else if (normalized.startsWith(query)) rank = 1;
    else if (normalized.includes(query)) rank = 2;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/**
 * Search definitions by Chinese, English or Japanese name, aliases, ID or tags.
 * Results are ordered: exact match, prefix match, substring match, then by input order.
 * An empty query returns all definitions unchanged.
 */
export function searchIngredients<T extends IngredientDefinition>(
  definitions: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "") return [...definitions];
  return definitions
    .map((definition, index) => ({
      definition,
      index,
      rank: matchRank(ingredientSearchTerms(definition), normalizedQuery),
    }))
    .filter((entry): entry is typeof entry & { rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.definition);
}
