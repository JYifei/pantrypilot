import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import {
  PersistError,
  type SqlDatabase,
  type SqlRow,
  type SqlStatement,
  type SqlValue,
} from "@/db/database";
import { createSqlJsDatabase, type SqlJsOptions } from "@/db/sqljsDatabase";
import { createAppServices } from "@/services/appServices";
import { fixedClock } from "@/test/testDatabase";
import type { LotInput } from "./inventoryService";
import { InvalidInputError } from "./reliability";

const clock = fixedClock("2026-10-04T09:00:00.000Z");
const RECIPE_ID = "recipe_beef_steak";

const onion = (grams: number): LotInput => ({
  ingredientDefinitionId: "onion_raw",
  originalWeightG: grams,
  processing: [],
  storage: "refrigerated",
  opened: false,
});

type Fault = (statement: SqlStatement) => boolean;

/** Fails the nth statement (1-based) whose SQL matches `pattern`. */
function nth(pattern: RegExp, n: number): Fault {
  let seen = 0;
  return (statement) => pattern.test(statement.sql) && ++seen === n;
}

/**
 * Wraps a real database. A matching statement is replaced by one that fails
 * inside the real driver, so rollback is exercised for real.
 */
function faultable(inner: SqlDatabase) {
  let fault: Fault | null = null;
  let beforeWrite: (() => Promise<void>) | null = null;
  let beforeSelect: ((sql: string) => Promise<void>) | null = null;
  const inject = (statement: SqlStatement): SqlStatement =>
    fault?.(statement)
      ? { sql: "INSERT INTO injected_fault (x) VALUES (1)", params: [] }
      : statement;
  const db: SqlDatabase = {
    kind: inner.kind,
    description: inner.description,
    async execute(sql: string, params: SqlValue[] = [], options = {}) {
      if (beforeWrite) await beforeWrite();
      const statement = inject({ sql, params });
      return inner.execute(statement.sql, statement.params, options);
    },
    async select<T extends SqlRow = SqlRow>(sql: string, params?: SqlValue[]) {
      if (beforeSelect) await beforeSelect(sql);
      return inner.select<T>(sql, params);
    },
    async transaction(statements) {
      if (beforeWrite) await beforeWrite();
      return inner.transaction(statements.map(inject));
    },
    withWritesPaused(read) {
      return inner.withWritesPaused(read);
    },
  };
  return {
    db,
    failWhen: (next: Fault | null) => (fault = next),
    /** Simulates another writer committing just before each of our writes. */
    beforeEachWrite: (hook: (() => Promise<void>) | null) => (beforeWrite = hook),
    beforeEachSelect: (hook: ((sql: string) => Promise<void>) | null) => (beforeSelect = hook),
  };
}

/** Runs `change` before the next write only. */
function once(change: () => Promise<unknown>) {
  let done = false;
  return async () => {
    if (done) return;
    done = true;
    await change();
  };
}

async function setup(options: SqlJsOptions = {}) {
  const SQL = await initSqlJs();
  const raw = createSqlJsDatabase(SQL, options);
  const control = faultable(raw);
  const services = await createAppServices(control.db, clock);
  /** Services on the unwrapped database, acting as a concurrent writer. */
  const other = await createAppServices(raw, clock);
  return { SQL, raw, control, services, other };
}

async function snapshot(services: Awaited<ReturnType<typeof createAppServices>>) {
  const lots = await services.inventory.listLots();
  const transactions = await services.inventory.listTransactions();
  return {
    remaining: lots.map((lot) => lot.remainingWeightG),
    transactions: transactions.map((t) => `${t.type}:${t.quantityG ?? ""}:${t.recipeId ?? ""}`),
  };
}

