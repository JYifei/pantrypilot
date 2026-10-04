# Contributing

Thanks for helping. PantryPilot is small and opinionated; these notes keep it that way.

## Ground rules

- **Local-first.** No backend, cloud database, auth, analytics, telemetry or external API calls.
- **No fabricated authority.** Never add nutrition numbers that look official without a real,
  cited source. Mark approximations with `dataQuality: "demo"`.
- **Unknown ≠ 0.** Missing nutrients are omitted/`null`, never stored as zero.
- **No medical advice.** Do not add diet targets, recommended intakes or health claims.

## Workflow

```bash
pnpm install
pnpm tauri dev        # or `pnpm dev` for the browser preview
pnpm check            # run before every commit: typecheck, lint, format, tests
```

Keep commits focused. Add or update tests for any change in `src/domain`, `src/services` or
`src/repositories`.

## Code conventions

- TypeScript strict mode, including `noUncheckedIndexedAccess`.
- **Layering** (see ARCHITECTURE.md): components → services → repositories → database.
  React components must not contain SQL or call repositories directly.
- **Pure domain code.** `src/domain` has no React, no I/O and no `Date.now()` — pass a clock.
- **IDs.** Built-in records use stable snake_case IDs (`beef_misuji_raw`) that must never change
  once released. User records use UUID v4.
- **Japanese supermarket labels** (`ミスジ`, `焼肉用`…) are parsed into canonical enums in
  `src/domain/ingredients/japaneseLabels.ts`. Business logic only uses the enums.

## Internationalisation

- All UI text goes through i18next. ESLint rejects CJK string literals in `src/app`,
  `src/components` and `src/features`.
- `src/locales/zh-CN.json` is the reference: every key must exist there. `en-US` must be
  complete; `ja-JP` may lag behind (falls back to English, then Chinese).
- Tests check key parity, placeholder consistency and that every literal `t("…")` key exists.
- Food names live in data (`LocalizedText { zhCN, enUS?, jaJP? }`), not in locale files.

## Database changes

1. Add a new file `src/db/migrations/000N_description.sql`. Never edit a released migration.
2. Register it in `src/db/migrations/index.ts` **and** in `src-tauri/src/lib.rs`
   (both read the same SQL file).
3. If the change affects backups, bump `schemaVersion` in `src/domain/backup/backup.ts` and add
   a step to `BACKUP_MIGRATIONS`.

## Built-in data

Built-in ingredients are in `src/data/builtinIngredients.ts`. When you change them, bump
`BUILTIN_DATASET_VERSION` in `src/data/nutritionSources.ts` so existing databases re-seed.

## Renaming the project

"PantryPilot" is a working name. To rename:

1. `src/config/app.ts` — display name, backup format tag, storage keys.
2. Locale files — `app.name` and any text mentioning the name.
3. `package.json` `name`, `index.html` `<title>`.
4. `src-tauri/tauri.conf.json` — `productName`, window `title`, and (only before a public
   release) `identifier`. Changing the identifier moves the data directory.
5. `src-tauri/Cargo.toml` — package and lib names; update `src-tauri/src/main.rs` accordingly.
6. The database file name (`pantrypilot.db`) is in `src/config/app.ts` and
   `src-tauri/src/lib.rs`; renaming it orphans existing data unless you migrate the file.
