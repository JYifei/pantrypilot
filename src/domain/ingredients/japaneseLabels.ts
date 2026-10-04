import type { AnimalSpecies, MeatCut, ProductForm } from "./taxonomy";

/**
 * Mapping from Japanese supermarket label vocabulary to canonical values.
 *
 * This is data for parsing labels (typed text today, OCR / LLM output in the
 * future). It is intentionally NOT used for display — display names come
 * from the locale files.
 */

export const JAPANESE_FORM_LABELS: Readonly<Record<string, ProductForm>> = {
  ステーキ用: "steak",
  焼肉用: "yakiniku_slice",
  しゃぶしゃぶ用: "shabu_shabu_slice",
  すき焼き用: "sukiyaki_slice",
  すき焼用: "sukiyaki_slice",
  生姜焼き用: "shogayaki_slice",
  しょうが焼き用: "shogayaki_slice",
  薄切り: "thin_slice",
  うす切り: "thin_slice",
  厚切り: "thick_slice",
  ブロック: "block",
  かたまり: "block",
  ひき肉: "ground",
  挽肉: "ground",
  ミンチ: "ground",
  角切り: "diced",
  切り身: "fillet",
  // Mixed-trimming products are sold thinly sliced.
  切り落とし: "thin_slice",
  切落し: "thin_slice",
  こま切れ: "thin_slice",
  小間切れ: "thin_slice",
};

interface CutLabel {
  label: string;
  cut: MeatCut;
  /** Restrict the mapping to these species (e.g. もも means different cuts). */
  species?: readonly AnimalSpecies[];
}

/** Ordered longest-first at lookup time so 肩ロース wins over ロース. */
export const JAPANESE_CUT_LABELS: readonly CutLabel[] = [
  { label: "サーロイン", cut: "sirloin", species: ["beef"] },
  { label: "リブロース", cut: "rib_loin", species: ["beef"] },
  { label: "肩ロース", cut: "shoulder_loin" },
  { label: "かたロース", cut: "shoulder_loin" },
  { label: "ミスジ", cut: "misuji", species: ["beef"] },
  { label: "みすじ", cut: "misuji", species: ["beef"] },
  { label: "ランプ", cut: "rump", species: ["beef"] },
  { label: "もも", cut: "round", species: ["beef"] },
  { label: "モモ", cut: "round", species: ["beef"] },
  { label: "もも", cut: "leg", species: ["pork"] },
  { label: "モモ", cut: "leg", species: ["pork"] },
  { label: "もも", cut: "thigh", species: ["chicken"] },
  { label: "モモ", cut: "thigh", species: ["chicken"] },
  { label: "ヒレ", cut: "tenderloin" },
  { label: "ヘレ", cut: "tenderloin" },
  { label: "フィレ", cut: "tenderloin" },
  { label: "バラ", cut: "belly" },
  { label: "ばら", cut: "belly" },
  { label: "ロース", cut: "loin", species: ["pork"] },
  { label: "むね", cut: "breast", species: ["chicken"] },
  { label: "ムネ", cut: "breast", species: ["chicken"] },
  { label: "胸", cut: "breast", species: ["chicken"] },
  { label: "ささみ", cut: "tender", species: ["chicken"] },
  { label: "ササミ", cut: "tender", species: ["chicken"] },
  { label: "手羽先", cut: "wing", species: ["chicken"] },
  { label: "手羽元", cut: "drumette", species: ["chicken"] },
  { label: "こま切れ", cut: "komagire" },
  { label: "小間切れ", cut: "komagire" },
  { label: "切り落とし", cut: "kiriotoshi" },
  { label: "切落し", cut: "kiriotoshi" },
  { label: "ひき肉", cut: "ground" },
  { label: "挽肉", cut: "ground" },
  { label: "ミンチ", cut: "ground" },
];

const SPECIES_LABELS: readonly { label: string; species: AnimalSpecies }[] = [
  { label: "和牛", species: "beef" },
  { label: "国産牛", species: "beef" },
  { label: "牛", species: "beef" },
  { label: "ビーフ", species: "beef" },
  { label: "豚", species: "pork" },
  { label: "ポーク", species: "pork" },
  { label: "若鶏", species: "chicken" },
  { label: "鶏", species: "chicken" },
  { label: "とり", species: "chicken" },
  { label: "チキン", species: "chicken" },
];

export interface ParsedMeatLabel {
  species?: AnimalSpecies;
  cut?: MeatCut;
  form?: ProductForm;
}

function byLabelLengthDesc<T extends { label: string }>(a: T, b: T): number {
  return b.label.length - a.label.length;
}

/**
 * Extract species / cut / form from a Japanese meat label such as
 * "牛ミスジステーキ用" or "豚バラ しゃぶしゃぶ用". Unknown parts are omitted.
 */
export function parseJapaneseMeatLabel(rawText: string): ParsedMeatLabel {
  const text = rawText.normalize("NFKC");
  const result: ParsedMeatLabel = {};

  const species = [...SPECIES_LABELS].sort(byLabelLengthDesc).find((s) => text.includes(s.label));
  if (species) result.species = species.species;

  const cut = [...JAPANESE_CUT_LABELS]
    .sort(byLabelLengthDesc)
    .find(
      (c) =>
        text.includes(c.label) &&
        (!c.species || !result.species || c.species.includes(result.species)),
    );
  if (cut) result.cut = cut.cut;

  const formLabel = Object.keys(JAPANESE_FORM_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((label) => text.includes(label));
  if (formLabel) result.form = JAPANESE_FORM_LABELS[formLabel];

  return result;
}