describe("atomic writes", () => {
  it("rolls back every deduction of a cook when the second lot update fails", async () => {
    const { control, services } = await setup();
    const a = await services.inventory.addLot(onion(100));
    const b = await services.inventory.addLot(onion(100));
    const before = await snapshot(services);

    control.failWhen(nth(/^UPDATE inventory_lots/, 2));
    const allocations = [
      { ingredientKey: "x", lotId: a.id, grams: 10 },
      { ingredientKey: "x", lotId: b.id, grams: 30 },
    ];
    await expect(services.recipes.cook(RECIPE_ID, allocations, "op-1")).rejects.toThrow();
    expect(await snapshot(services)).toEqual(before);
    expect(await services.repositories.operations.get("op-1")).toBeNull();

    // The failed attempt left nothing behind, so retrying the same operation applies it once.
    control.failWhen(null);
    expect(await services.recipes.cook(RECIPE_ID, allocations, "op-1")).toEqual({
      ok: true,
      transactionCount: 2,
    });
    expect((await snapshot(services)).remaining).toEqual([90, 70]);
  });

  it("leaves no orphan transaction when the lot update after it fails", async () => {
    const { control, services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    const before = await snapshot(services);

    control.failWhen(nth(/^UPDATE inventory_lots/, 1));
    await expect(services.inventory.consume(lot.id, { grams: 40 })).rejects.toThrow();
    expect(await snapshot(services)).toEqual(before);
  });

  it("adds a lot together with its transaction or not at all", async () => {
    const { control, services } = await setup();
    control.failWhen(nth(/INSERT INTO inventory_transactions/, 1));
    await expect(services.inventory.addLot(onion(100))).rejects.toThrow();
    expect(await snapshot(services)).toEqual({ remaining: [], transactions: [] });
  });

  describe("replacing import", () => {
    async function prepare() {
      const env = await setup();
      const { services } = env;
      await services.ingredients.createCustom({
        name: { zhCN: "原有食材" },
        aliases: [],
        category: "meat",
        nutritionPer100g: null,
        tags: [],
      });
      const lot = await services.inventory.addLot(onion(250));
      await services.inventory.consume(lot.id, { grams: 50 });
      await services.repositories.settings.save({
        language: "ja-JP",
        theme: "dark",
        currency: "JPY",
        region: "JP",
      });

      const source = await setup();
      for (const grams of [100, 200, 300]) {
        const added = await source.services.inventory.addLot(onion(grams));
        await source.services.inventory.consume(added.id, { grams: 10 });
      }
      const backup = await source.services.backup.exportAll();
      return { ...env, backup };
    }

    it.each([
      ["right after deleting the old data", nth(/^\s*INSERT/, 1)],
      ["while inserting transactions", nth(/INSERT INTO inventory_transactions/, 2)],
      ["while saving settings", nth(/INSERT INTO app_settings/, 1)],
    ])("keeps the old data when it fails %s", async (_label, fault) => {
      const { control, services, backup } = await prepare();
      const before = await services.backup.exportAll();

      control.failWhen(fault);
      await expect(services.backup.importReplacingAll(backup)).rejects.toThrow();
      control.failWhen(null);

      const after = await services.backup.exportAll();
      expect(after.data).toEqual(before.data);
      expect(after.data.settings.language).toBe("ja-JP");
    });
  });
});

describe("retry-safe cooking", () => {
  it("applies an operation ID only once", async () => {
    const { services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    const allocations = [{ ingredientKey: "x", lotId: lot.id, grams: 30 }];

    expect(await services.recipes.cook(RECIPE_ID, allocations, "op-1")).toEqual({
      ok: true,
      transactionCount: 1,
    });
    expect(await services.recipes.cook(RECIPE_ID, allocations, "op-1")).toEqual({
      ok: true,
      transactionCount: 1,
      replayed: true,
    });
    expect(await snapshot(services)).toEqual({
      remaining: [70],
      transactions: ["add:100:", `consume:30:${RECIPE_ID}`],
    });
  });

  it("rejects an operation ID reused for a different request", async () => {
    const { services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    await services.recipes.cook(
      RECIPE_ID,
      [{ ingredientKey: "x", lotId: lot.id, grams: 30 }],
      "op-1",
    );

    const reused = await services.recipes.cook(
      RECIPE_ID,
      [{ ingredientKey: "x", lotId: lot.id, grams: 50 }],
      "op-1",
    );
    expect(reused).toEqual({ ok: false, error: "operation_conflict" });
    expect((await snapshot(services)).remaining).toEqual([70]);
  });

  it("deducts once when the same operation is submitted twice at the same time", async () => {
    const { services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    const allocations = [{ ingredientKey: "x", lotId: lot.id, grams: 30 }];

    const results = await Promise.all([
      services.recipes.cook(RECIPE_ID, allocations, "op-1"),
      services.recipes.cook(RECIPE_ID, allocations, "op-1"),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.replayed)).toHaveLength(1);
    expect((await snapshot(services)).remaining).toEqual([70]);
  });
});

describe("concurrent changes", () => {
  it("re-reads and recalculates when a lot changes between reading and committing", async () => {
    const { control, services, other } = await setup();
    const lot = await services.inventory.addLot(onion(100));

    control.beforeEachWrite(once(() => other.inventory.consume(lot.id, { grams: 10 })));
    const result = await services.recipes.cook(RECIPE_ID, [
      { ingredientKey: "x", lotId: lot.id, grams: 50 },
    ]);
    expect(result).toEqual({ ok: true, transactionCount: 1 });
    expect(await snapshot(services)).toEqual({
      remaining: [40],
      transactions: ["add:100:", "consume:10:", `consume:50:${RECIPE_ID}`],
    });
  });

  it("never over-consumes when two consumptions compete for one lot", async () => {
    const { services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    const results = await Promise.all([
      services.inventory.consume(lot.id, { grams: 80 }),
      services.inventory.consume(lot.id, { grams: 80 }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "exceeds_remaining" });
    expect(await snapshot(services)).toEqual({
      remaining: [20],
      transactions: ["add:100:", "consume:80:"],
    });
  });

  it("does not undo a concurrent consumption when marking a lot opened", async () => {
    const { control, services, other } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    control.beforeEachWrite(once(() => other.inventory.consume(lot.id, { grams: 25 })));
    const opened = await services.inventory.setOpened(lot.id, true);
    expect(opened).toMatchObject({ opened: true, remainingWeightG: 75 });
    expect(await snapshot(services)).toEqual({
      remaining: [75],
      transactions: ["add:100:", "consume:25:"],
    });
  });

  it("gives up with `stale` and writes nothing if the lot keeps changing", async () => {
    const { control, services, other } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    control.beforeEachWrite(async () => {
      await other.inventory.consume(lot.id, { grams: 1 });
    });
    const result = await services.recipes.cook(
      RECIPE_ID,
      [{ ingredientKey: "x", lotId: lot.id, grams: 50 }],
      "op-1",
    );
    expect(result).toEqual({ ok: false, error: "stale" });
    control.beforeEachWrite(null);
    const { transactions } = await snapshot(services);
    expect(transactions.filter((t) => t.endsWith(RECIPE_ID))).toHaveLength(0);
    expect(await services.repositories.operations.get("op-1")).toBeNull();
  });

  it("exports a consistent snapshot while a write is in flight", async () => {
    const { control, services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    // Give the consume time to commit between the export reading lots and reading transactions.
    control.beforeEachSelect(async (sql) => {
      if (/FROM inventory_transactions/.test(sql)) await new Promise((r) => setTimeout(r, 20));
    });
    const [backup] = await Promise.all([
      services.backup.exportAll(),
      services.inventory.consume(lot.id, { grams: 40 }),
    ]);
    const [exported] = backup.data.inventoryLots;
    const consumed = backup.data.transactions
      .filter((t) => t.type === "consume")
      .reduce((sum, t) => sum + (t.quantityG ?? 0), 0);
    expect(exported!.remainingWeightG).toBe(100 - consumed);
  });
});

describe("input validation at the service boundary", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -5])(
    "rejects a cook amount of %s without writing",
    async (grams) => {
      const { services } = await setup();
      const lot = await services.inventory.addLot(onion(100));
      const result = await services.recipes.cook(RECIPE_ID, [
        { ingredientKey: "x", lotId: lot.id, grams },
      ]);
      expect(result).toEqual({ ok: false, error: "invalid_quantity", lotId: lot.id });
      expect((await snapshot(services)).remaining).toEqual([100]);
    },
  );

  it("rejects invalid lot quantities before writing", async () => {
    const { services } = await setup();
    await expect(services.inventory.addLot(onion(Number.NaN))).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await expect(services.inventory.addLot(onion(-1))).rejects.toBeInstanceOf(InvalidInputError);
    const lot = await services.inventory.addLot(onion(100));
    await expect(
      services.inventory.updateLot(lot.id, { ...onion(100), remainingWeightG: Infinity }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(await snapshot(services)).toEqual({ remaining: [100], transactions: ["add:100:"] });
  });

  it("rejects non-finite consumption", async () => {
    const { services } = await setup();
    const lot = await services.inventory.addLot(onion(100));
    expect(await services.inventory.consume(lot.id, { grams: Infinity })).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
  });
});

describe("reopening the database file", () => {
  async function persisted() {
    const file: { bytes?: Uint8Array; failNext: boolean } = { failNext: false };
    const env = await setup({
      onPersist: (bytes) => {
        if (file.failNext) throw new Error("quota exceeded");
        file.bytes = bytes;
      },
    });
    const reopen = async () => {
      const db = createSqlJsDatabase(env.SQL, { data: file.bytes });
      return createAppServices(db, clock);
    };
    return { ...env, file, reopen };
  }

  it("keeps a committed cook after reopening", async () => {
    const { services, reopen } = await persisted();
    const lot = await services.inventory.addLot(onion(100));
    await services.recipes.cook(RECIPE_ID, [{ ingredientKey: "x", lotId: lot.id, grams: 30 }]);
    expect((await snapshot(await reopen())).remaining).toEqual([70]);
  });

  it("finds nothing of a failed cook after reopening", async () => {
    const { control, services, reopen } = await persisted();
    const a = await services.inventory.addLot(onion(100));
    const b = await services.inventory.addLot(onion(100));
    control.failWhen(nth(/^UPDATE inventory_lots/, 2));
    await expect(
      services.recipes.cook(RECIPE_ID, [
        { ingredientKey: "x", lotId: a.id, grams: 10 },
        { ingredientKey: "x", lotId: b.id, grams: 10 },
      ]),
    ).rejects.toThrow();
    expect(await snapshot(await reopen())).toEqual(await snapshot(services));
    expect((await snapshot(await reopen())).remaining).toEqual([100, 100]);
  });

  it("reports a failed save instead of success and reverts the in-memory change", async () => {
    const { services, file, reopen } = await persisted();
    const lot = await services.inventory.addLot(onion(100));

    file.failNext = true;
    await expect(services.inventory.consume(lot.id, { grams: 30 })).rejects.toBeInstanceOf(
      PersistError,
    );
    file.failNext = false;
    expect((await snapshot(services)).remaining).toEqual([100]);
    expect((await snapshot(await reopen())).remaining).toEqual([100]);

    await services.inventory.consume(lot.id, { grams: 30 });
    expect((await snapshot(await reopen())).remaining).toEqual([70]);
  });
});
