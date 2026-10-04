import type { SqlDatabase, SqlRow } from "@/db/database";
import type { IngredientDefinition } from "@/domain/ingredients/types";
import type { NutritionSource } from "@/domain/nutrition/types";
import type { IngredientRepository } from "../types";
import { compact, fromJson, fromSqlNumber, fromSqlString, toJson, toSqlOptional } from "./mappers";

function rowToDefinition(row: SqlRow): IngredientDefinition {
  const refrigeratedDays = fromSqlNumber(row.shelf_life_refrigerated_days);
  const frozenDays = fromSqlNumber(row.shelf_life_frozen_days);
  const shelfLife =
    refrigeratedDays === undefined && frozenDays === undefined
      ? undefined
      : compact({ refrigeratedDays, frozenDays });
  return compact({
    id: String(row.id),
    name: fromJson(row.name_json, { zhCN: String(row.id) }),
    aliases: fromJson<string[]>(row.aliases_json, []),
    category: String(row.category) as IngredientDefinition["category"],
    animalSpecies: fromSqlString(row.animal_species) as IngredientDefinition["animalSpecies"],
    anatomicalCut: fromSqlString(row.anatomical_cut) as IngredientDefinition["anatomicalCut"],
    defaultEdibleRatio: fromSqlNumber(row.default_edible_ratio),
    nutritionPer100g: fromJson(row.nutrition_json, null),
    tags: fromJson<string[]>(row.tags_json, []),
    defaultShelfLife: shelfLife,
    defaultUnitConversions: fromJson(row.unit_conversions_json, undefined),
    sourceId: fromSqlString(row.source_id),
    dataQuality: String(row.data_quality) as IngredientDefinition["dataQuality"],
    isBuiltin: Number(row.is_builtin) === 1,
    createdAt: fromSqlString(row.created_at),
    updatedAt: fromSqlString(row.updated_at),
  });
}

function rowToSource(row: SqlRow): NutritionSource {
  return compact({
    id: String(row.id),
    name: String(row.name),
    dataset: fromSqlString(row.dataset),
    reference: fromSqlString(row.reference),
    region: fromSqlString(row.region),
    retrievedAt: fromSqlString(row.retrieved_at),
    notes: fromSqlString(row.notes),
  });
}

export class SqliteIngredientRepository implements IngredientRepository {
  constructor(private readonly db: SqlDatabase) {}

  async listAll(): Promise<IngredientDefinition[]> {
    const rows = await this.db.select(
      "SELECT * FROM ingredient_definitions ORDER BY is_builtin DESC, category, id",
    );
    return rows.map(rowToDefinition);
  }

  async getById(id: string): Promise<IngredientDefinition | null> {
    const rows = await this.db.select("SELECT * FROM ingredient_definitions WHERE id = ?", [id]);
    return rows[0] ? rowToDefinition(rows[0]) : null;
  }

  async listUserCreated(): Promise<IngredientDefinition[]> {
    const rows = await this.db.select(
      "SELECT * FROM ingredient_definitions WHERE is_builtin = 0 ORDER BY created_at, rowid",
    );
    return rows.map(rowToDefinition);
  }

  async save(d: IngredientDefinition): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO ingredient_definitions (
         id, name_json, aliases_json, category, animal_species, anatomical_cut,
         default_edible_ratio, nutrition_json, tags_json, shelf_life_refrigerated_days,
         shelf_life_frozen_days, unit_conversions_json, source_id, data_quality, is_builtin,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name_json = excluded.name_json,
         aliases_json = excluded.aliases_json,
         category = excluded.category,
         animal_species = excluded.animal_species,
         anatomical_cut = excluded.anatomical_cut,
         default_edible_ratio = excluded.default_edible_ratio,
         nutrition_json = excluded.nutrition_json,
         tags_json = excluded.tags_json,
         shelf_life_refrigerated_days = excluded.shelf_life_refrigerated_days,
         shelf_life_frozen_days = excluded.shelf_life_frozen_days,
         unit_conversions_json = excluded.unit_conversions_json,
         source_id = excluded.source_id,
         data_quality = excluded.data_quality,
         is_builtin = excluded.is_builtin,
         updated_at = excluded.updated_at`,
      [
        d.id,
        toJson(d.name),
        toJson(d.aliases),
        d.category,
        toSqlOptional(d.animalSpecies),
        toSqlOptional(d.anatomicalCut),
        toSqlOptional(d.defaultEdibleRatio),
        d.nutritionPer100g ? toJson(d.nutritionPer100g) : null,
        toJson(d.tags),
        toSqlOptional(d.defaultShelfLife?.refrigeratedDays),
        toSqlOptional(d.defaultShelfLife?.frozenDays),
        d.defaultUnitConversions ? toJson(d.defaultUnitConversions) : null,
        toSqlOptional(d.sourceId),
        d.dataQuality,
        d.isBuiltin ? 1 : 0,
        d.createdAt ?? now,
        d.updatedAt ?? now,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.execute("DELETE FROM ingredient_definitions WHERE id = ? AND is_builtin = 0", [
      id,
    ]);
  }

  async deleteAllUserCreated(): Promise<void> {
    await this.db.execute("DELETE FROM ingredient_definitions WHERE is_builtin = 0");
  }

  async listSources(): Promise<NutritionSource[]> {
    const rows = await this.db.select("SELECT * FROM nutrition_sources ORDER BY id");
    return rows.map(rowToSource);
  }

  async saveSource(s: NutritionSource, isBuiltin: boolean): Promise<void> {
    await this.db.execute(
      `INSERT INTO nutrition_sources (id, name, dataset, reference, region, retrieved_at, notes, is_builtin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, dataset = excluded.dataset, reference = excluded.reference,
         region = excluded.region, retrieved_at = excluded.retrieved_at, notes = excluded.notes,
         is_builtin = excluded.is_builtin`,
      [
        s.id,
        s.name,
        toSqlOptional(s.dataset),
        toSqlOptional(s.reference),
        toSqlOptional(s.region),
        toSqlOptional(s.retrievedAt),
        toSqlOptional(s.notes),
        isBuiltin ? 1 : 0,
      ],
    );
  }
}
