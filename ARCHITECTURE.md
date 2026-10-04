# Architecture

## Overview

PantryPilot is a single-user desktop app. There is no server: a Tauri 2 shell hosts a React
front-end, and all data lives in one SQLite file on the user's machine.

```
React UI (src/app, src/features, src/components)
        │  calls
        ▼
Services (src/services)          ← use cases, validation, transactions
        │  calls
        ▼
Repositories (src/repositories)  ← interfaces + SQLite implementations
        │  SqlDatabase interface
        ▼
Database adapter (src/db)        ← Tauri SQL plugin (desktop) | sql.js (tests, browser preview)

Domain (src/domain)  — pure types and functions, used by every layer above
```

## Tech stack

Tauri 2 · React 19 · TypeScript (strict) · Vite · SQLite (`tauri-plugin-sql`) · Tailwind CSS 4 ·
shadcn/ui (Radix) · Lucide · React Hook Form + Zod · i18next · Vitest · pnpm.

## Directory layout

| Path               | Contents                                                            |
| ------------------ | ------------------------------------------------------------------- |
| `src/domain`       | Pure model + logic: taxonomy, nutrition, inventory, recipes, backup |
| `src/data`         | Built-in ingredient definitions, recipes and nutrition source data  |
| `src/db`           | `SqlDatabase` interface, adapters, SQL migrations                   |
| `src/repositories` | Repository interfaces and SQLite implementations                    |
| `src/services`     | Application services, seeding, heuristic scores                     |
| `src/app`          | Boot, global state (`AppProvider`), shell and navigation            |
| `src/features/*`   | One folder per screen: dashboard, inventory, recipes, nutrition, …  |
| `src/components`   | Shared UI; `components/ui` is generated shadcn/ui                   |
| `src/locales`      | `zh-CN.json` (reference), `en-US.json`, `ja-JP.json`                |
| `src/lib`          | i18n setup, formatting, file save/open helpers                      |
| `src-tauri`        | Rust shell: plugin registration, migrations, capabilities           |

## Domain model

### Ingredient taxonomy: three separate concepts

| Concept                  | Example                   | Stored in                |
| ------------------------ | ------------------------- | ------------------------ |
| **IngredientDefinition** | beef misuji (raw)         | `ingredient_definitions` |
| **ProductForm**          | steak, yakiniku slices    | enum on the lot          |
| **InventoryLot**         | 251 g, 35 mm, bought 10/4 | `inventory_lots`         |

A definition is a _nutrition identity_: two cuts with different nutrition are different
definitions (`beef_misuji_raw`, `beef_sirloin_raw`). The form describes how it was cut or
packaged and does not change nutrition per 100 g. A lot is one physical package you own.

Species, cuts, forms, processing types, storage types and units are TypeScript `as const`
enums in `src/domain/ingredients/taxonomy.ts`. Japanese supermarket wording is mapped to these
enums in `japaneseLabels.ts` (species-aware, longest match first) and is only an input aid.

Names are `LocalizedText { zhCN; enUS?; jaJP? }` with aliases. Search normalises with NFKC,
lower-case and katakana→hiragana, and ranks exact > prefix > substring matches.

### Nutrition

- `NutritionFacts` are per **100 g edible portion**. Core macros (kcal, protein, fat,
  carbohydrate) are required when any value is present; others are optional.
- A missing value means **unknown**, never zero. `calculateNutritionForWeight` and
  `sumNutrition` propagate this: a total is reported with known/unknown item counts and flagged
  as a lower bound when partial.
- Each definition points to a `NutritionSource` (name, region, version, notes) and has a
  `dataQuality` of `demo`, `reference` or `user`. Multiple regional datasets can coexist.
- `calculateInventoryNutrition` applies the edible ratio only for bone-in / whole items.
- `src/services/nutritionScore.ts` derives experimental 1–10 scores at render time. They are
  never persisted and are labelled as heuristics.

### Inventory and transactions

`InventoryLot` tracks weight (g), count, or both (count with an estimated gram conversion).
Operations in `lotOperations.ts` are pure and return `{ ok, lot, transaction } | { ok: false,
error }`: consume, adjust, discard, mark opened, change storage, freeze. Remaining amounts are
clamped at zero and over-consumption is an error, not a silent clamp.

Each operation produces an `InventoryTransaction` (`add | consume | adjust | discard`), giving an
audit trail. Consumption from cooking carries the `recipeId`, which is the basis for a future
meal log.

Expiration status (`expired / today / tomorrow / soon / normal / unknown`) is computed from an
injected "today", never stored.

### Recipes

A `Recipe` has localised name, description, steps and seasonings, a base `servings` count and a
list of `RecipeIngredient` lines. Each line references an ingredient definition with an amount
in edible grams for the base servings, and may be:

- `optional` — not required for the recipe to count as ready;
- given `alternatives` — other definitions that also satisfy the line, with an optional
  `ratio` (e.g. cooked rice can be replaced by `0.45 ×` its weight in raw rice);
- `anySpecies` — any definition of that animal species matches (a misuji steak satisfies a
  sirloin steak recipe).

Seasonings are plain localised text and are deliberately not matched against inventory.

`src/domain/recipes/matching.ts` is pure:

