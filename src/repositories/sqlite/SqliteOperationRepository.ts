import type { SqlDatabase } from "@/db/database";
import type { AppliedOperation, OperationRepository } from "../types";

export class SqliteOperationRepository implements OperationRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(id: string): Promise<AppliedOperation | null> {
    const rows = await this.db.select("SELECT * FROM applied_operations WHERE id = ?", [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      kind: String(row.kind),
      requestJson: String(row.request_json),
      resultJson: String(row.result_json),
      createdAt: String(row.created_at),
    };
  }

  async record(operation: AppliedOperation): Promise<void> {
    await this.db.execute(
      `INSERT INTO applied_operations (id, kind, request_json, result_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        operation.id,
        operation.kind,
        operation.requestJson,
        operation.resultJson,
        operation.createdAt,
      ],
    );
  }

  async deleteAll(): Promise<void> {
    await this.db.execute("DELETE FROM applied_operations");
  }
}
