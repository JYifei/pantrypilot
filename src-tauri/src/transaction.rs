//! Atomic multi-statement writes on the SQL plugin's own connection pool.
//!
//! The JavaScript side of `tauri-plugin-sql` sends every statement separately,
//! possibly on different pooled connections, so it cannot hold a transaction
//! open. This command runs a whole batch inside one sqlx transaction instead.
//! The SQL itself is still produced by the TypeScript repositories.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{Sqlite, SqlitePool};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
    /// The statement must change exactly this many rows (compare-and-set guard).
    pub expect_rows_affected: Option<u64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TransactionError {
    DatabaseNotLoaded,
    #[serde(rename_all = "camelCase")]
    StaleWrite {
        statement_index: usize,
        rows_affected: u64,
    },
    #[serde(rename_all = "camelCase")]
    Sql {
        statement_index: Option<usize>,
        message: String,
    },
}

fn sql_error(statement_index: Option<usize>, error: sqlx::Error) -> TransactionError {
    TransactionError::Sql {
        statement_index,
        message: error.to_string(),
    }
}

/// Bind parameters exactly like `tauri-plugin-sql` does, so values written
/// through either path are stored identically.
fn bind_params<'q>(
    mut query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    params: &[JsonValue],
) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    for value in params {
        query = if value.is_null() {
            query.bind(None::<JsonValue>)
        } else if let Some(text) = value.as_str() {
            query.bind(text.to_owned())
        } else if let Some(number) = value.as_number() {
            query.bind(number.as_f64().unwrap_or_default())
        } else {
            query.bind(value.clone())
        };
    }
    query
}

/// Run all statements in one transaction. Any error or guard mismatch rolls
/// everything back. Returns the rows affected per statement.
pub async fn execute_atomically(
    pool: &SqlitePool,
    statements: &[Statement],
) -> Result<Vec<u64>, TransactionError> {
    let mut tx = pool.begin().await.map_err(|e| sql_error(None, e))?;
    let mut affected = Vec::with_capacity(statements.len());
    for (index, statement) in statements.iter().enumerate() {
        let query = bind_params(sqlx::query(&statement.sql), &statement.params);
        let outcome = match query.execute(&mut *tx).await {
            Ok(result) => match statement.expect_rows_affected {
                Some(expected) if result.rows_affected() != expected => {
                    Err(TransactionError::StaleWrite {
                        statement_index: index,
                        rows_affected: result.rows_affected(),
                    })
                }
                _ => Ok(result.rows_affected()),
            },
            Err(error) => Err(sql_error(Some(index), error)),
        };
        match outcome {
            Ok(rows) => affected.push(rows),
            Err(error) => {
                // Dropping the transaction would also roll back, but only lazily.
                let _ = tx.rollback().await;
                return Err(error);
            }
        }
    }
    tx.commit().await.map_err(|e| sql_error(None, e))?;
    Ok(affected)
}

