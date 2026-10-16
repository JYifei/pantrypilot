# Changelog

Visible behaviour and data changes, newest first. Nothing has been released yet: every app build
reports version 0.1.0, and the milestones below (V0.1 … V0.3) are development stages, not
releases. Database migrations and backup `schemaVersion` changes are listed because they change
the user's data file.

## Unreleased

### Windows installer (round 4, part 2)

- NSIS installer for Windows (`pnpm tauri build`); unsigned; current-user install.
- Release notes and checksum: `docs/releases/0.1.0.md`.
- Manual GitHub Actions workflow to build and upload the installer (no Release, no tag).
- No database or backup format changes.

### Presentation (round 4, part 1)

- README rewritten with a short summary, status, quick start and real screenshots from the
  browser preview with made-up demo data.
- The browser preview says that its data never touches the desktop app and that loading the
  sample data again resets the demo.
- Shorter pack-size placeholder on the shopping list so it is not cut off.
- No database or backup changes.

### V0.3 part 2: meal plan and shopping list (2026-10-12)

- New **Plan & shopping** page: pick dishes and servings; all planned dishes share one stock
  balance, so shared ingredients produce one merged gap (100 g onion, two dishes needing 80 g
  each → 60 g to buy).
- The shopping list shows needed amount, stock available, gap and source dishes; amounts that
  cannot be measured go to a "check stock" list, seasonings to a "check at home" list.
- Ticking "bought" never changes stock; "Add to stock" opens the normal add form with the
  ingredient preset and the weight empty.
- Cooking from the plan removes the dish from the plan in the same transaction.
- **Database:** migration 5 adds `plan_entries` and `shopping_items`.
- **Backup:** `schemaVersion` 4 adds `planEntries` and `shoppingItems`; older backups import with
  an empty plan.

### V0.3 part 1: cooking log and repeat hints (2026-10-10)

- Every cook is saved as a record (recipe name, servings, amounts per lot, note) in the same
  transaction as its deductions. Records stay readable after the recipe or lot is edited or
  deleted.
- New **Cooking log** page; deductions from before this version are listed one by one and are
  not turned into records.
- Recently cooked recipes (setting, default 3 days) move down the list with a note.
- Browser preview: **Load sample data** in Settings.
- **Database:** migration 4 adds `cooking_sessions` and links consume transactions to them.
- **Backup:** `schemaVersion` 3 adds `cookingSessions` and `repeatHintDays`.

### P0-B: reliable matching (2026-10-06)

- One shared allocation per recipe: a lot is never counted for two lines; suggestions, gaps and
  the cook dialog all use the same result.
- "Check amount" state when stock exists but cannot be measured, instead of "ready".
- Edible weight for bone-in and whole items; form compatibility (ground meat is never a steak).

### P0-A: reliable writes (2026-10-05)

- Desktop writes that touch several rows (a cook, a replacing import, a lot with its transaction)
  run in one SQLite transaction through a Rust command; a failure leaves nothing half-written.
- Retrying a cook with the same operation never deducts twice.
- **Database:** migration 3 adds `applied_operations`.

### V0.2: recipes (2026-10-04)

- 16 built-in example recipes and custom recipes, matched against stock; cooking deducts the
  confirmed amounts.
- **Database:** migration 2 adds `recipes` and `inventory_transactions.recipe_id`.
- **Backup:** `schemaVersion` 2 adds custom recipes.

### V0.1: inventory and nutrition (2026-10-04)

- Three-layer ingredient model, inventory lots with transactions, expiry tracking, demo
  nutrition data, trilingual UI, JSON export and import.
- **Database:** migration 1.
- **Backup:** `schemaVersion` 1.
