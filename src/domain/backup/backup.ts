import { z } from "zod";
import { APP_CONFIG } from "../../config/app";
import type { IngredientDefinition } from "../ingredients/types";
import type { InventoryLot, InventoryTransaction } from "../inventory/types";
import {
  ingredientDefinitionSchema,
  inventoryLotSchema,
  inventoryTransactionSchema,
} from "../schemas";
import { appSettingsSchema, type AppSettings } from "../settings/settings";

/**
 * Backup file format.
 *
 * `schemaVersion` describes the backup format, independent of the SQLite
 * schema version. When the format changes:
 *   1. bump CURRENT_BACKUP_SCHEMA_VERSION,
 *   2. add a step to BACKUP_MIGRATIONS that upgrades the previous version,
 *   3. keep the old steps so any historical export can still be imported.
 */
export const CURRENT_BACKUP_SCHEMA_VERSION = 1;

export interface BackupData {
  /** Only user-created ingredients. Built-ins ship with the app. */
  ingredients: IngredientDefinition[];
  inventoryLots: InventoryLot[];
  transactions: InventoryTransaction[];
  settings: AppSettings;
}

export interface BackupFile {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  data: BackupData;
}

const backupFileSchema = z.object({
  format: z.literal(APP_CONFIG.backupFormat),
  schemaVersion: z.literal(CURRENT_BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  appVersion: z.string(),
  data: z.object({
    ingredients: z.array(ingredientDefinitionSchema),
    inventoryLots: z.array(inventoryLotSchema),
    transactions: z.array(inventoryTransactionSchema),
    settings: appSettingsSchema,
  }),
});

/** Upgrade step from version N to N + 1, keyed by N. */
type BackupMigration = (raw: Record<string, unknown>) => Record<string, unknown>;
const BACKUP_MIGRATIONS: Record<number, BackupMigration> = {
  // Example for the future:
  // 1: (raw) => ({ ...raw, schemaVersion: 2, data: { ...raw.data, mealLogs: [] } }),
};

export function createBackup(data: BackupData, exportedAt: string): BackupFile {
  return {
    format: APP_CONFIG.backupFormat,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt,
    appVersion: APP_CONFIG.version,
    data,
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export type BackupParseError =
  | { code: "invalid_json" }
  | { code: "not_a_backup" }
  | { code: "unsupported_version"; version: number }
  | { code: "invalid_content"; details: string };

export type BackupParseResult =
  { ok: true; backup: BackupFile } | { ok: false; error: BackupParseError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Upgrade an older backup object step by step to the current version. */
export function migrateBackup(raw: Record<string, unknown>): Record<string, unknown> {
  let current = raw;
  let version = Number(current.schemaVersion);
  while (version < CURRENT_BACKUP_SCHEMA_VERSION) {
    const step = BACKUP_MIGRATIONS[version];
    if (!step) throw new Error(`No backup migration from version ${version}`);
    current = step(current);
    version = Number(current.schemaVersion);
  }
  return current;
}

/** Parse, migrate and validate a backup file's text. Never throws. */
export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "invalid_json" } };
  }
  if (!isRecord(raw) || raw.format !== APP_CONFIG.backupFormat) {
    return { ok: false, error: { code: "not_a_backup" } };
  }
  const version = Number(raw.schemaVersion);
  if (!Number.isInteger(version) || version < 1 || version > CURRENT_BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: { code: "unsupported_version", version } };
  }

  let migrated: Record<string, unknown>;
  try {
    migrated = migrateBackup(raw);
  } catch (error) {
    return { ok: false, error: { code: "invalid_content", details: String(error) } };
  }

  const parsed = backupFileSchema.safeParse(migrated);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: { code: "invalid_content", details } };
  }
  return { ok: true, backup: parsed.data as BackupFile };
}

/**
 * Referential checks that a schema cannot express: every lot must point at a
 * known ingredient and every transaction at a lot in the backup.
 * Returns the list of problems (empty when consistent).
 */
export function findBackupReferenceProblems(
  backup: BackupFile,
  builtinIngredientIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const ingredientIds = new Set([
    ...builtinIngredientIds,
    ...backup.data.ingredients.map((i) => i.id),
  ]);
  const lotIds = new Set(backup.data.inventoryLots.map((l) => l.id));
  for (const lot of backup.data.inventoryLots) {
    if (!ingredientIds.has(lot.ingredientDefinitionId)) {
      problems.push(`lot ${lot.id} → unknown ingredient ${lot.ingredientDefinitionId}`);
    }
  }
  for (const tx of backup.data.transactions) {
    if (!lotIds.has(tx.inventoryLotId)) {
      problems.push(`transaction ${tx.id} → unknown lot ${tx.inventoryLotId}`);
    }
  }
  return problems;
}
