-- PantryPilot schema, version 1.
--
-- Shared by the Tauri SQL plugin (src-tauri/src/lib.rs, via include_str!) and
-- the in-process sql.js driver used by tests and the browser preview.
-- NEVER edit a migration after it has been released; add a new file instead.
--
-- Conventions:
--   * *_json columns hold JSON text (LocalizedText, arrays, NutritionFacts).
--   * Booleans are INTEGER 0/1; NULL means "not recorded".
--   * Calendar dates are 'YYYY-MM-DD'; timestamps are ISO 8601 text.

CREATE TABLE nutrition_sources (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  dataset      TEXT,
  reference    TEXT,
  region       TEXT,
  retrieved_at TEXT,
  notes        TEXT,
  is_builtin   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ingredient_definitions (
  id                           TEXT PRIMARY KEY,
  name_json                    TEXT NOT NULL,
  aliases_json                 TEXT NOT NULL DEFAULT '[]',
  category                     TEXT NOT NULL,
  animal_species               TEXT,
  anatomical_cut               TEXT,
  default_edible_ratio         REAL,
  -- Per 100 g edible portion. NULL = no nutrition data (unknown, not zero).
  nutrition_json               TEXT,
  tags_json                    TEXT NOT NULL DEFAULT '[]',
  shelf_life_refrigerated_days INTEGER,
  shelf_life_frozen_days       INTEGER,
  unit_conversions_json        TEXT,
  source_id                    TEXT REFERENCES nutrition_sources (id) ON DELETE SET NULL,
  data_quality                 TEXT NOT NULL DEFAULT 'user'
                               CHECK (data_quality IN ('demo', 'reference', 'user')),
  is_builtin                   INTEGER NOT NULL DEFAULT 0,
  created_at                   TEXT NOT NULL,
  updated_at                   TEXT NOT NULL
);

CREATE INDEX idx_ingredient_definitions_category ON ingredient_definitions (category);

CREATE TABLE inventory_lots (
  id                       TEXT PRIMARY KEY,
  ingredient_definition_id TEXT NOT NULL
                           REFERENCES ingredient_definitions (id) ON DELETE RESTRICT,
  cut                      TEXT,
  form                     TEXT,
  original_weight_g        REAL CHECK (original_weight_g IS NULL OR original_weight_g >= 0),
  remaining_weight_g       REAL CHECK (remaining_weight_g IS NULL OR remaining_weight_g >= 0),
  count                    REAL CHECK (count IS NULL OR count >= 0),
  unit                     TEXT,
  thickness_mm             REAL,
  fat_percent              REAL,
  bone_in                  INTEGER,
  skin_on                  INTEGER,
  processing_json          TEXT NOT NULL DEFAULT '[]',
  purchase_date            TEXT,
  expiration_date          TEXT,
  storage                  TEXT NOT NULL CHECK (storage IN ('pantry', 'refrigerated', 'frozen')),
  opened                   INTEGER NOT NULL DEFAULT 0,
  purchase_price           REAL,
  currency                 TEXT,
  brand                    TEXT,
  label_text               TEXT,
  notes                    TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX idx_inventory_lots_expiration ON inventory_lots (expiration_date);
CREATE INDEX idx_inventory_lots_ingredient ON inventory_lots (ingredient_definition_id);

CREATE TABLE inventory_transactions (
  id               TEXT PRIMARY KEY,
  inventory_lot_id TEXT NOT NULL REFERENCES inventory_lots (id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('add', 'consume', 'adjust', 'discard')),
  quantity_g       REAL,
  quantity_count   REAL,
  created_at       TEXT NOT NULL,
  notes            TEXT
);

CREATE INDEX idx_inventory_transactions_lot ON inventory_transactions (inventory_lot_id);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
