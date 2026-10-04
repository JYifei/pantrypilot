import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ScanText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ChoiceChips } from "@/components/ChoiceChips";
import { FormField } from "@/components/FormField";
import { SectionTitle } from "@/components/SectionTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isValidIsoDate } from "@/domain/common/dates";
import { parseJapaneseMeatLabel } from "@/domain/ingredients/japaneseLabels";
import { resolveDefinitionForCut } from "@/domain/ingredients/resolve";
import { searchIngredients } from "@/domain/ingredients/search";
import {
  ANIMAL_SPECIES,
  COUNT_UNITS,
  CUTS_BY_SPECIES,
  PROCESSING_TYPES,
  STORAGE_TYPES,
  defaultStorageForCategory,
  suggestedFormsForCategory,
  type AnimalSpecies,
  type MeatCut,
} from "@/domain/ingredients/taxonomy";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import { suggestExpirationDate } from "@/domain/inventory/lotOperations";
import type { InventoryLot } from "@/domain/inventory/types";
import { convertToGrams } from "@/domain/inventory/units";
import { CURRENCIES } from "@/domain/settings/settings";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  emptyLotForm,
  formValuesToLotInput,
  lotFormSchema,
  lotToFormValues,
  type LotFormValues,
} from "./lotForm";

const NO_CUT = "unspecified";

/** Foods offered as one-click picks when the search box is empty. */
const QUICK_PICK_IDS = [
  "salmon_atlantic_raw",
  "egg_whole",
  "tofu_momen",
  "komatsuna_raw",
  "onion_raw",
  "green_pepper_raw",
  "shimeji_raw",
  "rice_white_raw",
];

/**
 * The "Add food" flow (also used for editing). Ordered like a shopper thinks:
 * food → cut → supermarket form → quantity → storage and dates. Only food
 * and quantity are required; everything advanced is collapsed.
 */
