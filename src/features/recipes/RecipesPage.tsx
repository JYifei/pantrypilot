import { AlarmClock, ChefHat, Clock, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { localize } from "@/domain/common/localizedText";
import { normalizeSearchText } from "@/domain/ingredients/search";
import {
  displayIngredientId,
  type IngredientLineMatch,
  type RecipeMatch,
} from "@/domain/recipes/matching";
import type { Recipe } from "@/domain/recipes/types";
import { formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReadinessBadge, StatusDot } from "./RecipeBadges";
import { RecipeDetailDialog } from "./RecipeDetailDialog";
import { RecipeFormDialog } from "./RecipeFormDialog";
import { recipeSearchText, useRecipeMatches } from "./useRecipeMatches";
import { useRecipeText } from "./useRecipeText";

const FILTERS = ["all", "ready", "confirm", "almost", "custom"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL_KEYS: Record<Filter, string> = {
  all: "recipes.filterAll",
  ready: "recipes.filterReady",
  confirm: "recipes.filterConfirm",
  almost: "recipes.filterAlmost",
  custom: "recipes.filterCustom",
};

function RecipeCard({ match, onOpen }: { match: RecipeMatch; onOpen: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { definitionsById } = useApp();
  const { lotUseLabel } = useRecipeText();
  const { recipe } = match;
  const lineName = (line: IngredientLineMatch) =>
    nameOf(definitionsById.get(displayIngredientId(line)));
  const expiringItems = [...new Set(match.expiringUses.map(({ use }) => lotUseLabel(use)))];
  const shortItems =
    match.readiness === "almost"
      ? match.shortLines.map(
          (line) => `${lineName(line)} ${formatWeight(line.shortfallGrams, locale)}`,
        )
      : [];
  const unconfirmedNames = match.unconfirmedLines.map(lineName);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="cursor-pointer gap-3 p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{localize(recipe.name, locale)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {recipe.timeMinutes !== undefined && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {t("recipes.minutes", { count: recipe.timeMinutes })}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {t("recipes.servings", { count: recipe.servings })}
            </span>
            {!recipe.isBuiltin && <Badge variant="outline">{t("recipes.custom")}</Badge>}
          </div>
        </div>
        <ReadinessBadge match={match} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {match.lines.map((line) => (
          <span
            key={line.ingredient.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
              line.ingredient.optional && "border-dashed text-muted-foreground",
            )}
          >
            <StatusDot status={line.status} />
            {lineName(line)}
          </span>
        ))}
      </div>

      {expiringItems.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-warning-foreground">
          <AlarmClock className="size-3.5 shrink-0 text-warning" />
          <span className="truncate">
            {t("recipes.usesExpiring", { items: expiringItems.join(", ") })}
          </span>
        </div>
      )}
      {unconfirmedNames.length > 0 && (
        <div className="truncate text-xs text-muted-foreground">
          {t("recipes.confirmItems", { names: unconfirmedNames.join(", ") })}
        </div>
      )}
      {shortItems.length > 0 && (
        <div className="truncate text-xs text-muted-foreground">
          {t("recipes.shortItems", { items: shortItems.join(", ") })}
        </div>
      )}
    </Card>
  );
}

export function RecipesPage() {
  const { t } = useTranslation();
  const { definitionsById } = useApp();
  const matches = useRecipeMatches();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing?: Recipe }>({ open: false });

  const visible = useMemo(() => {
    const needle = normalizeSearchText(query);
    return matches.filter((m) => {
      if (filter === "ready" && m.readiness !== "ready") return false;
      if (filter === "confirm" && m.readiness !== "confirm") return false;
      if (filter === "almost" && m.readiness !== "almost") return false;
      if (filter === "custom" && m.recipe.isBuiltin) return false;
      return !needle || recipeSearchText(m.recipe, definitionsById).includes(needle);
    });
  }, [matches, query, filter, definitionsById]);

  const counts = useMemo(
    () => ({
      all: matches.length,
      ready: matches.filter((m) => m.readiness === "ready").length,
      confirm: matches.filter((m) => m.readiness === "confirm").length,
      almost: matches.filter((m) => m.readiness === "almost").length,
      custom: matches.filter((m) => !m.recipe.isBuiltin).length,
    }),
    [matches],
  );

  return (
    <>
      <PageHeader
        title={t("recipes.title")}
        description={t("recipes.subtitle")}
        actions={
          <Button onClick={() => setForm({ open: true })}>
            <Plus />
            {t("recipes.add")}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("recipes.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg bg-muted p-0.5 text-sm">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5",
                filter === f ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t(FILTER_LABEL_KEYS[f])}
              <span className="tabular ml-1.5 text-xs text-muted-foreground">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">{t("recipes.demoNotice")}</p>

      {visible.length === 0 ? (
        <EmptyState icon={ChefHat} title={t("recipes.empty")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((match) => (
            <RecipeCard
              key={match.recipe.id}
              match={match}
              onOpen={() => setOpenId(match.recipe.id)}
            />
          ))}
        </div>
      )}

      {openId && (
        <RecipeDetailDialog
          recipeId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(recipe) => {
            setOpenId(null);
            setForm({ open: true, editing: recipe });
          }}
          onOpenRecipe={setOpenId}
        />
      )}

      <RecipeFormDialog
        open={form.open}
        editing={form.editing}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
        onSaved={(recipe) => setOpenId(recipe.id)}
      />
    </>
  );
}
