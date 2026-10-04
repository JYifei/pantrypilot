import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchIngredients } from "@/domain/ingredients/search";
import { FOOD_CATEGORIES, type FoodCategory } from "@/domain/ingredients/taxonomy";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CustomIngredientDialog } from "./CustomIngredientDialog";
import { IngredientDetailDialog } from "./IngredientDetailDialog";

type OriginFilter = "all" | "builtin" | "custom";

export function IngredientsPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { definitions, services, reload } = useApp();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FoodCategory | "all">("all");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [selected, setSelected] = useState<IngredientDefinition | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing?: IngredientDefinition }>({
    open: false,
  });
  const [deleting, setDeleting] = useState<IngredientDefinition | null>(null);

  const visible = useMemo(
    () =>
      searchIngredients(definitions, query).filter(
        (d) =>
          (category === "all" || d.category === category) &&
          (origin === "all" || (origin === "builtin") === d.isBuiltin),
      ),
    [definitions, query, category, origin],
  );

  async function confirmDelete() {
    if (!deleting) return;
    const result = await services.ingredients.deleteCustom(deleting.id);
    if (result.ok) {
      toast.success(t("ingredients.toastDeleted"));
      setSelected(null);
      await reload();
    } else if (result.error === "in_use") {
      toast.error(t("ingredients.deleteInUse", { count: result.lotCount }));
    } else {
      toast.error(t("common.error"));
    }
    setDeleting(null);
  }

  return (
    <>
      <PageHeader
        title={t("ingredients.title")}
        description={t("ingredients.subtitle")}
        actions={
          <Button onClick={() => setForm({ open: true })}>
            <Plus />
            {t("ingredients.add")}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ingredients.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("ingredients.allCategories")}</SelectItem>
            {FOOD_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`category.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-lg bg-muted p-0.5 text-sm">
          {(["all", "builtin", "custom"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrigin(o)}
              className={cn(
                "rounded-md px-3 py-1.5",
                origin === o ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t(`ingredients.filter${o.charAt(0).toUpperCase()}${o.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title={t("ingredients.empty")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((d) => {
            const n = d.nutritionPer100g;
            return (
              <Card
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(d)}
                onKeyDown={(e) => e.key === "Enter" && setSelected(d)}
                className="cursor-pointer gap-0 p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <CategoryIcon category={d.category} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{nameOf(d)}</span>
                      {!d.isBuiltin && <Badge variant="outline">{t("ingredients.custom")}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[d.name.zhCN, d.name.enUS, d.name.jaJP]
                        .filter((x) => x && x !== nameOf(d))
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  {n ? (
                    <span className="tabular">
                      <span className="font-medium text-foreground">
                        {formatNumber(n.kcal, locale, 0)} kcal
                      </span>
                      {" · P "}
                      {formatNumber(n.proteinG, locale)}
                      {" · F "}
                      {formatNumber(n.fatG, locale)}
                      {" · C "}
                      {formatNumber(n.carbohydrateG, locale)}
                    </span>
                  ) : (
                    <span>{t("ingredients.noNutrition")}</span>
                  )}
                  {d.dataQuality === "demo" && n && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning-foreground">
                      {t("common.demoData")}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <IngredientDetailDialog
          definition={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setForm({ open: true, editing: selected });
            setSelected(null);
          }}
          onDelete={() => setDeleting(selected)}
        />
      )}

      <CustomIngredientDialog
        open={form.open}
        editing={form.editing}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        destructive
        title={t("ingredients.confirmDeleteTitle")}
        description={deleting ? t("ingredients.confirmDeleteBody", { name: nameOf(deleting) }) : ""}
        confirmLabel={t("common.delete")}
        onConfirm={confirmDelete}
      />
    </>
  );
}
