# ADR 0006: Chinese and Japanese UI only

Status: accepted (2026-10-30)

## Problem

The app had three UI languages, but its content only fits Japan: supermarket label parsing,
cuts and forms, default currency (JPY), the demo nutrition region (JP) and most recipes. The
English UI was complete but described a Japanese shopping context with English words, and it
had loose ends (no plurals: "about 1 pcs", "1 servings"). Keeping three languages complete also
made every UI change cost three translations.

## Decision

- UI languages are `zh-CN` (default) and `ja-JP`. Japanese wording is the reference for terms;
  Chinese is the reading language for the user. `en-US.json` is deleted.
- Built-in ingredient names, recipe text and demo data have Chinese and Japanese only. Latin
  search aliases (English words and romaji such as "misuji") were removed with them.
- The multi-language mechanism stays: `SUPPORTED_LOCALES`, i18next resources, and the optional
  `enUS` slot in `LocalizedText`. Custom ingredients and recipes that already have English keep
  it through edits, and backups containing it still import.
- A stored or imported `language: "en-US"` becomes the default language (Chinese) instead of
  being rejected.
- Lists in running text use the enumeration comma "、" (`formatList`).
- Built-in data versions were bumped so existing databases re-seed without English.

## Alternatives considered

- **Hide English but keep its files.** Reversible with one line, but the files would drift and
  still look supported.
- **Keep three languages and add plural rules.** Fixes the English text, not the mismatch
  between an English UI and Japan-only content.

## Costs

- English speakers cannot use the app. Adding English back needs a new locale file and English
  names for all built-in data.
- Cooking records made before this change keep their English name snapshot; it is not shown.
- Search no longer finds built-in foods by English names or romaji.
