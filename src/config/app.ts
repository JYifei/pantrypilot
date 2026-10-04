/**
 * Product-level constants.
 *
 * "PantryPilot" is a provisional name. Keep every user-visible or persisted
 * occurrence of the name derived from this file so renaming stays cheap.
 * (The Tauri side has its own copies in src-tauri/tauri.conf.json and
 * src-tauri/src/lib.rs — see CONTRIBUTING.md "Renaming the project".)
 */
export const APP_CONFIG = {
  name: "PantryPilot",
  version: "0.1.0",
  /** SQLite connection string used by the Tauri SQL plugin. Must match src-tauri/src/lib.rs. */
  databaseUrl: "sqlite:pantrypilot.db",
  databaseFileName: "pantrypilot.db",
  /** Identifier written into backup files. */
  backupFormat: "pantrypilot-backup",
  /** localStorage key for the browser-only development preview database. */
  devStorageKey: "pantrypilot.dev-preview-db",
} as const;