- `matchRecipe` scales the lines to the requested servings and collects candidate lots per line
  (expired and depleted lots excluded), giving each line a status of `enough` (with a 5 %
  tolerance), `partial` or `missing`.
- Readiness is `ready` when every required line is enough, `almost` when 1–2 required lines are
  short and at least one has stock, otherwise `missing`. An urgency score rewards recipes that
  use lots expiring today, tomorrow or within a few days; `compareRecipeMatches` sorts by
  readiness, then urgency, then the number of short lines.
- `planCooking` proposes per-lot deductions, earliest expiration first, converting count-only
  lots through their unit conversions.

`RecipeService.cook` re-validates every proposed deduction with the inventory domain functions
before writing any of them, so a cook either applies completely or not at all.

Built-in recipes have stable IDs and are re-seeded when `BUILTIN_RECIPES_VERSION` changes;
built-in rows that are no longer shipped are removed. User recipes are never touched by seeding.
Built-in recipes cannot be edited directly but can be duplicated into a user recipe.

## Persistence

### Database adapters

`SqlDatabase` is a minimal interface (`execute`, `select`, `?` placeholders):

- **Desktop:** `tauriDatabase.ts` wraps `@tauri-apps/plugin-sql`
  (`sqlite:pantrypilot.db` in the app config dir).
- **Tests and browser preview:** `sqljsDatabase.ts` runs the same SQL on sql.js (WASM). The
  preview persists to `localStorage`.

The Tauri SQL plugin uses a connection pool, so multi-statement transactions across calls are
not reliable. Services order writes so that a failure leaves consistent data (transaction row
first, then the lot update) and validate multi-lot operations up front.

### Migrations

Migrations are plain SQL files in `src/db/migrations/`. The **same file** is used by:

- Rust: `include_str!` in `src-tauri/src/lib.rs`, applied by the plugin at startup.
- TypeScript: imported with `?raw` and applied by a small runner (`schema_migrations` table)
  for sql.js.

| Version | File                      | Adds                                                        |
| ------- | ------------------------- | ----------------------------------------------------------- |
| 1       | `0001_initial_schema.sql` | ingredient definitions, lots, transactions, settings        |
| 2       | `0002_recipes.sql`        | `recipes` table, `inventory_transactions.recipe_id` + index |

Released migrations are never edited.

### Storage decisions

- Localised text, nutrition facts, unit conversions, recipe lines, steps and arrays are stored
  as JSON columns. They are always read and written as a whole and never queried by field, so
  normalising them would add joins without benefit.
- Settings are key/value rows with JSON values. Keys prefixed `meta.` hold internal state such
  as the seeded built-in dataset and recipe versions.
- Built-in definitions are re-seeded (upserted) when `BUILTIN_DATASET_VERSION` changes. User
  definitions are never touched by seeding.
- Rows with equal timestamps are ordered by `created_at, rowid` so history is deterministic.

## Repository and service layer

Repositories (`IngredientRepository`, `InventoryRepository`, `RecipeRepository`,
`SettingsRepository`) map rows to domain objects and contain all SQL. Services hold use cases
(`InventoryService.consume`, `IngredientService.deleteCustom` with "in use" / "in recipes"
checks, `RecipeService.cook`, `BackupService.importReplacingAll`). `createAppServices(db, clock)`
wires everything and seeds built-in data. React reaches services only through `useApp()`.

## Internationalisation

i18next with three resource files. `zh-CN` is the reference and default language; missing keys
fall back to `en-US`, then `zh-CN`. Enum values are translated by key (`cut.misuji`,
`form.steak`), so the domain never contains display strings. Food and recipe names are data, not
locale keys. Lint and tests guard against hard-coded text and missing keys.

## Backup format

```json
{
  "format": "pantrypilot-backup",
  "schemaVersion": 2,
  "exportedAt": "2026-10-04T12:00:00.000Z",
  "appVersion": "0.1.0",
  "data": {
    "ingredients": [],
    "inventoryLots": [],
    "transactions": [],
    "recipes": [],
    "settings": {}
  }
}
```

Only user-created ingredients and recipes are exported; built-ins are referenced by their stable
IDs. On import the file is validated with Zod, migrated step by step through `BACKUP_MIGRATIONS`
to the current version (1 → 2 adds an empty `recipes` list), checked for dangling references
(including ingredients used by recipes and collisions with built-in recipe IDs), and then
replaces all user data.

## Security

- Strict Content Security Policy in `tauri.conf.json`; no remote origins.
- Tauri capabilities grant only SQL, open/save dialogs and reading/writing user-selected text
  files.

## Testing

Vitest in a Node environment. Domain logic is tested directly; services and repositories are
tested against an in-memory sql.js database running the real migrations, including a simulated
restart (export database bytes → reopen), a backup round trip and cooking a recipe end to end.
Built-in recipes are checked for valid ingredient references and complete translations. Locale
files are tested for key parity and placeholder consistency.

## Future directions

- Meal log built on the `recipeId` of cooking transactions, with repeated-dish hints.
- Shopping list generated from the short lines of chosen recipes.
- Optional LLM input (natural language or photos, recipe suggestions) would sit in front of the
  existing services as another input method, never as a data store, and stay off by default.
