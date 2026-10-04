import { isTauri } from "@tauri-apps/api/core";

/**
 * Save / open text files. In the desktop app this uses native dialogs and the
 * Tauri fs plugin (only paths chosen by the user are accessible); in the
 * browser preview it falls back to a download link and a file input.
 */

/** @returns the saved path (or file name in the browser), or null if cancelled. */
export async function saveTextFile(
  suggestedName: string,
  contents: string,
): Promise<string | null> {
  if (isTauri()) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return null;
    await writeTextFile(path, contents);
    return path;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}

/** @returns the file's text, or null if cancelled. */
export async function openTextFile(): Promise<string | null> {
  if (isTauri()) {
    const [{ open }, { readTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path || Array.isArray(path)) return null;
    return readTextFile(path);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.click();
  });
}
