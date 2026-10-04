use tauri_plugin_sql::{Migration, MigrationKind};

/// Must match `APP_CONFIG.databaseUrl` in src/config/app.ts.
const DATABASE_URL: &str = "sqlite:pantrypilot.db";

/// Schema migrations, shared with the TypeScript side (src/db/migrations).
/// Versions must match `MIGRATIONS` in src/db/migrations/index.ts.
/// Never edit a released migration: the plugin stores checksums.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial_schema",
        sql: include_str!("../../src/db/migrations/0001_initial_schema.sql"),
        kind: MigrationKind::Up,
    }]
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
        .run(tauri::generate_context!())
        .expect("error while running PantryPilot");
}
