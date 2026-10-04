import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useMemo } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp, useIngredientName, useLocale } from "@/app/appContext";
import { FormField } from "@/components/FormField";
import { SectionTitle } from "@/components/SectionTitle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FOOD_CATEGORIES } from "@/domain/ingredients/taxonomy";
import type { Recipe } from "@/domain/recipes/types";
import {
  emptyRecipeForm,
  emptyRecipeLine,
  formValuesToRecipeInput,
  recipeFormSchema,
  recipeToFormValues,
  type RecipeFormValues,
} from "./recipeForm";

export function RecipeFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Recipe;
  onSaved?: (recipe: Recipe) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("recipes.formTitleEdit") : t("recipes.formTitleNew")}
          </DialogTitle>
        </DialogHeader>
        {open && (
          <RecipeForm
            key={editing?.id ?? "new"}
            editing={editing}
            onDone={(saved) => {
              onOpenChange(false);
              if (saved) onSaved?.(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipeForm({ editing, onDone }: { editing?: Recipe; onDone: (saved?: Recipe) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const nameOf = useIngredientName();
  const { services, reload, definitions, definitionsById } = useApp();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: editing ? recipeToFormValues(editing, locale) : emptyRecipeForm(),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "ingredients" });
  const lines = useWatch({ control, name: "ingredients" });

  const grouped = useMemo(
    () =>
      FOOD_CATEGORIES.map((category) => ({
        category,
        items: definitions
          .filter((d) => d.category === category)
          .sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale)),
      })).filter((g) => g.items.length > 0),
    [definitions, nameOf, locale],
  );

  const onSubmit = handleSubmit(async (values) => {
    const input = formValuesToRecipeInput(values, locale, definitionsById, editing);
    try {
      const saved = editing
        ? await services.recipes.updateCustom(editing.id, input)
        : await services.recipes.createCustom(input);
      toast.success(editing ? t("recipes.toastUpdated") : t("recipes.toastCreated"));
      await reload();
      onDone(saved);
    } catch (error) {
      console.error(error);
      toast.error(t("common.error"), { description: String(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <FormField label={t("recipes.formName")} htmlFor="recipe-name" error={errors.name?.message}>
        <Input id="recipe-name" autoFocus {...register("name")} />
      </FormField>
      <FormField label={t("recipes.formDescription")} htmlFor="recipe-description">
        <Input id="recipe-description" {...register("description")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("recipes.formServings")}
          htmlFor="recipe-servings"
          error={errors.servings?.message}
        >
          <Input id="recipe-servings" type="number" min="1" step="1" {...register("servings")} />
        </FormField>
        <FormField
          label={t("recipes.formTime")}
          htmlFor="recipe-time"
          error={errors.timeMinutes?.message}
        >
          <Input id="recipe-time" type="number" min="0" step="1" {...register("timeMinutes")} />
        </FormField>
      </div>

      <section>
        <SectionTitle>{t("recipes.formIngredients")}</SectionTitle>
        <p className="mb-3 text-xs text-muted-foreground">{t("recipes.formIngredientsHint")}</p>
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => {
            const lineErrors = errors.ingredients?.[index];
            const selected = definitionsById.get(lines[index]?.ingredientId ?? "");
            return (
              <div key={field.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_8rem]">
                    <FormField
                      label={t("recipes.formIngredient")}
                      error={lineErrors?.ingredientId?.message}
                    >
                      <Controller
                        control={control}
                        name={`ingredients.${index}.ingredientId`}
                        render={({ field: f }) => (
                          <Select value={f.value || undefined} onValueChange={f.onChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t("recipes.chooseIngredient")} />
                            </SelectTrigger>
                            <SelectContent>
                              {grouped.map((group) => (
                                <SelectGroup key={group.category}>
                                  <SelectLabel>{t(`category.${group.category}`)}</SelectLabel>
                                  {group.items.map((d) => (
                                    <SelectItem key={d.id} value={d.id}>
                                      {nameOf(d)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FormField>
                    <FormField
                      label={t("recipes.formGrams")}
                      htmlFor={`grams-${index}`}
                      error={lineErrors?.grams?.message}
                    >
                      <Input
                        id={`grams-${index}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        {...register(`ingredients.${index}.grams`)}
                      />
                    </FormField>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    aria-label={t("common.remove")}
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                  >
                    <X />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Controller
                      control={control}
                      name={`ingredients.${index}.optional`}
                      render={({ field: f }) => (
                        <Switch checked={f.value} onCheckedChange={f.onChange} />
                      )}
                    />
                    {t("common.optional")}
                  </label>
                  {selected?.animalSpecies && (
                    <label className="flex items-center gap-2">
                      <Controller
                        control={control}
                        name={`ingredients.${index}.anySpecies`}
                        render={({ field: f }) => (
                          <Switch checked={f.value} onCheckedChange={f.onChange} />
                        )}
                      />
                      {t("recipes.anyCut", { species: t(`species.${selected.animalSpecies}`) })}
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {errors.ingredients?.root?.message && (
          <p className="mt-2 text-sm text-destructive">{t(errors.ingredients.root.message)}</p>
        )}
        {errors.ingredients?.message && (
          <p className="mt-2 text-sm text-destructive">{t(errors.ingredients.message)}</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => append(emptyRecipeLine(fields.length))}
        >
          <Plus />
          {t("recipes.formAddIngredient")}
        </Button>
      </section>

      <FormField label={t("recipes.formSeasonings")} htmlFor="recipe-seasonings">
        <Input id="recipe-seasonings" {...register("seasonings")} />
      </FormField>
      <FormField label={t("recipes.formSteps")} htmlFor="recipe-steps">
        <Textarea id="recipe-steps" rows={6} {...register("steps")} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
