-- Idempotency keys for operations that may be retried (e.g. cooking a recipe).
-- A retried request with the same id returns the stored result instead of
-- applying the change twice. Internal bookkeeping; not part of backups.
CREATE TABLE applied_operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
