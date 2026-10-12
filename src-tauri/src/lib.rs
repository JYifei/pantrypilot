use tauri_plugin_sql::{Migration, MigrationKind};

mod transaction;

/// Must match `APP_CONFIG.databaseUrl` in src/config/app.ts.
const DATABASE_URL: &str = "sqlite:pantrypilot.db";

/// Schema migrations, shared with the TypeScript side (src/db/migrations).
/// Versions must match `MIGRATIONS` in src/db/migrations/index.ts.
/// Never edit a released migration: the plugin stores checksums.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../../src/db/migrations/0001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "recipes",
            sql: include_str!("../../src/db/migrations/0002_recipes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "applied_operations",
            sql: include_str!("../../src/db/migrations/0003_applied_operations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "cooking_sessions",
            sql: include_str!("../../src/db/migrations/0004_cooking_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "meal_plan",
            sql: include_str!("../../src/db/migrations/0005_meal_plan.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use sqlx::sqlite::SqlitePoolOptions;

    #[test]
    fn versions_are_consecutive_and_sql_is_plain_text() {
        for (index, migration) in migrations().iter().enumerate() {
            assert_eq!(migration.version, index as i64 + 1);
            assert!(
                !migration.sql.contains('\0'),
                "migration {} contains NUL bytes (not UTF-8?)",
                migration.version
            );
        }
    }

    /// Runs the SQL compiled into the app, in order and one transaction per
    /// migration, with SQLite through sqlx as the desktop app does.
    #[tokio::test]
    async fn migrations_apply_in_order_and_leave_older_transactions_unlinked() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory database");

        for migration in migrations() {
            if migration.version == 4 {
                sqlx::raw_sql(
                    "INSERT INTO ingredient_definitions (id, name_json, category, created_at, updated_at)
                       VALUES ('onion_raw', '{\"zhCN\":\"洋葱\"}', 'vegetable', 't', 't');
                     INSERT INTO inventory_lots (id, ingredient_definition_id, remaining_weight_g, storage, created_at, updated_at)
                       VALUES ('lot-old', 'onion_raw', 120, 'refrigerated', 't', 't');
                     INSERT INTO inventory_transactions (id, inventory_lot_id, type, quantity_g, created_at, recipe_id)
                       VALUES ('tx-old', 'lot-old', 'consume', 80, 't', 'recipe_gyudon');",
                )
                .execute(&pool)
                .await
                .expect("insert data recorded before migration 4");
            }
            let mut tx = pool.begin().await.expect("begin");
            sqlx::raw_sql(migration.sql)
                .execute(&mut *tx)
                .await
                .unwrap_or_else(|e| panic!("migration {} failed: {e}", migration.version));
            tx.commit().await.expect("commit");
        }

        let session: Option<String> = sqlx::query_scalar(
            "SELECT cooking_session_id FROM inventory_transactions WHERE id = 'tx-old'",
        )
        .fetch_one(&pool)
        .await
        .expect("read old transaction");
        assert_eq!(session, None);

        sqlx::raw_sql(
            "INSERT INTO cooking_sessions (id, cooked_at, local_date, recipe_id, recipe_name_json, servings, items_json, created_at)
               VALUES ('s1', 't', '2026-10-10', NULL, '{}', 2, '[]', 't');
             INSERT INTO inventory_transactions (id, inventory_lot_id, type, quantity_g, created_at, cooking_session_id)
               VALUES ('tx-new', 'lot-old', 'consume', 20, 't', 's1');",
        )
        .execute(&pool)
        .await
        .expect("record a session and a linked transaction");

        let rejected = sqlx::raw_sql(
            "INSERT INTO cooking_sessions (id, cooked_at, local_date, recipe_name_json, servings, items_json, created_at)
               VALUES ('s2', 't', '2026-10-10', '{}', 0, '[]', 't');",
        )
        .execute(&pool)
        .await;
        assert!(rejected.is_err(), "servings must be positive");

        sqlx::raw_sql(
            "INSERT INTO plan_entries (id, recipe_id, servings, position, created_at, updated_at)
               VALUES ('p1', 'recipe_gyudon', 2, 0, 't', 't');
             INSERT INTO shopping_items (id, source, ingredient_definition_id, planned_grams, created_at, updated_at)
               VALUES ('plan:onion_raw', 'plan', 'onion_raw', 60, 't', 't');
             INSERT INTO shopping_items (id, source, label, created_at, updated_at)
               VALUES ('m1', 'manual', 'milk', 't', 't');",
        )
        .execute(&pool)
        .await
        .expect("record a plan and shopping list");

        let choices: String =
            sqlx::query_scalar("SELECT choices_json FROM plan_entries WHERE id = 'p1'")
                .fetch_one(&pool)
                .await
                .expect("read plan entry");
        assert_eq!(choices, "{}");

        for (statement, why) in [
            (
                "INSERT INTO shopping_items (id, source, ingredient_definition_id, created_at, updated_at)
                   VALUES ('plan:onion_raw#2', 'plan', 'onion_raw', 't', 't');",
                "one plan item per ingredient",
            ),
            (
                "INSERT INTO shopping_items (id, source, created_at, updated_at)
                   VALUES ('plan:none', 'plan', 't', 't');",
                "plan items need an ingredient",
            ),
            (
                "INSERT INTO shopping_items (id, source, created_at, updated_at)
                   VALUES ('m2', 'manual', 't', 't');",
                "manual items need a label",
            ),
            (
                "INSERT INTO plan_entries (id, recipe_id, servings, position, created_at, updated_at)
                   VALUES ('p2', 'recipe_gyudon', 0, 1, 't', 't');",
                "plan servings must be positive",
            ),
        ] {
            assert!(sqlx::raw_sql(statement).execute(&pool).await.is_err(), "{why}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![transaction::run_transaction])
        .run(tauri::generate_context!())
        .expect("error while running PantryPilot");
}
