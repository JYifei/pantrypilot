import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { LocaleCode } from "@/domain/common/localizedText";
import enUS from "@/locales/en-US.json";
import jaJP from "@/locales/ja-JP.json";
import zhCN from "@/locales/zh-CN.json";

/**
 * All visible UI text comes from src/locales. zh-CN is the primary, complete
 * locale. Missing keys fall back to English, then Chinese.
 * Ingredient names are data (LocalizedText), not UI strings — see localize().
 */
export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
    "ja-JP": { translation: jaJP },
  },
  lng: "zh-CN" satisfies LocaleCode,
  fallbackLng: {
    "en-US": ["zh-CN"],
    "ja-JP": ["en-US", "zh-CN"],
    default: ["zh-CN"],
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
