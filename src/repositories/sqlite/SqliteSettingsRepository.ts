import type { SqlDatabase } from "@/db/database";
import { normalizeSettings, type AppSettings } from "@/domain/settings/settings";
import type { SettingsRepository } from "../types";

/** Internal metadata keys are prefixed so they never collide with user settings. */
const META_PREFIX = "meta.";

/**
 * Settings are stored one row per key with a JSON value, so adding a setting
 * never requires a schema migration.
 */
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async load(): Promise<AppSettings> {
    const rows = await this.db.select<{ key: string; value_json: string }>(
      "SELECT key, value_json FROM app_settings WHERE key NOT LIKE 'meta.%'",
    );
    const raw: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        raw[row.key] = JSON.parse(row.value_json);
      } catch {
        // Ignore corrupt values; defaults apply.
      }
    }
    return normalizeSettings(raw);
  }

  async save(settings: AppSettings): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.put(key, JSON.stringify(value));
    }
  }

  async getMeta(key: string): Promise<string | null> {
    const rows = await this.db.select<{ value_json: string }>(
      "SELECT value_json FROM app_settings WHERE key = ?",
      [META_PREFIX + key],
    );
    if (!rows[0]) return null;
    try {
      return String(JSON.parse(rows[0].value_json));
    } catch {
      return null;
    }
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.put(META_PREFIX + key, JSON.stringify(value));
  }

  private async put(key: string, valueJson: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, valueJson, new Date().toISOString()],
    );
  }
}