#[tauri::command]
pub async fn run_transaction(
    instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<Statement>,
) -> Result<Vec<u64>, TransactionError> {
    let pools = instances.0.read().await;
    match pools.get(&db) {
        Some(DbPool::Sqlite(pool)) => execute_atomically(pool, &statements).await,
        _ => Err(TransactionError::DatabaseNotLoaded),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::path::PathBuf;

    fn stmt(sql: &str, params: Vec<JsonValue>) -> Statement {
        Statement {
            sql: sql.to_owned(),
            params,
            expect_rows_affected: None,
        }
    }

    fn guarded(sql: &str, params: Vec<JsonValue>, expected: u64) -> Statement {
        Statement {
            expect_rows_affected: Some(expected),
            ..stmt(sql, params)
        }
    }

    /// A file-backed database, so tests can close and reopen it.
    struct TempDb {
        path: PathBuf,
    }

    impl TempDb {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("pantrypilot-tx-{name}-{}.db", std::process::id()));
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
            }
            TempDb { path }
        }

        async fn open(&self) -> SqlitePool {
            let options = SqliteConnectOptions::new()
                .filename(&self.path)
                .create_if_missing(true);
            SqlitePoolOptions::new()
                .max_connections(4)
                .connect_with(options)
                .await
                .expect("open test database")
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", self.path.display()));
            }
        }
    }

    async fn setup(pool: &SqlitePool) {
        let statements = [
            stmt(
                "CREATE TABLE lots (id TEXT PRIMARY KEY, remaining REAL NOT NULL)",
                vec![],
            ),
            stmt(
                "CREATE TABLE txs (id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES lots(id), grams REAL NOT NULL)",
                vec![],
            ),
            stmt(
                "INSERT INTO lots (id, remaining) VALUES ('a', 100), ('b', 100)",
                vec![],
            ),
        ];
        execute_atomically(pool, &statements).await.expect("setup");
    }

    async fn state(pool: &SqlitePool) -> (Vec<f64>, i64) {
        let remaining: Vec<f64> = sqlx::query_scalar("SELECT remaining FROM lots ORDER BY id")
            .fetch_all(pool)
            .await
            .unwrap();
        let txs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM txs")
            .fetch_one(pool)
            .await
            .unwrap();
        (remaining, txs)
    }

    fn consume(lot: &str, tx_id: &str, from: f64, to: f64) -> [Statement; 2] {
        [
            stmt(
                "INSERT INTO txs (id, lot_id, grams) VALUES (?, ?, ?)",
                vec![json!(tx_id), json!(lot), json!(from - to)],
            ),
            guarded(
                "UPDATE lots SET remaining = ? WHERE id = ? AND remaining IS ?",
                vec![json!(to), json!(lot), json!(from)],
                1,
            ),
        ]
    }

    #[tokio::test]
    async fn commits_all_statements() {
        let db = TempDb::new("commit");
        let pool = db.open().await;
        setup(&pool).await;
        let mut batch: Vec<Statement> = consume("a", "t1", 100.0, 90.0).into();
        batch.extend(consume("b", "t2", 100.0, 70.0));
        let affected = execute_atomically(&pool, &batch).await.unwrap();
        assert_eq!(affected, vec![1, 1, 1, 1]);
        pool.close().await;

        let reopened = db.open().await;
        assert_eq!(state(&reopened).await, (vec![90.0, 70.0], 2));
    }

    #[tokio::test]
    async fn rolls_back_when_a_later_statement_fails() {
        let db = TempDb::new("sql-error");
        let pool = db.open().await;
        setup(&pool).await;
        let mut batch: Vec<Statement> = consume("a", "t1", 100.0, 90.0).into();
        batch.push(stmt("UPDATE missing_table SET x = 1", vec![]));
        let error = execute_atomically(&pool, &batch).await.unwrap_err();
        assert!(matches!(
            error,
            TransactionError::Sql {
                statement_index: Some(2),
                ..
            }
        ));
        assert_eq!(state(&pool).await, (vec![100.0, 100.0], 0));
        pool.close().await;

        let reopened = db.open().await;
        assert_eq!(state(&reopened).await, (vec![100.0, 100.0], 0));
    }

    #[tokio::test]
    async fn rolls_back_when_a_guard_does_not_match() {
        let db = TempDb::new("stale");
        let pool = db.open().await;
        setup(&pool).await;
        let mut batch: Vec<Statement> = consume("a", "t1", 100.0, 90.0).into();
        // Lot b was read as 80 g, but it actually holds 100 g.
        batch.extend(consume("b", "t2", 80.0, 50.0));
        let error = execute_atomically(&pool, &batch).await.unwrap_err();
        assert_eq!(
            error,
            TransactionError::StaleWrite {
                statement_index: 3,
                rows_affected: 0
            }
        );
        assert_eq!(state(&pool).await, (vec![100.0, 100.0], 0));
    }

    #[tokio::test]
    async fn competing_writes_cannot_both_apply() {
        let db = TempDb::new("race");
        let pool = db.open().await;
        setup(&pool).await;
        // Both callers read 100 g and try to consume 80 g.
        let first: Vec<Statement> = consume("a", "t1", 100.0, 20.0).into();
        let second: Vec<Statement> = consume("a", "t2", 100.0, 20.0).into();
        let (r1, r2) = tokio::join!(
            execute_atomically(&pool, &first),
            execute_atomically(&pool, &second)
        );
        assert_eq!(
            r1.is_ok() as u8 + r2.is_ok() as u8,
            1,
            "exactly one write wins: {r1:?} {r2:?}"
        );
        assert_eq!(state(&pool).await, (vec![20.0, 100.0], 1));
    }

    #[test]
    fn deserializes_statements_from_javascript() {
        let statements: Vec<Statement> = serde_json::from_value(json!([
            { "sql": "SELECT 1", "params": [1, "x", null] },
            { "sql": "UPDATE t SET a = 1", "params": [], "expectRowsAffected": 1 }
        ]))
        .unwrap();
        assert_eq!(statements[0].expect_rows_affected, None);
        assert_eq!(statements[1].expect_rows_affected, Some(1));
    }

    #[test]
    fn serializes_errors_for_javascript() {
        let value = serde_json::to_value(TransactionError::StaleWrite {
            statement_index: 2,
            rows_affected: 0,
        })
        .unwrap();
        assert_eq!(
            value,
            json!({ "kind": "staleWrite", "statementIndex": 2, "rowsAffected": 0 })
        );
    }
}
