import { describe, expect, it } from "vitest";
import cargoToml from "../../src-tauri/Cargo.toml?raw";
import tauriConf from "../../src-tauri/tauri.conf.json";
import packageJson from "../../package.json";
import { APP_CONFIG } from "./app";

describe("app version", () => {
  it("is the same in package.json, the app config, tauri.conf.json and Cargo.toml", () => {
    const cargoVersion = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
    expect({
      appConfig: APP_CONFIG.version,
      tauriConf: tauriConf.version,
      cargoToml: cargoVersion,
    }).toEqual({
      appConfig: packageJson.version,
      tauriConf: packageJson.version,
      cargoToml: packageJson.version,
    });
  });
});
