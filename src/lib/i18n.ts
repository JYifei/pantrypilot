import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { LocaleCode } from "@/domain/common/localizedText";
import jaJP from "@/locales/ja-JP.json";
import zhCN from "@/locales/zh-CN.json";

/**
 * All visible UI text comes from src/locales. ja-JP and zh-CN must both be
 * complete; zh-CN is the default and the fallback.
 * Ingredient names are data (LocalizedText), not UI strings — see localize().
 */
export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "ja-JP": { translation: jaJP },
  },
  lng: "zh-CN" satisfies LocaleCode,
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
