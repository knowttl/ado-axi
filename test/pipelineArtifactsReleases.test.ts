import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";
import { pipelineCommand } from "../src/commands/pipeline.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const fetchMock = vi.fn<typeof fetch>();
const secret = "synthetic-secret-never-output";
const artifact = { id: 1, name: "drop", resource: { type: "Container", data: "#/1/drop",
  properties: { artifactsize: "6" }, downloadUrl: `https://example.com/download?sig=${secret}` } };
const release = { id: 12, name: "Release-12", status: "active", createdOn: "2026-01-01T00:00:00Z",
  releaseDefinition: { id: 4, name: "Synthetic release" }, description: "Synthetic release description",
  variables: { token: { value: secret, isSecret: true }, environment: { value: "test", isSecret: false } },
  environments: [{ id: 1, name: "Test", status: "succeeded", variables: { password: { value: secret, isSecret: true } } }],
  artifacts: [{ alias: "_CI", type: "Build", definitionReference: { version: { id: "42", name: "42" } } }],
  _links: { web: { href: `https://user:${secret}@example.com` } }, url: `https://example.com?token=${secret}` };
let dir: string;
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json", ...headers },
});
function run(argv: string[]) { return pipelineCommand([...argv, ...context]); }
function sent(index: number) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
}
function runCli(argv: string[], replay: string, writes: string) {
  return spawnSync(process.execPath, [
    "--import", createRequire(import.meta.url).resolve("tsx"),
    "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.mjs", import.meta.url)),
    fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)), "pipeline", ...argv, ...context,
  ], { cwd: dir, encoding: "utf8", timeout: 10_000,
    env: { ...process.env, ADO_AXI_WRITES: writes, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: replay } });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ado-artifact-release-"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ADO_AXI_PAT", "synthetic-placeholder");
  vi.stubEnv("ADO_AXI_CONFIG", fileURLToPath(new URL("./fixtures/absent-config.json", import.meta.url)));
  vi.stubEnv("ADO_AXI_WRITES", "0");
  clearCredentialCache();
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearCredentialCache();
  await rm(dir, { recursive: true, force: true });
});

