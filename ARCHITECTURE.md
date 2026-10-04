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

| Path               | Contents                                                      |
| ------------------ | ------------------------------------------------------------- |
| `src/domain`       | Pure model + logic: taxonomy, nutrition, inventory, backup    |
| `src/data`         | Built-in ingredient definitions and nutrition source metadata |
| `src/db`           | `SqlDatabase` interface, adapters, SQL migrations             |
| `src/repositories` | Repository interfaces and SQLite implementations              |
| `src/services`     | Application services, seeding, heuristic scores               |
| `src/app`          | Boot, global state (`AppProvider`), shell and navigation      |
| `src/features/*`   | One folder per screen: dashboard, inventory, nutrition, …     |
| `src/components`   | Shared UI; `components/ui` is generated shadcn/ui             |
| `src/locales`      | `zh-CN.json` (reference), `en-US.json`, `ja-JP.json`          |
| `src/lib`          | i18n setup, formatting, file save/open helpers                |
| `src-tauri`        | Rust shell: plugin registration, migrations, capabilities     |

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
audit trail and the basis for a future meal log.

Expiration status (`expired / today / tomorrow / soon / normal / unknown`) is computed from an
injected "today", never stored.

## Persistence

### Database adapters

`SqlDatabase` is a minimal interface (`execute`, `select`, `?` placeholders):

- **Desktop:** `tauriDatabase.ts` wraps `@tauri-apps/plugin-sql`
  (`sqlite:pantrypilot.db` in the app config dir).
- **Tests and browser preview:** `sqljsDatabase.ts` runs the same SQL on sql.js (WASM). The
  preview persists to `localStorage`.

The Tauri SQL plugin uses a connection pool, so multi-statement transactions across calls are
not reliable. Services order writes so that a failure leaves consistent data (transaction row
first, then the lot update).

### Migrations

Migrations are plain SQL files in `src/db/migrations/`. The **same file** is used by:

- Rust: `include_str!` in `src-tauri/src/lib.rs`, applied by the plugin at startup.
- TypeScript: imported with `?raw` and applied by a small runner (`schema_migrations` table)
  for sql.js.

Released migrations are never edited.

### Storage decisions

- Localised text, nutrition facts, unit conversions and arrays are stored as JSON columns.
  They are always read and written as a whole and never queried by field, so normalising them
  would add joins without benefit.
- Settings are key/value rows with JSON values. Keys prefixed `meta.` hold internal state such
  as the seeded built-in dataset version.
- Built-in definitions are re-seeded (upserted) when `BUILTIN_DATASET_VERSION` changes. User
  definitions are never touched by seeding.

## Repository and service layer

Repositories (`IngredientRepository`, `InventoryRepository`, `SettingsRepository`) map rows to
domain objects and contain all SQL. Services hold use cases (`InventoryService.consume`,
`IngredientService.deleteCustom` with "in use" checks, `BackupService.importReplacingAll`).
`createAppServices(db, clock)` wires everything and seeds built-in data. React reaches services
only through `useApp()`.

## Internationalisation

i18next with three resource files. `zh-CN` is the reference and default language; missing keys
fall back to `en-US`, then `zh-CN`. Enum values are translated by key (`cut.misuji`,
`form.steak`), so the domain never contains display strings. Food names are data, not locale
keys. Lint and tests guard against hard-coded text and missing keys.

## Backup format

```json
{
  "format": "pantrypilot-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-04T12:00:00.000Z",
  "appVersion": "0.1.0",
  "data": { "ingredients": [], "inventoryLots": [], "transactions": [], "settings": {} }
}
```

Only user-created ingredients are exported; built-ins are referenced by their stable IDs. On
import the file is validated with Zod, migrated step by step through `BACKUP_MIGRATIONS` to the
current version, checked for dangling references, and then replaces all user data.

## Security

- Strict Content Security Policy in `tauri.conf.json`; no remote origins.
- Tauri capabilities grant only SQL, open/save dialogs and reading/writing user-selected text
  files.

## Testing

Vitest in a Node environment. Domain logic is tested directly; services and repositories are
tested against an in-memory sql.js database running the real migrations, including a simulated
restart (export database bytes → reopen) and a backup round trip. Locale files are tested for
key parity and placeholder consistency.

## Future directions

Recipes (V0.2, see ROADMAP.md) will add `recipes` / `recipe_ingredients` tables referencing
ingredient definitions, a matching service that ranks recipes by stock coverage and expiration
urgency, and a "cook" use case that consumes from lots in expiration order. Optional LLM input
would sit in front of the existing services as another input method, never as a data store.
