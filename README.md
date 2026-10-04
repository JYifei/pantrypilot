# PantryPilot

> Working name — see [CONTRIBUTING.md](CONTRIBUTING.md#renaming-the-project) for how to rename.

PantryPilot is a local-first, offline desktop app for people who cook regularly. It tracks the
food you actually have — modelled the way groceries appear in (Japanese) supermarkets, e.g.
"beef / misuji / steak / 251 g / 35 mm" — and calculates nutrition from what is in stock.

It is **not** a calorie-counting or dieting app and gives no medical advice.

Progress and plans are tracked in [ROADMAP.md](ROADMAP.md) (checklist, Chinese).

## Privacy

PantryPilot V0.1 stores user data locally and does not send inventory or nutrition data to external servers.

There is no account, no cloud sync, no analytics and no telemetry. The only network access is
the Vite dev server on `localhost` during development.

## Features (V0.1)

- **Ingredient taxonomy** — ingredient definitions (nutrition identity, e.g. "beef misuji"),
  product forms (steak, yakiniku slices, ground…) and inventory lots are separate concepts.
  Built-in definitions have stable snake_case IDs; user data uses UUIDs.
- **Trilingual** — UI and food names in Simplified Chinese (default), English and Japanese.
  Search works across all three, including kana/width normalisation.
- **Inventory** — add / edit / delete lots, consume, adjust, discard, mark opened, change
  storage, freeze. Every change is recorded as a transaction. Remaining amounts never go negative.
- **Expiration tracking** — expired / today / tomorrow / within 3 days / normal; sorting and a
  dashboard of what to use first.
- **Nutrition** — values per 100 g edible portion; _unknown is never treated as zero_. Totals
  with missing values are flagged as lower bounds. A nutrition sandbox lets you combine foods and
  weights. Experimental 1–10 heuristic scores are derived on the fly and never stored.
- **Backup** — JSON export / import with a `schemaVersion` and migration chain.

### About the built-in nutrition data

The bundled nutrition values are **demo data** — plausible approximations for development, not
an authoritative dataset. They are labelled as such in the UI. Every value carries a source ID
so a real regional dataset (e.g. the Standard Tables of Food Composition in Japan) can be added
later without changing the data model.

## Getting started

Prerequisites:

- Node.js 22+ and [pnpm](https://pnpm.io) (`corepack enable`)
- Rust (stable) and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)
  (on Windows: Visual Studio Build Tools with the C++ workload, WebView2)

```bash
pnpm install
pnpm tauri dev      # desktop app (SQLite in the app config directory)
pnpm dev            # browser preview only (sql.js, stored in localStorage)
```

Build an installer:

```bash
pnpm tauri build
```

### Where is my data?

The desktop app stores everything in a single SQLite file named `pantrypilot.db` in the
OS app-config directory for the identifier `dev.pantrypilot.desktop`:

| OS      | Location                                                 |
| ------- | -------------------------------------------------------- |
| Windows | `%APPDATA%\dev.pantrypilot.desktop\pantrypilot.db`       |
| macOS   | `~/Library/Application Support/dev.pantrypilot.desktop/` |
| Linux   | `~/.config/dev.pantrypilot.desktop/`                     |

The exact path is shown in **Settings → Data**. Use **Export** there for backups.

## Development

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm typecheck` | TypeScript (strict) project check          |
| `pnpm lint`      | ESLint                                     |
| `pnpm format`    | Prettier (write)                           |
| `pnpm test`      | Vitest (domain, services, SQLite, locales) |
| `pnpm check`     | typecheck + lint + format check + tests    |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organised and
[CONTRIBUTING.md](CONTRIBUTING.md) for conventions.

## Known limitations (V0.1)

- Nutrition values are demo data, not an authoritative dataset.
- No recipes, meal log or shopping list yet (recipes are planned for V0.2).
- Import replaces all data; there is no merge.
- No installer signing or auto-update.

## License

A license has not been selected yet. Until one is added, all rights are reserved by the authors.
