import { z } from "zod";
import { APP_CONFIG } from "../../config/app";
import type { CookingSession } from "../cooking/types";
import type { IngredientDefinition } from "../ingredients/types";
import type { InventoryLot, InventoryTransaction } from "../inventory/types";
import { referencedIngredientIds } from "../recipes/matching";
import type { Recipe } from "../recipes/types";
import {
  cookingSessionSchema,
  ingredientDefinitionSchema,
  inventoryLotSchema,
  inventoryTransactionSchema,
  recipeSchema,
} from "../schemas";
import { appSettingsSchema, DEFAULT_SETTINGS, type AppSettings } from "../settings/settings";

/**
 * Backup file format.
 *
 * `schemaVersion` describes the backup format, independent of the SQLite
 * schema version. When the format changes:
 *   1. bump CURRENT_BACKUP_SCHEMA_VERSION,
 *   2. add a step to BACKUP_MIGRATIONS that upgrades the previous version,
 *   3. keep the old steps so any historical export can still be imported.
 */
export const CURRENT_BACKUP_SCHEMA_VERSION = 3;

export interface BackupData {
  /** Only user-created ingredients. Built-ins ship with the app. */
  ingredients: IngredientDefinition[];
  inventoryLots: InventoryLot[];
  transactions: InventoryTransaction[];
  /** Only user-created recipes (added in schema version 2). */
  recipes: Recipe[];
  /** Cooking history (added in schema version 3). */
  cookingSessions: CookingSession[];
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
    recipes: z.array(recipeSchema),
    cookingSessions: z.array(cookingSessionSchema),
    settings: appSettingsSchema,
  }),
});

/** Upgrade step from version N to N + 1, keyed by N. */
type BackupMigration = (raw: Record<string, unknown>) => Record<string, unknown>;
const BACKUP_MIGRATIONS: Record<number, BackupMigration> = {
  // V0.1 → V0.2: recipes did not exist yet.
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    data: { ...(isRecord(raw.data) ? raw.data : {}), recipes: [] },
  }),
  // V0.2 → V0.3: no cooking sessions were recorded, and older cooking
  // transactions stay as they are rather than being grouped into sessions.
  2: (raw) => {
    const data = isRecord(raw.data) ? raw.data : {};
    const settings = isRecord(data.settings) ? data.settings : {};
    return {
      ...raw,
      schemaVersion: 3,
      data: {
        ...data,
        cookingSessions: [],
        settings: { repeatHintDays: DEFAULT_SETTINGS.repeatHintDays, ...settings },
      },
    };
  },
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
 * known ingredient, every transaction at a lot in the backup, and every
 * session link at a session in the backup. Sessions themselves only hold weak
 * references (recipe, lots), because history outlives them.
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
  const sessionIds = new Set<string>();
  for (const session of backup.data.cookingSessions) {
    if (sessionIds.has(session.id)) problems.push(`session ${session.id} appears twice`);
    sessionIds.add(session.id);
  }
  for (const lot of backup.data.inventoryLots) {
    if (!ingredientIds.has(lot.ingredientDefinitionId)) {
      problems.push(`lot ${lot.id} → unknown ingredient ${lot.ingredientDefinitionId}`);
    }
  }
  for (const tx of backup.data.transactions) {
    if (!lotIds.has(tx.inventoryLotId)) {
      problems.push(`transaction ${tx.id} → unknown lot ${tx.inventoryLotId}`);
    }
    if (tx.cookingSessionId && !sessionIds.has(tx.cookingSessionId)) {
      problems.push(`transaction ${tx.id} → unknown cooking session ${tx.cookingSessionId}`);
    }
  }
  for (const recipe of backup.data.recipes) {
    for (const id of referencedIngredientIds(recipe)) {
      if (!ingredientIds.has(id)) problems.push(`recipe ${recipe.id} → unknown ingredient ${id}`);
    }
  }
  return problems;
}
