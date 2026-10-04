-- V0.2: recipes, and a link from consumption transactions to the recipe that caused them.

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name_json TEXT NOT NULL,
  description_json TEXT,
  servings INTEGER NOT NULL CHECK (servings > 0),
  time_minutes INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  ingredients_json TEXT NOT NULL,
  seasonings_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  data_quality TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Weak reference: recipes may be deleted while their history remains.
ALTER TABLE inventory_transactions ADD COLUMN recipe_id TEXT;

CREATE INDEX idx_inventory_transactions_recipe ON inventory_transactions (recipe_id);
