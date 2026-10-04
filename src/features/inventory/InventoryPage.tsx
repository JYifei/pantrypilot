import { Plus, Refrigerator, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp, useIngredientName } from "@/app/appContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { normalizeSearchText, searchIngredients } from "@/domain/ingredients/search";
import { FOOD_CATEGORIES, type FoodCategory } from "@/domain/ingredients/taxonomy";
import { compareByExpiration } from "@/domain/inventory/expiration";
import type { InventoryLot } from "@/domain/inventory/types";
import { LotCard, type LotAction } from "./LotCard";
import { LotFormDialog } from "./LotFormDialog";
import { buildLotView, type LotView } from "./lotView";
import { QuantityDialog, type QuantityDialogMode } from "./QuantityDialog";
import { useLotActions } from "./useLotActions";

type SortKey = "expiration" | "recent" | "name";

export function InventoryPage() {
  const { t } = useTranslation();
  const nameOf = useIngredientName();
  const { lots, definitions, definitionsById, today } = useApp();
  const actions = useLotActions();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FoodCategory | "all">("all");
  const [sort, setSort] = useState<SortKey>("expiration");
  const [showDepleted, setShowDepleted] = useState(false);
  const [formDialog, setFormDialog] = useState<{ open: boolean; lot?: InventoryLot }>({
    open: false,
  });
  const [quantityDialog, setQuantityDialog] = useState<{
    view: LotView;
    mode: QuantityDialogMode;
  } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "discard"; view: LotView } | null>(
    null,
  );

  const views = useMemo(() => {
    const matchingDefinitionIds = query.trim()
      ? new Set(searchIngredients(definitions, query).map((d) => d.id))
      : null;
    const normalizedQuery = normalizeSearchText(query);

    const filtered = lots
      .map((lot) => buildLotView(lot, definitionsById, today))
      .filter((v) => showDepleted || !v.depleted)
      .filter((v) => category === "all" || v.definition?.category === category)
      .filter((v) => {
        if (!matchingDefinitionIds) return true;
        if (matchingDefinitionIds.has(v.lot.ingredientDefinitionId)) return true;
        return [v.lot.brand, v.lot.notes, v.lot.labelText].some(
          (text) => text && normalizeSearchText(text).includes(normalizedQuery),
        );
      });

    return filtered.sort((a, b) => {
      if (a.depleted !== b.depleted) return a.depleted ? 1 : -1;
      if (sort === "recent") return b.lot.createdAt.localeCompare(a.lot.createdAt);
      if (sort === "name") return nameOf(a.definition).localeCompare(nameOf(b.definition));
      return (
        compareByExpiration(a.lot, b.lot) ||
        nameOf(a.definition).localeCompare(nameOf(b.definition))
      );
    });
  }, [lots, definitions, definitionsById, today, query, category, sort, showDepleted, nameOf]);

  function handleAction(view: LotView, action: LotAction) {
    if (typeof action === "object") {
      void actions.setStorage(view.lot.id, action.storage);
      return;
    }
    switch (action) {
      case "consume":
      case "adjust":
        setQuantityDialog({ view, mode: action });
        break;
      case "edit":
        setFormDialog({ open: true, lot: view.lot });
        break;
      case "toggleOpened":
        void actions.setOpened(view.lot.id, !view.lot.opened);
        break;
      case "discard":
      case "delete":
        setConfirm({ kind: action, view });
        break;
    }
  }

  const hasAnyLots = lots.length > 0;

  return (
    <>
      <PageHeader
        title={t("inventory.title")}
        description={t("inventory.subtitle")}
        actions={
          <Button onClick={() => setFormDialog({ open: true })}>
            <Plus />
            {t("inventory.add")}
          </Button>
        }
      />

      {hasAnyLots && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("inventory.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("inventory.allCategories")}</SelectItem>
              {FOOD_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`category.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expiration">{t("inventory.sortExpiration")}</SelectItem>
              <SelectItem value="recent">{t("inventory.sortRecent")}</SelectItem>
              <SelectItem value="name">{t("inventory.sortName")}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showDepleted} onCheckedChange={setShowDepleted} />
            {t("inventory.showDepleted")}
          </label>
        </div>
      )}

      {!hasAnyLots ? (
        <EmptyState
          icon={Refrigerator}
          title={t("inventory.emptyAll")}
          description={t("inventory.emptyAllBody")}
          action={
            <Button onClick={() => setFormDialog({ open: true })}>
              <Plus />
              {t("inventory.add")}
            </Button>
          }
        />
      ) : views.length === 0 ? (
        <EmptyState icon={Search} title={t("inventory.empty")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {views.map((view) => (
            <LotCard
              key={view.lot.id}
              view={view}
              today={today}
              onAction={(action) => handleAction(view, action)}
            />
          ))}
        </div>
      )}

      <LotFormDialog
        open={formDialog.open}
        editingLot={formDialog.lot}
        onOpenChange={(open) => setFormDialog((s) => ({ ...s, open }))}
      />

      {quantityDialog && (
        <QuantityDialog
          view={quantityDialog.view}
          mode={quantityDialog.mode}
          onClose={() => setQuantityDialog(null)}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        destructive
        title={
          confirm?.kind === "delete"
            ? t("inventory.confirmDeleteTitle")
            : t("inventory.confirmDiscardTitle")
        }
        description={
          confirm
            ? t(
                confirm.kind === "delete"
                  ? "inventory.confirmDeleteBody"
                  : "inventory.confirmDiscardBody",
                { name: nameOf(confirm.view.definition) },
              )
            : ""
        }
        confirmLabel={
          confirm?.kind === "delete" ? t("inventory.actionDelete") : t("inventory.actionDiscard")
        }
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === "delete") await actions.remove(confirm.view.lot.id);
          else await actions.discard(confirm.view.lot.id);
          setConfirm(null);
        }}
      />
    </>
  );
}
