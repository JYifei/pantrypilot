-- V0.3: the dishes the user plans to cook, and what they wrote on the shopping
-- list. Gaps themselves are recomputed from the plan and the inventory; only
-- user input is stored. Planning never changes inventory.

CREATE TABLE plan_entries (
  id TEXT PRIMARY KEY,
  -- Weak reference: a recipe deleted later is shown as unavailable.
  recipe_id TEXT NOT NULL,
  servings INTEGER NOT NULL CHECK (servings > 0),
  position INTEGER NOT NULL,
  -- Ingredient to buy per recipe line key, when an alternative was chosen.
  choices_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('plan', 'manual')),
  -- Weak reference; required for plan items, which hold the state of one gap.
  ingredient_definition_id TEXT,
  label TEXT,
  planned_grams REAL CHECK (planned_grams IS NULL OR planned_grams > 0),
  note TEXT,
  -- Ticking "bought" never changes inventory.
  bought INTEGER NOT NULL DEFAULT 0 CHECK (bought IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (source = 'manual' OR ingredient_definition_id IS NOT NULL),
  CHECK (source = 'plan' OR label IS NOT NULL)
);

CREATE UNIQUE INDEX idx_shopping_items_plan_ingredient
  ON shopping_items (ingredient_definition_id) WHERE source = 'plan';