export function LotFormDialog({
  open,
  onOpenChange,
  editingLot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLot?: InventoryLot;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingLot ? t("addFood.titleEdit") : t("addFood.titleAdd")}</DialogTitle>
          <DialogDescription>{t("addFood.description")}</DialogDescription>
        </DialogHeader>
        {open && (
          <LotFormBody
            key={editingLot?.id ?? "new"}
            editingLot={editingLot}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LotFormBody({ editingLot, onDone }: { editingLot?: InventoryLot; onDone: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { definitions, definitionsById, settings, today, services, reload } = useApp();
  const mode = editingLot ? "edit" : "add";

  const form = useForm<LotFormValues>({
    resolver: zodResolver(lotFormSchema),
    defaultValues: editingLot
      ? lotToFormValues(editingLot, settings.currency)
      : emptyLotForm({ currency: settings.currency, today }),
  });
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = form;

  const [definitionId, cut, quantityMode, count, unit, storage, purchaseDate, expirationDate] =
    useWatch({
      control,
      name: [
        "ingredientDefinitionId",
        "cut",
        "quantityMode",
        "count",
        "unit",
        "storage",
        "purchaseDate",
        "expirationDate",
      ],
    });
  const definition = definitionsById.get(definitionId);
  const [species, setSpecies] = useState<AnimalSpecies | null>(definition?.animalSpecies ?? null);
  const [query, setQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(mode === "edit");

  const results = useMemo(
    () => (query.trim() ? searchIngredients(definitions, query).slice(0, 8) : []),
    [definitions, query],
  );
  const quickPicks = QUICK_PICK_IDS.map((id) => definitionsById.get(id)).filter(
    (d): d is IngredientDefinition => d !== undefined,
  );

  function applyDefaults(next: IngredientDefinition | undefined) {
    if (next && mode === "add") {
      setValue("storage", defaultStorageForCategory(next.category));
    }
  }

  function selectDefinition(next: IngredientDefinition) {
    setValue("ingredientDefinitionId", next.id, { shouldValidate: true });
    setValue("cut", next.anatomicalCut ?? "");
    setSpecies(next.animalSpecies ?? null);
    applyDefaults(next);
    setQuery("");
  }

  function selectSpecies(next: AnimalSpecies) {
    const resolved = resolveDefinitionForCut(definitions, next, undefined);
    setSpecies(next);
    setValue("cut", "");
    if (resolved) setValue("ingredientDefinitionId", resolved.id, { shouldValidate: true });
    applyDefaults(resolved);
    setQuery("");
  }

  function selectCut(next: MeatCut | "") {
    if (!species) return;
    setValue("cut", next);
    const resolved = resolveDefinitionForCut(definitions, species, next || undefined);
    if (resolved) setValue("ingredientDefinitionId", resolved.id, { shouldValidate: true });
  }

  function clearSelection() {
    setValue("ingredientDefinitionId", "");
    setValue("cut", "");
    setSpecies(null);
  }

  function parseLabel() {
    const parsed = parseJapaneseMeatLabel(form.getValues("labelText"));
    if (!parsed.species && !parsed.cut && !parsed.form) {
      toast.info(t("addFood.parseFailed"));
      return;
    }
    const targetSpecies = parsed.species ?? species ?? definition?.animalSpecies;
    if (targetSpecies) {
      setSpecies(targetSpecies);
      setValue("cut", parsed.cut ?? "");
      const resolved = resolveDefinitionForCut(definitions, targetSpecies, parsed.cut);
      if (resolved) setValue("ingredientDefinitionId", resolved.id, { shouldValidate: true });
    }
    if (parsed.form) setValue("form", parsed.form);
    toast.success(t("addFood.parsedLabel"));
  }

  const suggestion = suggestExpirationDate(
    definition,
    storage,
    isValidIsoDate(purchaseDate) ? purchaseDate : today,
  );

  const countNumber = Number(count);
  const estimate =
    quantityMode === "count" && unit && count.trim() !== "" && Number.isFinite(countNumber)
      ? convertToGrams(countNumber, unit, definition?.defaultUnitConversions)
      : null;

  const cutFallback =
    species && cut && definition && definition.anatomicalCut !== cut ? definition : undefined;

  const onSubmit = handleSubmit(async (values) => {
    const input = formValuesToLotInput(values, mode);
    try {
      if (editingLot) await services.inventory.updateLot(editingLot.id, input);
      else await services.inventory.addLot(input);
      await reload();
      toast.success(
        editingLot
          ? t("inventory.toastUpdated")
          : t("inventory.toastAdded", {
              name: nameOf(definitionsById.get(input.ingredientDefinitionId)),
            }),
      );
      onDone();
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
      {/* 1. Food */}
      <section>
        <SectionTitle>{t("addFood.stepFood")}</SectionTitle>
        {definition ? (
          <div className="flex items-center gap-3 rounded-xl border bg-accent/40 p-3">
            <CategoryIcon category={definition.category} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {species ? t(`species.${species}`) : nameOf(definition)}
              </div>
              <div className="text-sm text-muted-foreground">
                {species ? nameOf(definition) : t(`category.${definition.category}`)}
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              <X />
              {t("common.change")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("addFood.searchPlaceholder")}
                className="pl-9"
              />
            </div>
            {query.trim() ? (
              results.length > 0 ? (
                <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
                  {results.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => selectDefinition(d)}
                      className="flex items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                    >
                      <CategoryIcon category={d.category} className="size-8" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{nameOf(d)}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[d.name.zhCN, d.name.enUS, d.name.jaJP]
                            .filter((n) => n && n !== nameOf(d))
                            .join(" · ")}
                        </div>
                      </div>
                      <Badge variant="secondary">{t(`category.${d.category}`)}</Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("addFood.noResults")}</p>
              )
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">{t("addFood.quickPick")}</span>
                <div className="flex flex-wrap gap-2">
                  {ANIMAL_SPECIES.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => selectSpecies(s)}
                    >
                      {t(`species.${s}`)}
                    </Button>
                  ))}
                  {quickPicks.map((d) => (
                    <Button
                      key={d.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => selectDefinition(d)}
                    >
                      {nameOf(d)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {errors.ingredientDefinitionId?.message && (
              <p className="text-xs text-destructive">{t(errors.ingredientDefinitionId.message)}</p>
            )}
          </div>
        )}
      </section>

      {/* 2. Cut (meat only) */}
      {species && (
        <section>
          <SectionTitle>{t("addFood.stepCut")}</SectionTitle>
          <ChoiceChips
            ariaLabel={t("addFood.stepCut")}
            value={cut || NO_CUT}
            onChange={(value) => selectCut(value === NO_CUT ? "" : (value as MeatCut))}
            options={[
              { value: NO_CUT, label: t("cut.unspecified") },
              ...CUTS_BY_SPECIES[species].map((c) => ({ value: c, label: t(`cut.${c}`) })),
            ]}
          />
          {cutFallback && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("addFood.cutFallbackHint", { name: nameOf(cutFallback) })}
            </p>
          )}
        </section>
      )}

      {/* 3. Form */}
      {definition && (
        <section>
          <SectionTitle>{t("addFood.stepForm")}</SectionTitle>
          <Controller
            control={control}
            name="form"
            render={({ field }) => (
              <ChoiceChips
                ariaLabel={t("addFood.stepForm")}
                allowDeselect
                value={field.value}
                onChange={field.onChange}
                options={suggestedFormsForCategory(definition.category).map((f) => ({
                  value: f,
                  label: t(`form.${f}`),
                }))}
              />
            )}
          />
        </section>
      )}

      {/* 4. Quantity */}
      <section>
        <SectionTitle
          aside={
            <Controller
              control={control}
              name="quantityMode"
              render={({ field }) => (
                <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                  {(["weight", "count"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => field.onChange(m)}
                      className={cn(
                        "rounded-md px-3 py-1",
                        field.value === m ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {m === "weight" ? t("addFood.byWeight") : t("addFood.byCount")}
                    </button>
                  ))}
                </div>
              )}
            />
          }
        >
          {t("addFood.stepQuantity")}
        </SectionTitle>
        {quantityMode === "weight" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={mode === "edit" ? t("addFood.originalWeight") : t("addFood.weight")}
              htmlFor="weightG"
              error={errors.weightG?.message}
            >
              <Input
                id="weightG"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                autoFocus={mode === "add" && !!definition}
                {...register("weightG")}
              />
            </FormField>
            {mode === "edit" && (
              <FormField
                label={t("addFood.remainingWeight")}
                htmlFor="remainingWeightG"
                error={errors.remainingWeightG?.message}
              >
                <Input
                  id="remainingWeightG"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  {...register("remainingWeightG")}
                />
              </FormField>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("addFood.count")} htmlFor="count" error={errors.count?.message}>
              <Input
                id="count"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                {...register("count")}
              />
            </FormField>
            <FormField label={t("addFood.unit")} error={errors.unit?.message}>
              <Controller
                control={control}
                name="unit"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNT_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {t(`unit.${u}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            {count.trim() !== "" && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {estimate
                  ? t("addFood.estimate", {
                      grams: formatNumber(estimate.grams, locale, 0),
                      confidence: t(`confidence.${estimate.confidence}`),
                    })
                  : t("addFood.noEstimate")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 5. Storage and dates */}
      <section className="flex flex-col gap-4">
        <SectionTitle>{t("addFood.stepDetails")}</SectionTitle>
        <Controller
          control={control}
          name="storage"
          render={({ field }) => (
            <ChoiceChips
              ariaLabel={t("addFood.storage")}
              value={field.value}
              onChange={(v) => v && field.onChange(v)}
              options={STORAGE_TYPES.map((s) => ({ value: s, label: t(`storage.${s}`) }))}
            />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("addFood.purchaseDate")}
            htmlFor="purchaseDate"
            error={errors.purchaseDate?.message}
          >
            <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
          </FormField>
          <FormField
            label={t("addFood.expirationDate")}
            htmlFor="expirationDate"
            error={errors.expirationDate?.message}
            hint={
              suggestion && suggestion !== expirationDate ? (
                <span>
                  {t("addFood.suggestion", { date: formatDate(suggestion, locale, today) })}{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setValue("expirationDate", suggestion, { shouldValidate: true })}
                  >
                    {t("addFood.useSuggestion")}
                  </button>
                </span>
              ) : undefined
            }
          >
            <Input id="expirationDate" type="date" {...register("expirationDate")} />
          </FormField>
          <FormField label={t("addFood.price")} htmlFor="price" error={errors.price?.message}>
            <div className="flex gap-2">
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="flex-1"
                {...register("price")}
              />
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-24" aria-label={t("addFood.currency")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </FormField>
        </div>
      </section>

      {/* Advanced */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg py-1 text-sm font-semibold text-foreground/80"
          >
            {t("addFood.advanced")}
            <ChevronDown
              className={cn("size-4 transition-transform", advancedOpen && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 flex flex-col gap-4">
          <FormField label={t("addFood.labelText")} htmlFor="labelText">
            <div className="flex gap-2">
              <Input
                id="labelText"
                placeholder={t("addFood.labelTextPlaceholder")}
                className="flex-1"
                {...register("labelText")}
              />
              <Button type="button" variant="outline" onClick={parseLabel}>
                <ScanText />
                {t("addFood.parseLabel")}
              </Button>
            </div>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t("addFood.thickness")}
              htmlFor="thicknessMm"
              error={errors.thicknessMm?.message}
            >
              <Input
                id="thicknessMm"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                {...register("thicknessMm")}
              />
            </FormField>
            <FormField
              label={t("addFood.fatPercent")}
              htmlFor="fatPercent"
              error={errors.fatPercent?.message}
            >
              <Input
                id="fatPercent"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                max="100"
                {...register("fatPercent")}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-6">
            {(["boneIn", "skinOn", "opened"] as const).map((name) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                    {t(`addFood.${name}`)}
                  </label>
                )}
              />
            ))}
          </div>
          <FormField label={t("addFood.processing")}>
            <Controller
              control={control}
              name="processing"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {PROCESSING_TYPES.map((p) => {
                    const selected = field.value.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          field.onChange(
                            selected ? field.value.filter((v) => v !== p) : [...field.value, p],
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "hover:bg-accent",
                        )}
                      >
                        {t(`processing.${p}`)}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </FormField>
          <FormField label={t("addFood.brand")} htmlFor="brand">
            <Input id="brand" {...register("brand")} />
          </FormField>
          <FormField label={t("addFood.notes")} htmlFor="notes">
            <Textarea id="notes" rows={2} {...register("notes")} />
          </FormField>
        </CollapsibleContent>
      </Collapsible>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {mode === "edit" ? t("addFood.submitEdit") : t("addFood.submitAdd")}
        </Button>
      </DialogFooter>
    </form>
  );
}