describe("TD-065 run artifacts", () => {
  it("downloads through the CLI with writes disabled and reports TOON byte counts", async () => {
    const replay = join(dir, "replay.json");
    await writeFile(replay, JSON.stringify({ calls: [{ method: "GET",
      url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/build/builds/42/artifacts?artifactName=drop&%24format=zip&api-version=7.1",
      status: 200, contentType: "application/zip", body: "PK-synthetic-archive" }] }));
    const out = join(dir, "drop.zip");
    const result = runCli(["runs", "artifact", "download", "42", "--name", "drop", "--out", out], replay, "0");
    expect(result.status).toBe(0);
    expect(decode(result.stdout)).toEqual({ artifact: { run: 42, name: "drop", path: out, bytes: 20, "max-bytes": 104857600 } });
    expect(await readFile(out, "utf8")).toBe("PK-synthetic-archive");
  });
  it("bounds artifact lists and withholds download URLs even under --full", async () => {
    fetchMock.mockResolvedValueOnce(json({ count: 2, value: [artifact, { ...artifact, id: 2, name: "logs" }] }));
    const result = await run(["runs", "artifact", "list", "42", "--limit", "1", "--full"]);
    expect(result).toMatchObject({ run: 42, count: "1 of 2 artifacts", omitted: 1,
      artifacts: [{ id: 1, name: "drop", type: "Container", bytes: "6" }],
      help: ["Pass --limit 2 to include all artifacts; --full expands fields, not the limit", expect.stringContaining("--name <name> --out <path>")] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(0).url).toBe("https://dev.azure.com/synthetic-org/SyntheticProject/_apis/build/builds/42/artifacts?api-version=7.1");
    expect(sent(0).method).toBe("GET");
  });

  it("reports an explicit empty artifact list", async () => {
    fetchMock.mockResolvedValueOnce(json({ count: 0, value: [] }));
    expect(await run(["runs", "artifact", "list", "42"]))
      .toMatchObject({ count: "0 of 0 artifacts", artifacts: [], omitted: 0 });
  });

  it("downloads exact binary bytes with writes disabled to the named output", async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0, 255, 128, 10]);
    fetchMock.mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "application/zip" } }));
    const out = join(dir, "artifact.zip");
    expect(await run(["runs", "artifact", "download", "42", "--name", "drop #1", "--out", out]))
      .toEqual({ artifact: { run: 42, name: "drop #1", path: out, bytes: 6, "max-bytes": 104857600 } });
    expect(await readFile(out)).toEqual(bytes);
    expect(sent(0)).toEqual({ method: "GET", body: undefined,
      url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/build/builds/42/artifacts?artifactName=drop+%231&%24format=zip&api-version=7.1" });
  });

  it("preserves existing output unless --force is set", async () => {
    const out = join(dir, "artifact.zip");
    await writeFile(out, "original");
    fetchMock.mockResolvedValueOnce(new Response("replacement"));
    await expect(run(["runs", "artifact", "download", "42", "--name", "drop", "--out", out]))
      .rejects.toMatchObject({ code: "FILE_EXISTS" });
    expect(await readFile(out, "utf8")).toBe("original");
  });

  it("overwrites only with explicit --force", async () => {
    const out = join(dir, "artifact.zip");
    await writeFile(out, "original");
    fetchMock.mockResolvedValueOnce(new Response("replacement"));
    await run(["runs", "artifact", "download", "42", "--name", "drop", "--out", out, "--force"]);
    expect(await readFile(out, "utf8")).toBe("replacement");
  });

  it.each([
    { name: "Content-Length", response: () => new Response("unused", { headers: { "content-length": "104857601" } }) },
    { name: "stream without Content-Length", response: () => new Response(new Uint8Array(104857601)) },
  ])("enforces the byte bound using $name without changing existing output", async ({ response }) => {
    const out = join(dir, "artifact.zip");
    await writeFile(out, "original");
    fetchMock.mockResolvedValueOnce(response());
    await expect(run(["runs", "artifact", "download", "42", "--name", "drop", "--out", out, "--force"]))
      .rejects.toMatchObject({ code: "SIZE_LIMIT", message: "artifact exceeds the 104857600 byte download limit" });
    expect(await readFile(out, "utf8")).toBe("original");
  });

  it("preserves the destination on a sign-in response", async () => {
    const out = join(dir, "artifact.zip");
    await writeFile(out, "original");
    fetchMock.mockResolvedValueOnce(new Response("<title>Azure DevOps Services | Sign In</title>"));
    await expect(run(["runs", "artifact", "download", "42", "--name", "drop", "--out", out, "--force"]))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(await readFile(out, "utf8")).toBe("original");
  });

  it.each([
    ["runs", "artifact", "download", "42", "--name", "drop"],
    ["runs", "artifact", "download", "42", "--out", "artifact.zip"],
    ["runs", "artifact", "list", "0"], ["runs", "artifact", "list", "42", "--limit", "0"],
    ["runs", "artifact", "list", "42", "extra"], ["runs", "artifact", "upload", "42"],
  ])("rejects invalid artifact input before a request: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TD-065 Classic releases", () => {
  it("creates through the CLI only when writes are enabled and prints no response secrets", async () => {
    const replay = join(dir, "replay.json");
    await writeFile(replay, JSON.stringify({ calls: [{ method: "POST",
      url: "https://vsrm.dev.azure.com/synthetic-org/SyntheticProject/_apis/release/releases?api-version=7.1",
      status: 200, body: JSON.stringify({ ...release, status: "draft", isDraft: true }) }] }));
    const result = runCli(["release", "create", "--definition", "4", "--draft", "true"], replay, "1");
    expect(result.status).toBe(0);
    expect(decode(result.stdout)).toEqual({ created: { id: 12, name: "Release-12", status: "draft" },
      help: ["Run `ado-axi pipeline release show 12` to inspect the release"] });
    expect(result.stdout).not.toContain(secret);
  });
  it("counts paged releases and bounds full list output with writes disabled", async () => {
    fetchMock.mockResolvedValueOnce(json({ count: 1, value: [release] }, 200, { "x-ms-continuationtoken": "next" }))
      .mockResolvedValueOnce(json({ count: 1, value: [{ ...release, id: 13, name: "Release-13" }] }));
    const result = await run(["release", "list", "--definition", "4", "--limit", "1", "--full"]);
    expect(result).toMatchObject({ count: "1 of 2 releases", omitted: 1, releases: [{ id: 12, name: "Release-12" }] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(0).url).toBe("https://vsrm.dev.azure.com/synthetic-org/SyntheticProject/_apis/release/releases?definitionId=4&%24top=1&api-version=7.1");
    expect(sent(1).url).toContain("continuationToken=next");
    expect(sent(1).method).toBe("GET");
  });

  it("reports no releases explicitly", async () => {
    fetchMock.mockResolvedValueOnce(json({ count: 0, value: [] }));
    expect(await run(["release", "list"])).toMatchObject({ count: "0 of 0 releases", releases: [], omitted: 0 });
  });

  it("masks release secrets and URLs under --full and bounds nested environments", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...release, environments: [...release.environments, { id: 2, name: "Prod", status: "notStarted" }] }));
    const result = await run(["release", "show", "12", "--full", "--limit", "1"]);
    expect(result).toMatchObject({ release: { id: 12, url: "***", _links: "***",
      variables: [{ name: "token", value: "***", isSecret: true }],
      environments: { items: [{ name: "Test", status: "succeeded" }], total: 2, omitted: 1 } } });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(0).url).toBe("https://vsrm.dev.azure.com/synthetic-org/SyntheticProject/_apis/release/releases/12?api-version=7.1");
  });

  it("truncates descriptions by default and expands them with --full", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...release, description: "x".repeat(1500) }))
      .mockResolvedValueOnce(json({ ...release, description: "x".repeat(1500) }));
    const preview = await run(["release", "show", "12"]);
    const full = await run(["release", "show", "12", "--full"]);
    expect(String((preview.release as Record<string, unknown>).description).length).toBeLessThan(1500);
    expect((full.release as Record<string, unknown>).description).toBe("x".repeat(1500));
  });

  it("creates a release with selected versions and draft status without exposing response secrets", async () => {
    vi.stubEnv("ADO_AXI_WRITES", "1");
    fetchMock.mockResolvedValueOnce(json({ ...release, status: "draft", isDraft: true }));
    const artifacts = [{ alias: "_CI", instanceReference: { id: "42" } }];
    expect(await run(["release", "create", "--definition", "4", "--description", "Synthetic deployment", "--draft", "true", "--artifacts", JSON.stringify(artifacts)]))
      .toMatchObject({ created: { id: 12, name: "Release-12", status: "draft" } });
    expect(sent(0)).toEqual({ method: "POST", url: "https://vsrm.dev.azure.com/synthetic-org/SyntheticProject/_apis/release/releases?api-version=7.1",
      body: { definitionId: 4, description: "Synthetic deployment", isDraft: true, artifacts } });
  });

  it.each([
    ["release", "create"], ["release", "create", "--definition", "0"],
    ["release", "create", "--definition", "4", "--artifacts", "{}"],
    ["release", "create", "--definition", "4", "--artifacts", "[null]"],
    ["release", "create", "--definition", "4", "--artifacts", "[{\"alias\":\"_CI\"}]"],
    ["release", "create", "--definition", "4", "--draft", "maybe"], ["release", "show", "0"],
  ])("rejects invalid release input before a request: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("withholds secret-bearing create errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: secret }, 400));
    await expect(run(["release", "create", "--definition", "4"]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: "release create failed; response details withheld to protect secrets" });
  });
});
