# ADR 0003: Cooking sessions and snapshots

Status: proposed (V0.3, part 1)

## Problem

Cooking used to write only consume transactions carrying a `recipeId`. That cannot answer
"what did I cook, when, for how many": several deductions of one meal are separate rows, two
cooks of the same recipe at nearly the same time look alike, and after a recipe or lot is edited
or deleted the rows no longer say what was used. Grouping old rows by time or recipe ID would
invent events that were never recorded.

## Decision

- Migration 0004 adds `cooking_sessions` (ID, `cooked_at`, `local_date`, weak `recipe_id`, recipe
  name snapshot, servings, item snapshots, note) and a nullable
  `inventory_transactions.cooking_session_id`.
- Each item copies the lot ID, ingredient ID and three-language name, form, bone-in flag and the
  amount in the lot's own measure (grams, or count + unit). For counts, the gram figure and how it
  is known (`exact`, `estimated`, `unknown`) are frozen at cooking time. No nutrition snapshot yet.
- `RecipeService.cook` writes the operation record, the session, every consume transaction (with
  `cookingSessionId`) and every guarded lot update in one `Repositories.atomic` batch (ADR 0001).
  The operation result stores the session ID, so a replay returns the same session.
- History is read only from snapshots. Recipe, lot and ingredient references are weak: deleting
  them does not touch a session, and the UI marks "recipe deleted" / "recipe edited since".
- Older consume transactions keep `cooking_session_id = NULL`. They are listed one by one with an
  explanation of what they lack and are not counted for repeat hints.
- Repeat hints: recipes with a session in the last N days (setting, default 3, 0 = off) move
  after others of the same readiness and show when they were cooked. Nothing is hidden.
- Backup schema 3 adds `cookingSessions` and `settings.repeatHintDays`; v1/v2 backups upgrade
  with an empty session list. Import inserts sessions before transactions and rejects
  transactions linked to a missing session.
- No undo: rules for lots deleted or changed after cooking are not settled.

## Alternatives considered

- **Derive sessions from transactions** (same time / same recipe ID). Rejected: guesses.
- **Strong foreign keys to recipes and lots.** Rejected: deleting either would delete or block
  history.
- **Normalised `cooking_session_items` table.** More queryable, but items are only read with
  their session; JSON keeps the snapshot a single row and avoids a second write per item.

## Costs

- Deleting a lot still deletes its transactions (existing cascade). The session snapshot stays,
  but it may then have fewer linked transactions than items.
- Untracked lots (no weight or count) are not deducted and therefore not in the snapshot.
- Sessions are loaded in full into memory; fine for personal use, may need paging later.
- Item JSON is validated by the TypeScript schema on import and parse, not by SQLite.
