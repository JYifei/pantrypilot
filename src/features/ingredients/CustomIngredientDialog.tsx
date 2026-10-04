import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "@/app/appContext";
import { FormField } from "@/components/FormField";
import { SectionTitle } from "@/components/SectionTitle";
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
import { localize } from "@/domain/common/localizedText";
import {
  ANIMAL_SPECIES,
  CUTS_BY_SPECIES,
  FOOD_CATEGORIES,
  type AnimalSpecies,
} from "@/domain/ingredients/taxonomy";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import { NUTRIENTS } from "@/domain/nutrition/types";
import { nutrientUnitSymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  customFormToInput,
  customIngredientSchema,
  definitionToCustomForm,
  emptyCustomIngredientForm,
  type CustomIngredientFormValues,
} from "./customIngredientForm";

const NONE = "none";

export function CustomIngredientDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: IngredientDefinition;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("ingredients.formTitleEdit") : t("ingredients.formTitleNew")}
          </DialogTitle>
          <DialogDescription>{t("ingredients.formNutritionHint")}</DialogDescription>
        </DialogHeader>
        {open && (
          <CustomIngredientForm
            key={editing?.id ?? "new"}
            editing={editing}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomIngredientForm({
  editing,
  onDone,
}: {
  editing?: IngredientDefinition;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { services, reload, settings } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomIngredientFormValues>({
    resolver: zodResolver(customIngredientSchema),
    defaultValues: editing ? definitionToCustomForm(editing) : emptyCustomIngredientForm(),
  });
  const [category, species] = useWatch({ control, name: ["category", "species"] });

  const onSubmit = handleSubmit(async (values) => {
    const input = customFormToInput(values);
    try {
      if (editing) {
        await services.ingredients.updateCustom(editing.id, input);
        toast.success(t("ingredients.toastUpdated"));
      } else {
        await services.ingredients.createCustom(input);
        toast.success(
          t("ingredients.toastCreated", { name: localize(input.name, settings.language) }),
        );
      }
      await reload();
      onDone();
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  });

  const coreNutrients = NUTRIENTS.filter((n) => n.required || n.key === "fiberG");
  const moreNutrients = NUTRIENTS.filter((n) => !n.required && n.key !== "fiberG");

  const nutrientInput = (info: (typeof NUTRIENTS)[number]) => (
    <FormField
      key={info.key}
      label={`${t(`nutrient.${info.key}`)} (${nutrientUnitSymbol(info.unit)})`}
      htmlFor={`n-${info.key}`}
      error={errors.nutrition?.[info.key]?.message}
    >
      <Input
        id={`n-${info.key}`}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        {...register(`nutrition.${info.key}`)}
      />
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label={t("ingredients.formNameZh")}
          htmlFor="nameZh"
          error={errors.nameZh?.message}
        >
          <Input id="nameZh" autoFocus {...register("nameZh")} />
        </FormField>
        <FormField label={t("ingredients.formNameEn")} htmlFor="nameEn">
          <Input id="nameEn" {...register("nameEn")} />
        </FormField>
        <FormField label={t("ingredients.formNameJa")} htmlFor="nameJa">
          <Input id="nameJa" {...register("nameJa")} />
        </FormField>
      </div>
      <FormField label={t("ingredients.formAliases")} htmlFor="aliases">
        <Input id="aliases" {...register("aliases")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("ingredients.formCategory")}>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOOD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`category.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        {category === "meat" && (
          <>
            <FormField label={t("ingredients.formSpecies")}>
              <Controller
                control={control}
                name="species"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => {
                      field.onChange(v === NONE ? "" : v);
                      setValue("cut", "");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("common.none")}</SelectItem>
                      {ANIMAL_SPECIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`species.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            {species && (
              <FormField label={t("ingredients.formCut")}>
                <Controller
                  control={control}
                  name="cut"
                  render={({ field }) => (
                    <Select
                      value={field.value || NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("common.none")}</SelectItem>
                        {CUTS_BY_SPECIES[species as AnimalSpecies].map((c) => (
                          <SelectItem key={c} value={c}>
                            {t(`cut.${c}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}
          </>
        )}
      </div>

      <div>
        <SectionTitle>{t("ingredients.formShelfLife")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label={t("ingredients.formRefrigerated")}
            htmlFor="refrigeratedDays"
            error={errors.refrigeratedDays?.message}
          >
            <Input
              id="refrigeratedDays"
              type="number"
              min="0"
              step="1"
              {...register("refrigeratedDays")}
            />
          </FormField>
          <FormField
            label={t("ingredients.formFrozen")}
            htmlFor="frozenDays"
            error={errors.frozenDays?.message}
          >
            <Input id="frozenDays" type="number" min="0" step="1" {...register("frozenDays")} />
          </FormField>
        </div>
      </div>

      <div>
        <SectionTitle>{t("ingredients.formNutrition")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">{coreNutrients.map(nutrientInput)}</div>
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground">
              {t("ingredients.formMoreNutrients")}
              <ChevronDown
                className={cn("size-4 transition-transform", moreOpen && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 grid gap-4 sm:grid-cols-3">
            {moreNutrients.map(nutrientInput)}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
