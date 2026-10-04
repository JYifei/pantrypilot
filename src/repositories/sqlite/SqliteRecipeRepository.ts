import type { SqlDatabase, SqlRow } from "@/db/database";
import type { Recipe } from "@/domain/recipes/types";
import type { RecipeRepository } from "../types";
import { compact, fromJson, fromSqlNumber, fromSqlString, toJson, toSqlOptional } from "./mappers";

function rowToRecipe(row: SqlRow): Recipe {
  return compact({
    id: String(row.id),
    name: fromJson(row.name_json, { zhCN: String(row.id) }),
    description: fromJson<Recipe["description"]>(row.description_json, undefined),
    servings: Number(row.servings),
    timeMinutes: fromSqlNumber(row.time_minutes),
    tags: fromJson<string[]>(row.tags_json, []),
    ingredients: fromJson<Recipe["ingredients"]>(row.ingredients_json, []),
    seasonings: fromJson<Recipe["seasonings"]>(row.seasonings_json, []),
    steps: fromJson<Recipe["steps"]>(row.steps_json, []),
    dataQuality: String(row.data_quality) as Recipe["dataQuality"],
    isBuiltin: Number(row.is_builtin) === 1,
    createdAt: fromSqlString(row.created_at),
    updatedAt: fromSqlString(row.updated_at),
  });
}

export class SqliteRecipeRepository implements RecipeRepository {
  constructor(private readonly db: SqlDatabase) {}

  async listAll(): Promise<Recipe[]> {
    const rows = await this.db.select(
      "SELECT * FROM recipes ORDER BY is_builtin DESC, created_at, rowid",
    );
    return rows.map(rowToRecipe);
  }

  async getById(id: string): Promise<Recipe | null> {
    const rows = await this.db.select("SELECT * FROM recipes WHERE id = ?", [id]);
    return rows[0] ? rowToRecipe(rows[0]) : null;
  }

  async listUserCreated(): Promise<Recipe[]> {
    const rows = await this.db.select(
      "SELECT * FROM recipes WHERE is_builtin = 0 ORDER BY created_at, rowid",
    );
    return rows.map(rowToRecipe);
  }

  async save(r: Recipe): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO recipes (
         id, name_json, description_json, servings, time_minutes, tags_json, ingredients_json,
         seasonings_json, steps_json, data_quality, is_builtin, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name_json = excluded.name_json,
         description_json = excluded.description_json,
         servings = excluded.servings,
         time_minutes = excluded.time_minutes,
         tags_json = excluded.tags_json,
         ingredients_json = excluded.ingredients_json,
         seasonings_json = excluded.seasonings_json,
         steps_json = excluded.steps_json,
         data_quality = excluded.data_quality,
         is_builtin = excluded.is_builtin,
         updated_at = excluded.updated_at`,
      [
        r.id,
        toJson(r.name),
        r.description ? toJson(r.description) : null,
        r.servings,
        toSqlOptional(r.timeMinutes),
        toJson(r.tags),
        toJson(r.ingredients),
        toJson(r.seasonings),
        toJson(r.steps),
        r.dataQuality,
        r.isBuiltin ? 1 : 0,
        r.createdAt ?? now,
        r.updatedAt ?? now,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.execute("DELETE FROM recipes WHERE id = ? AND is_builtin = 0", [id]);
  }

  async deleteBuiltinExcept(keepIds: readonly string[]): Promise<void> {
    const placeholders = keepIds.map(() => "?").join(", ");
    await this.db.execute(
      keepIds.length
        ? `DELETE FROM recipes WHERE is_builtin = 1 AND id NOT IN (${placeholders})`
        : "DELETE FROM recipes WHERE is_builtin = 1",
      [...keepIds],
    );
  }

  async deleteAllUserCreated(): Promise<void> {
    await this.db.execute("DELETE FROM recipes WHERE is_builtin = 0");
  }
}
