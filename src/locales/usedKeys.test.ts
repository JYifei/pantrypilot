import { describe, expect, it } from "vitest";
import zhCN from "./zh-CN.json";

type Tree = { [key: string]: string | Tree };

function hasKey(tree: Tree, key: string): boolean {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return false;
    node = node[part];
  }
  return typeof node === "string";
}

const sources = import.meta.glob<string>(["/src/**/*.tsx", "/src/**/*.ts", "!/src/**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("translation keys used in source", () => {
  it('every literal t("...") key exists in zh-CN', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    const missing: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const match of text.matchAll(/\bt\(\s*"([a-zA-Z][\w]*(?:\.[\w]+)+)"/g)) {
        const key = match[1]!;
        if (!hasKey(zhCN as Tree, key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
