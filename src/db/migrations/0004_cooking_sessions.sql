-- V0.3: one row per time a recipe was cooked, with a snapshot of what was used.
-- History is read from the snapshot, so it survives later edits or deletion of
-- the recipe, the ingredient definition or the lots.

CREATE TABLE cooking_sessions (
  id TEXT PRIMARY KEY,
  cooked_at TEXT NOT NULL,
  -- Calendar date in the user's time zone when cooking was recorded.
  local_date TEXT NOT NULL,
  -- Weak reference: the recipe may be edited or deleted later.
  recipe_id TEXT,
  recipe_name_json TEXT NOT NULL,
  servings INTEGER NOT NULL CHECK (servings > 0),
  items_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cooking_sessions_local_date ON cooking_sessions (local_date);

-- Consumption caused by a cooking session. NULL for every older transaction:
-- they are not grouped into sessions after the fact.
ALTER TABLE inventory_transactions ADD COLUMN cooking_session_id TEXT;

CREATE INDEX idx_inventory_transactions_session ON inventory_transactions (cooking_session_id);
