import { isTauri } from "@tauri-apps/api/core";
import { APP_CONFIG } from "@/config/app";
import type { SqlDatabase } from "./database";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Browser-only development preview (`pnpm dev` without Tauri): SQLite compiled
 * to WebAssembly, persisted to localStorage. Not intended for real data.
 */
async function openBrowserPreviewDatabase(): Promise<SqlDatabase> {
  const [{ default: initSqlJs }, { default: wasmUrl }, { createSqlJsDatabase }] = await Promise.all(
    [import("sql.js"), import("sql.js/dist/sql-wasm.wasm?url"), import("./sqljsDatabase")],
  );
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const stored = localStorage.getItem(APP_CONFIG.devStorageKey);
  return createSqlJsDatabase(SQL, {
    data: stored ? base64ToBytes(stored) : undefined,
    onPersist: (bytes) => localStorage.setItem(APP_CONFIG.devStorageKey, bytesToBase64(bytes)),
    description: `localStorage["${APP_CONFIG.devStorageKey}"] (browser preview)`,
  });
}

/** Open the SQLite database appropriate for the current runtime. */
export async function openDatabase(): Promise<SqlDatabase> {
  if (isTauri()) {
    const { openTauriDatabase } = await import("./tauriDatabase");
    const { appConfigDir, join } = await import("@tauri-apps/api/path");
    const location = await join(await appConfigDir(), APP_CONFIG.databaseFileName);
    return openTauriDatabase(APP_CONFIG.databaseUrl, location);
  }
  return openBrowserPreviewDatabase();
}
