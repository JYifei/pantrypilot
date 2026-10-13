## What and why

## How it was checked

- [ ] `pnpm check`
- [ ] `pnpm build`
- [ ] `cargo fmt --check` and `cargo test` (if `src-tauri/` or a migration changed)
- [ ] Tried in the desktop app / the browser preview (say which, and what you did)

Only tick what you actually ran. The browser preview and sql.js tests do not prove desktop
behaviour; say so if the desktop app was not tried.

## Data and compatibility

- [ ] No released migration was edited; new schema changes are a new migration
- [ ] Backup `schemaVersion` and upgrade step added if the backup format changed
- [ ] New UI text exists in zh-CN, en-US and ja-JP
- [ ] No personal inventory, prices, notes or backup files in the diff or screenshots
