import { describe, expect, it } from "vitest";
import enUS from "./en-US.json";
import jaJP from "./ja-JP.json";
import zhCN from "./zh-CN.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else for (const [k, v] of flatten(value, path)) result.set(k, v);
  }
  return result;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!).sort();
}

const zh = flatten(zhCN as Tree);
const en = flatten(enUS as Tree);
const ja = flatten(jaJP as Tree);

describe("locale files", () => {
  it("zh-CN (primary language) has no empty strings", () => {
    for (const [key, value] of zh) expect(value.trim(), key).not.toBe("");
  });

  it("en-US covers every zh-CN key", () => {
    const missing = [...zh.keys()].filter((k) => !en.has(k));
    expect(missing).toEqual([]);
  });

  it("other locales contain no keys unknown to zh-CN", () => {
    expect([...en.keys()].filter((k) => !zh.has(k))).toEqual([]);
    expect([...ja.keys()].filter((k) => !zh.has(k))).toEqual([]);
  });

  it("keeps interpolation placeholders consistent", () => {
    for (const [key, value] of zh) {
      for (const other of [en, ja]) {
        const translated = other.get(key);
        if (translated) expect(placeholders(translated), key).toEqual(placeholders(value));
      }
    }
  });
});
