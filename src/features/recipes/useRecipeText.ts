import { useTranslation } from "react-i18next";
import { useIngredientName, useLocale } from "@/app/appContext";
import type {
  CandidateLot,
  CandidateNote,
  IngredientLineMatch,
  LotUse,
} from "@/domain/recipes/matching";
import { formatNumber, formatWeight } from "@/lib/format";

/** Human-readable explanations of a recipe allocation, shared by cards, details and cooking. */
export function useRecipeText() {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();

  const amountOf = (candidate: CandidateLot, amount: number) =>
    candidate.measure === "weight"
      ? formatWeight(amount, locale)
      : `${formatNumber(amount, locale)} ${candidate.lot.unit ? t(`unit.${candidate.lot.unit}`) : ""}`.trim();

  const lotUseLabel = (use: LotUse) =>
    `${nameOf(use.candidate.definition)} ${amountOf(use.candidate, use.amount)}`;

  function stockText(line: IngredientLineMatch): string {
    const used = formatWeight(line.suppliedGrams, locale);
    const gap = formatWeight(line.shortfallGrams, locale);
    const shared = line.reasons.includes("shared");
    switch (line.status) {
      case "enough":
        return line.reasons.includes("nearly_enough")
          ? t("recipes.stockNearly", { used, gap })
          : t("recipes.stockEnough", { used });
      case "partial":
        return t(shared ? "recipes.stockShared" : "recipes.stockPartial", { used, gap });
      case "missing":
        return t(shared ? "recipes.stockSharedNone" : "recipes.stockMissing");
      case "unknown":
        if (line.reasons.includes("allocation_uncertain")) return t("recipes.stockUncertain");
        return line.suppliedGrams > 0
          ? t("recipes.stockUnknownPartial", { used })
          : t("recipes.stockUnknown");
    }
  }

  function noteText(candidate: CandidateLot, note: CandidateNote): string {
    const name = nameOf(candidate.definition);
    switch (note.kind) {
      case "estimated_count":
        return t("recipes.noteEstimatedCount", {
          name,
          unit: t(`unit.${note.unit}`),
          amount: formatWeight(note.gramsPerUnit, locale),
        });
      case "edible_ratio":
        return t("recipes.noteEdibleRatio", {
          name,
          percent: new Intl.NumberFormat(locale, { style: "percent" }).format(note.ratio),
        });
      case "edible_ratio_unknown":
        return t("recipes.noteEdibleUnknown", { name });
      case "form_differs":
        return t("recipes.noteFormDiffers", { name, form: t(`form.${note.form}`) });
    }
  }

  /** Estimates and caveats behind a line, plus stocked lots that do not fit. */
  function lineNotes(line: IngredientLineMatch): string[] {
    const notes = new Set<string>();
    const sources = line.uses.length > 0 ? line.uses.map((u) => u.candidate) : line.candidates;
    for (const candidate of sources) {
      for (const note of candidate.notes) notes.add(noteText(candidate, note));
    }
    if (line.status !== "enough") {
      for (const reason of ["form", "prepared"] as const) {
        const names = [
          ...new Set(
            line.excluded.filter((e) => e.reason === reason).map((e) => nameOf(e.definition)),
          ),
        ];
        if (names.length > 0) {
          notes.add(
            t(reason === "form" ? "recipes.excludedForm" : "recipes.excludedPrepared", {
              names: names.join(", "),
            }),
          );
        }
      }
    }
    return [...notes];
  }

  return { amountOf, lotUseLabel, stockText, lineNotes };
}
