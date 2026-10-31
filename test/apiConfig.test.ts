import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@toon-format/toon";
import { afterEach, beforeEach, expect, it } from "vitest";

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(process.cwd(), ".ado-api-config-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it.each(["_apis/example/items", "https://dev.azure.com/acme/Selected%20Project/_apis/example/items"])(
  "uses the explicit profile file's PAT for %s",
  (path) => {
    const file = join(dir, "selected.json");
    writeFileSync(file, JSON.stringify({ profiles: {
      selected: { org: "acme", project: "Selected Project", auth: "pat", patEnv: "SELECTED_PAT" },
    } }));
    const result = spawnSync(process.execPath, [
      "--import", createRequire(import.meta.url).resolve("tsx"),
      "--import", fileURLToPath(new URL("./fixtures/api-config-fetch.mjs", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)),
      "api", "GET", path, "--config", file, "--profile", "selected", "--project", "Selected Project",
    ], { cwd: dir, encoding: "utf8", timeout: 10_000, input: "",
      env: { ...process.env, ADO_AXI_ORG: "other-org", ADO_AXI_PROJECT: "Environment Project",
        ADO_AXI_CONFIG: fileURLToPath(new URL("./fixtures/repo-admin-config.json", import.meta.url)),
        ADO_AXI_PAT: "synthetic-fallback-pat", SELECTED_PAT: "synthetic-selected-pat", ADO_AXI_WRITES: "0" } });
    const url = "https://dev.azure.com/acme/Selected%20Project/_apis/example/items?api-version=7.1";
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(decode(result.stdout)).toEqual({
      request: { method: "GET", url },
      response: { method: "GET", url, authorization: `Basic ${Buffer.from(":synthetic-selected-pat").toString("base64")}` },
    });
  },
);
