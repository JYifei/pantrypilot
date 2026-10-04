import {
  Apple,
  Beef,
  CookingPot,
  Droplet,
  Egg,
  Fish,
  LeafyGreen,
  Milk,
  Package,
  Shell,
  Soup,
  Sprout,
  Square,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { FoodCategory } from "@/domain/ingredients/taxonomy";
import { cn } from "@/lib/utils";

const ICONS: Record<FoodCategory, LucideIcon> = {
  meat: Beef,
  fish: Fish,
  seafood: Shell,
  egg: Egg,
  tofu: Square,
  vegetable: LeafyGreen,
  mushroom: Sprout,
  fruit: Apple,
  grain: Wheat,
  noodle: Soup,
  dairy: Milk,
  seasoning: Droplet,
  prepared_food: CookingPot,
  other: Package,
};

const TONES: Partial<Record<FoodCategory, string>> = {
  meat: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  fish: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  seafood: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  egg: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  tofu: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  vegetable: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  mushroom: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  grain: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  noodle: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  dairy: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

export function CategoryIcon({
  category,
  className,
}: {
  category: FoodCategory;
  className?: string;
}) {
  const Icon = ICONS[category];
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        TONES[category] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}
