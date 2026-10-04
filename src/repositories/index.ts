import type { ExecuteOptions, SqlDatabase, SqlRow, SqlStatement, SqlValue } from "@/db/database";
import { SqliteIngredientRepository } from "./sqlite/SqliteIngredientRepository";
import { SqliteInventoryRepository } from "./sqlite/SqliteInventoryRepository";
import { SqliteOperationRepository } from "./sqlite/SqliteOperationRepository";
import { SqliteRecipeRepository } from "./sqlite/SqliteRecipeRepository";
import { SqliteSettingsRepository } from "./sqlite/SqliteSettingsRepository";
import type { Repositories, RepositorySet } from "./types";

export type * from "./types";

function createRepositorySet(db: SqlDatabase): RepositorySet {
  return {
    ingredients: new SqliteIngredientRepository(db),
    inventory: new SqliteInventoryRepository(db),
    recipes: new SqliteRecipeRepository(db),
    settings: new SqliteSettingsRepository(db),
    operations: new SqliteOperationRepository(db),
  };
}

/** Reads go to the real database; writes are collected for one transaction. */
class StatementRecorder implements SqlDatabase {
  readonly statements: SqlStatement[] = [];
  readonly kind;
  readonly description;

  constructor(private readonly inner: SqlDatabase) {
    this.kind = inner.kind;
    this.description = inner.description;
  }

  async execute(sql: string, params: SqlValue[] = [], options: ExecuteOptions = {}) {
    this.statements.push({ sql, params, expectRowsAffected: options.expectRowsAffected });
    return { rowsAffected: options.expectRowsAffected ?? 0 };
  }

  select<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]): Promise<T[]> {
    return this.inner.select<T>(sql, params);
  }

  transaction(): Promise<number[]> {
    throw new Error("Nested transactions are not supported");
  }

  withWritesPaused<T>(): Promise<T> {
    throw new Error("withWritesPaused cannot be used inside a transaction");
  }
}

export function createSqliteRepositories(db: SqlDatabase): Repositories {
  return {
    ...createRepositorySet(db),
    async atomic(work) {
      const recorder = new StatementRecorder(db);
      const result = await work(createRepositorySet(recorder));
      await db.transaction(recorder.statements);
      return result;
    },
    readConsistent(read) {
      return db.withWritesPaused(read);
    },
  };
}
