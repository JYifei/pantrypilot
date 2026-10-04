import { useEffect } from "react";
import type { ThemePreference } from "@/domain/settings/settings";

/** Toggle the `dark` class on <html> according to the preference (and the OS when "system"). */
export function useThemeEffect(theme: ThemePreference): void {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
