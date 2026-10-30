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
- The app has two UI languages: `zh-CN` (default) and `ja-JP`. Japanese wording is the reference
  for terms (supermarket labels, dish names); Chinese is the reading language. Both files must
  contain every key with the same `{{placeholders}}`; add both in the same change.
- Tests check key parity in both directions, placeholder consistency and that every literal
  `t("…")` key exists. Missing keys fall back to Chinese at runtime.
- Food names live in data (`LocalizedText { zhCN, jaJP?, enUS? }`), not in locale files. Built-in
  data has Chinese and Japanese only; `enUS` stays in the type so older backups still load.
- Adding a language back means a locale file, an entry in `SUPPORTED_LOCALES`, a slot in
  `LocalizedText` and translations for the built-in data.

## Database changes

1. Add a new file `src/db/migrations/000N_description.sql`. Never edit a released migration.
2. Register it in `src/db/migrations/index.ts` **and** in `src-tauri/src/lib.rs`
   (both read the same SQL file).
3. If the change affects backups, bump `schemaVersion` in `src/domain/backup/backup.ts` and add
   a step to `BACKUP_MIGRATIONS`.

### Verifying a migration

- `pnpm test` applies all migrations to an in-memory sql.js database. Add an upgrade test that
  creates a database at the previous version, writes data, applies the new migration and checks
  the old data survives (see the v4 → v5 test in `src/services/plan.integration.test.ts`).
- `cargo test --manifest-path src-tauri/Cargo.toml` runs the SQL compiled into the app, in
  order, on real SQLite; extend the test in `src-tauri/src/lib.rs` with the new constraints.
- `git diff` on released migration files must be empty.
- On the desktop, **copy your database first** (`%APPDATA%\dev.pantrypilot.desktop\pantrypilot.db`
  and its `-wal` / `-shm` files), then run `pnpm tauri dev`: the plugin applies the new
  migration at startup. Restore the copy if you want to go back; an applied migration cannot be
  rolled back.

## Adding an ingredient or recipe

- **Ingredient:** add a definition to `src/data/builtinIngredients.ts` with a new stable
  snake_case ID, Chinese and Japanese names, aliases (Japanese supermarket wording, kana)
  and nutrition per 100 g edible portion marked `dataQuality: "demo"` unless it comes from a
  cited source. Then bump `BUILTIN_DATASET_VERSION` in `src/data/nutritionSources.ts` so existing
  databases re-seed. Released IDs must never change: lots, recipes and backups refer to them.
- **Recipe:** add it to `src/data/builtinRecipes.ts` with a stable `recipe_…` ID, amounts in
  edible grams for the base servings, seasonings as text, and names and steps in Chinese
  and Japanese. Bump `BUILTIN_RECIPES_VERSION` in the same file.
- `pnpm test` checks IDs, translations, schema validity and ingredient references. Open the
  recipe in the app and check the match against the demo data.
- Personal recipes and foods belong in the app (custom recipes and ingredients), not in the repo.

## Running the demo

`pnpm dev` starts the browser preview, which stores its data in `localStorage` and never touches
the desktop database. **Settings → Load sample data** replaces the preview's data with made-up
inventory, cooking records and pre-V0.3 deductions dated relative to today; loading it again
resets the demo. A good walk-through: Dashboard → Recipes (open 亲子丼 / Oyakodon) → add it and
牛丼 / Gyudon to the plan → Plan & shopping (onion gap 150 g) → Cook this → Cooking log. Never
use your own inventory or backups for screenshots or examples.

## Versions

The app version appears in `package.json`, `src/config/app.ts`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`. Change all four together; `src/config/versions.test.ts` fails otherwise.
Feature milestones (V0.3, V0.4) are not release versions.

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
