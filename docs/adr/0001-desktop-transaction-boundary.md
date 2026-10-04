# ADR 0001: Desktop transaction boundary

Status: accepted (V0.2, P0-A)

## Problem

Cooking writes several lot updates and transactions; a replacing import deletes everything and
re-inserts it. Both were sent as separate `execute` calls through `@tauri-apps/plugin-sql`. The
plugin keeps a connection pool and has no transaction API, so a failure half way left partial
data (two consume transactions but only one lot reduced; an import that stopped after the
deletes). Sending `BEGIN` and `COMMIT` as separate calls does not help: they can land on
different pooled connections.

## Decision

- Add one Tauri command, `run_transaction`, that receives a list of `{ sql, params,
expectRowsAffected? }` and runs it with `pool.begin()` / `commit()` on the pool the plugin
  already opened for the same database (`DbInstances`). No second connection pool, no second
  migration path.
- Keep SQL in the repository layer. `Repositories.atomic(work)` records repository writes and
  hands them to `SqlDatabase.transaction` as one batch; services stay SQL-free.
- Because reads happen before the batch, lot updates are compare-and-set guarded by
  `expectRowsAffected`. On a mismatch the batch rolls back and the service re-reads and retries.
- Make cooking idempotent with a client-generated operation ID stored in `applied_operations`
  inside the same transaction.
- sql.js gets the same `transaction` semantics and persists only after a commit.

## Alternatives considered

- **Rust use-case commands** (e.g. a `cook` command in Rust). Fully atomic read-check-write, but
  duplicates domain logic that already lives in TypeScript and is tested there.
- **A dedicated single-connection pool in Rust.** Simpler locking, but a second pool on the same
  file with its own pragmas and migration timing.
- **Ordering writes and validating first** (the previous approach). Cheap, but it does not
  survive a failure in the middle of a write.

## Costs

- A batch cannot use the result of an earlier statement in the same batch; work that needs that
  has to be split or expressed in SQL.
- Optimistic guards can make a write fail under contention; services retry three times and then
  report `stale`.
- The in-process write lock serialises only this app's writes. Another process writing the same
  file is not coordinated beyond SQLite's own locking and the guards.
- The desktop path is covered by Rust tests against a temporary SQLite file and by manual checks
  in the running app; the TypeScript fault-injection tests run on sql.js only.
