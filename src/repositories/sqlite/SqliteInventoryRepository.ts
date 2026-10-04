import type { SqlDatabase, SqlRow } from "@/db/database";
import type { InventoryLot, InventoryTransaction } from "@/domain/inventory/types";
import type { InventoryRepository } from "../types";
import {
  compact,
  fromJson,
  fromSqlBool,
  fromSqlNumber,
  fromSqlString,
  toJson,
  toSqlBool,
  toSqlOptional,
} from "./mappers";

function rowToLot(row: SqlRow): InventoryLot {
  return compact({
    id: String(row.id),
    ingredientDefinitionId: String(row.ingredient_definition_id),
    cut: fromSqlString(row.cut) as InventoryLot["cut"],
    form: fromSqlString(row.form) as InventoryLot["form"],
    originalWeightG: fromSqlNumber(row.original_weight_g),
    remainingWeightG: fromSqlNumber(row.remaining_weight_g),
    count: fromSqlNumber(row.count),
    unit: fromSqlString(row.unit) as InventoryLot["unit"],
    thicknessMm: fromSqlNumber(row.thickness_mm),
    fatPercent: fromSqlNumber(row.fat_percent),
    boneIn: fromSqlBool(row.bone_in),
    skinOn: fromSqlBool(row.skin_on),
    processing: fromJson<InventoryLot["processing"]>(row.processing_json, []),
    purchaseDate: fromSqlString(row.purchase_date),
    expirationDate: fromSqlString(row.expiration_date),
    storage: String(row.storage) as InventoryLot["storage"],
    opened: Number(row.opened) === 1,
    purchasePrice: fromSqlNumber(row.purchase_price),
    currency: fromSqlString(row.currency),
    brand: fromSqlString(row.brand),
    labelText: fromSqlString(row.label_text),
    notes: fromSqlString(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

function rowToTransaction(row: SqlRow): InventoryTransaction {
  return compact({
    id: String(row.id),
    inventoryLotId: String(row.inventory_lot_id),
    type: String(row.type) as InventoryTransaction["type"],
    quantityG: fromSqlNumber(row.quantity_g),
    quantityCount: fromSqlNumber(row.quantity_count),
    createdAt: String(row.created_at),
    notes: fromSqlString(row.notes),
    recipeId: fromSqlString(row.recipe_id),
  });
}

export class SqliteInventoryRepository implements InventoryRepository {
  constructor(private readonly db: SqlDatabase) {}

  async listLots(): Promise<InventoryLot[]> {
    const rows = await this.db.select("SELECT * FROM inventory_lots ORDER BY created_at, rowid");
    return rows.map(rowToLot);
  }

  async getLot(id: string): Promise<InventoryLot | null> {
    const rows = await this.db.select("SELECT * FROM inventory_lots WHERE id = ?", [id]);
    return rows[0] ? rowToLot(rows[0]) : null;
  }

  async saveLot(lot: InventoryLot): Promise<void> {
    await this.db.execute(
      `INSERT INTO inventory_lots (
         id, ingredient_definition_id, cut, form, original_weight_g, remaining_weight_g,
         count, unit, thickness_mm, fat_percent, bone_in, skin_on, processing_json,
         purchase_date, expiration_date, storage, opened, purchase_price, currency,
         brand, label_text, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         ingredient_definition_id = excluded.ingredient_definition_id,
         cut = excluded.cut,
         form = excluded.form,
         original_weight_g = excluded.original_weight_g,
         remaining_weight_g = excluded.remaining_weight_g,
         count = excluded.count,
         unit = excluded.unit,
         thickness_mm = excluded.thickness_mm,
         fat_percent = excluded.fat_percent,
         bone_in = excluded.bone_in,
         skin_on = excluded.skin_on,
         processing_json = excluded.processing_json,
         purchase_date = excluded.purchase_date,
         expiration_date = excluded.expiration_date,
         storage = excluded.storage,
         opened = excluded.opened,
         purchase_price = excluded.purchase_price,
         currency = excluded.currency,
         brand = excluded.brand,
         label_text = excluded.label_text,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
      [
        lot.id,
        lot.ingredientDefinitionId,
        toSqlOptional(lot.cut),
        toSqlOptional(lot.form),
        toSqlOptional(lot.originalWeightG),
        toSqlOptional(lot.remainingWeightG),
        toSqlOptional(lot.count),
        toSqlOptional(lot.unit),
        toSqlOptional(lot.thicknessMm),
        toSqlOptional(lot.fatPercent),
        toSqlBool(lot.boneIn),
        toSqlBool(lot.skinOn),
        toJson(lot.processing),
        toSqlOptional(lot.purchaseDate),
        toSqlOptional(lot.expirationDate),
        lot.storage,
        lot.opened ? 1 : 0,
        toSqlOptional(lot.purchasePrice),
        toSqlOptional(lot.currency),
        toSqlOptional(lot.brand),
        toSqlOptional(lot.labelText),
        toSqlOptional(lot.notes),
        lot.createdAt,
        lot.updatedAt,
      ],
    );
  }

  async deleteLot(id: string): Promise<void> {
    // Explicit delete keeps behaviour identical even if foreign_keys is off.
    await this.db.execute("DELETE FROM inventory_transactions WHERE inventory_lot_id = ?", [id]);
    await this.db.execute("DELETE FROM inventory_lots WHERE id = ?", [id]);
  }

  async countLotsForIngredient(ingredientDefinitionId: string): Promise<number> {
    const rows = await this.db.select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM inventory_lots WHERE ingredient_definition_id = ?",
      [ingredientDefinitionId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async addTransaction(tx: InventoryTransaction): Promise<void> {
    await this.db.execute(
      `INSERT INTO inventory_transactions (id, inventory_lot_id, type, quantity_g, quantity_count, created_at, notes, recipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tx.id,
        tx.inventoryLotId,
        tx.type,
        toSqlOptional(tx.quantityG),
        toSqlOptional(tx.quantityCount),
        tx.createdAt,
        toSqlOptional(tx.notes),
        toSqlOptional(tx.recipeId),
      ],
    );
  }

  async listTransactions(inventoryLotId?: string): Promise<InventoryTransaction[]> {
    const rows = inventoryLotId
      ? await this.db.select(
          "SELECT * FROM inventory_transactions WHERE inventory_lot_id = ? ORDER BY created_at, rowid",
          [inventoryLotId],
        )
      : await this.db.select("SELECT * FROM inventory_transactions ORDER BY created_at, rowid");
    return rows.map(rowToTransaction);
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM inventory_transactions");
    await this.db.execute("DELETE FROM inventory_lots");
  }
}
