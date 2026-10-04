import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of pill buttons for picking one value (or none, when `allowDeselect`).
 * Friendlier than a <select> for short vocabularies like cuts and forms.
 */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  allowDeselect = false,
  ariaLabel,
}: {
  options: readonly ChoiceOption<T>[];
  value: T | "" | undefined;
  onChange: (value: T | "") => void;
  allowDeselect?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected && allowDeselect ? "" : option.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/50 hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
