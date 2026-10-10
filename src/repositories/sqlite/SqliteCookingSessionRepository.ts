import type { SqlDatabase, SqlRow } from "@/db/database";
import type { CookingSession } from "@/domain/cooking/types";
import type { CookingSessionRepository } from "../types";
import { compact, fromJson, fromSqlString, toJson, toSqlOptional } from "./mappers";

function rowToSession(row: SqlRow): CookingSession {
  return compact({
    id: String(row.id),
    cookedAt: String(row.cooked_at),
    localDate: String(row.local_date),
    recipeId: fromSqlString(row.recipe_id),
    recipeName: fromJson<CookingSession["recipeName"]>(row.recipe_name_json, { zhCN: "?" }),
    servings: Number(row.servings),
    items: fromJson<CookingSession["items"]>(row.items_json, []),
    note: fromSqlString(row.note),
  });
}

export class SqliteCookingSessionRepository implements CookingSessionRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<CookingSession[]> {
    const rows = await this.db.select("SELECT * FROM cooking_sessions ORDER BY cooked_at DESC, id");
    return rows.map(rowToSession);
  }

  async getById(id: string): Promise<CookingSession | null> {
    const rows = await this.db.select("SELECT * FROM cooking_sessions WHERE id = ?", [id]);
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async insert(session: CookingSession): Promise<void> {
    await this.db.execute(
      `INSERT INTO cooking_sessions
         (id, cooked_at, local_date, recipe_id, recipe_name_json, servings, items_json, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.cookedAt,
        session.localDate,
        toSqlOptional(session.recipeId),
        toJson(session.recipeName),
        session.servings,
        toJson(session.items),
        toSqlOptional(session.note),
        session.cookedAt,
      ],
    );
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM cooking_sessions");
  }
}
