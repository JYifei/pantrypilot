import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Matches Chinese / Japanese characters. UI text must come from src/locales.
const CJK = "/[\\u3040-\\u30ff\\u3400-\\u9fff]/";

export default defineConfig([
  globalIgnores(["dist", "coverage", "src-tauri/target", "src-tauri/gen"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Guard rail for the i18n rule: no hard-coded CJK text in UI code.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx", "src/features/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXText[value=${CJK}]`,
          message: "Hard-coded CJK UI text. Use t() and src/locales instead.",
        },
        {
          selector: `Literal[value=${CJK}]`,
          message: "Hard-coded CJK UI text. Use t() and src/locales instead.",
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  prettier,
]);
