import type { SqlDatabase, SqlRow } from "@/db/database";
import type { PlanEntry, ShoppingItem } from "@/domain/planning/types";
import type { PlanRepository } from "../types";
import { compact, fromJson, fromSqlNumber, fromSqlString, toJson, toSqlOptional } from "./mappers";

function rowToEntry(row: SqlRow): PlanEntry {
  return {
    id: String(row.id),
    recipeId: String(row.recipe_id),
    servings: Number(row.servings),
    position: Number(row.position),
    choices: fromJson<Record<string, string>>(row.choices_json, {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToItem(row: SqlRow): ShoppingItem {
  return compact({
    id: String(row.id),
    source: String(row.source) === "plan" ? "plan" : "manual",
    ingredientDefinitionId: fromSqlString(row.ingredient_definition_id),
    label: fromSqlString(row.label),
    plannedGrams: fromSqlNumber(row.planned_grams),
    note: fromSqlString(row.note),
    bought: Number(row.bought) !== 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

export class SqlitePlanRepository implements PlanRepository {
  constructor(private readonly db: SqlDatabase) {}

  async listEntries(): Promise<PlanEntry[]> {
    const rows = await this.db.select(
      "SELECT * FROM plan_entries ORDER BY position, created_at, id",
    );
    return rows.map(rowToEntry);
  }

  async saveEntry(entry: PlanEntry): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO plan_entries
         (id, recipe_id, servings, position, choices_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.recipeId,
        entry.servings,
        entry.position,
        toJson(entry.choices),
        entry.createdAt,
        entry.updatedAt,
      ],
    );
  }

  async deleteEntry(id: string): Promise<void> {
    await this.db.execute("DELETE FROM plan_entries WHERE id = ?", [id]);
  }

  async deleteEntriesForRecipe(recipeId: string): Promise<void> {
    await this.db.execute("DELETE FROM plan_entries WHERE recipe_id = ?", [recipeId]);
  }

  async listItems(): Promise<ShoppingItem[]> {
    const rows = await this.db.select("SELECT * FROM shopping_items ORDER BY created_at, id");
    return rows.map(rowToItem);
  }

  async saveItem(item: ShoppingItem): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO shopping_items
         (id, source, ingredient_definition_id, label, planned_grams, note, bought, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.source,
        toSqlOptional(item.ingredientDefinitionId),
        toSqlOptional(item.label),
        toSqlOptional(item.plannedGrams),
        toSqlOptional(item.note),
        item.bought ? 1 : 0,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }

  async deleteItem(id: string): Promise<void> {
    await this.db.execute("DELETE FROM shopping_items WHERE id = ?", [id]);
  }

  async deletePlanItems(): Promise<void> {
    await this.db.execute("DELETE FROM shopping_items WHERE source = 'plan'");
  }

  async deleteBoughtItems(): Promise<void> {
    await this.db.execute("DELETE FROM shopping_items WHERE bought = 1");
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM plan_entries");
    await this.db.execute("DELETE FROM shopping_items");
  }
}
