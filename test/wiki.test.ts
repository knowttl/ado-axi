import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@toon-format/toon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wikiCommand } from "../src/commands/wiki.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const wikiId = "11111111-1111-4111-8111-111111111111";
const repoId = "22222222-2222-4222-8222-222222222222";
const etag = '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"';
const nextEtag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"';
const secret = "synthetic-secret-never-output";
const wiki = { id: wikiId, name: "Synthetic Wiki", type: "projectWiki", repositoryId: repoId,
  remoteUrl: `https://example.com/?token=${secret}`, url: `https://user:${secret}@example.com` };
const page = { id: 12, path: "/Home", content: "# Synthetic page\nHello", gitItemPath: "/Home.md", order: 0 };
const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers },
});
let dir: string;
function run(argv: string[]) { return wikiCommand([...argv, ...context]); }
function sent(index: number) {
  const [url, options] = fetchMock.mock.calls[index]!;
  return { url: String(url), method: options?.method, headers: options?.headers,
    body: options?.body ? JSON.parse(String(options.body)) : undefined };
}
function runCli(argv: string[], replay: string, config: string, writes: string) {
  return spawnSync(process.execPath, [
    "--import", createRequire(import.meta.url).resolve("tsx"),
    "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.ts", import.meta.url)),
    fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)),
    "--config", config, "wiki", ...argv, "--profile", "named",
  ], { cwd: dir, encoding: "utf8", timeout: 10_000,
    env: { ...process.env, ADO_AXI_WRITES: writes, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: replay } });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ado-wiki-"));
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ADO_AXI_CONFIG", fileURLToPath(new URL("./fixtures/absent-config.json", import.meta.url)));
  vi.stubEnv("ADO_AXI_PAT", "synthetic-placeholder"); vi.stubEnv("ADO_AXI_WRITES", "1"); clearCredentialCache();
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearCredentialCache(); await rm(dir, { recursive: true, force: true });
});

describe("TD-065 wiki reads", () => {
  it("bounds wiki lists even under --full and withholds response URLs", async () => {
    vi.stubEnv("ADO_AXI_WRITES", "0");
    fetchMock.mockResolvedValueOnce(json({ count: 2, value: [wiki, { ...wiki, id: repoId, name: "Other wiki" }] }));
    const result = await run(["list", "--limit", "1", "--full"]);
    expect(result).toMatchObject({ count: "1 of 2 wikis", omitted: 1,
      wikis: [{ id: wikiId, name: "Synthetic Wiki", type: "projectWiki", repositoryId: repoId, mappedPath: "" }] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(0).url).toBe("https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wiki/wikis?api-version=7.1");
    expect(sent(0).method).toBe("GET");
  });

  it("reports an empty wiki list explicitly", async () => {
    fetchMock.mockResolvedValueOnce(json({ count: 0, value: [] }));
    expect(await run(["list"])).toMatchObject({ count: "0 of 0 wikis", omitted: 0, wikis: [] });
  });

  it("reads page content and exposes its ETag with writes disabled", async () => {
    vi.stubEnv("ADO_AXI_WRITES", "0");
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag }));
    expect(await run(["page", "get", "--wiki", wikiId, "--path", "Home"]))
      .toEqual({ page: { id: 12, path: "/Home", etag, chars: 22, content: "# Synthetic page\nHello" } });
    expect(sent(0).url).toBe(`https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wiki/wikis/${wikiId}/pages?path=%2FHome&includeContent=true&api-version=7.1`);
  });

  it("truncates page text and offers a context-bearing --full command", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...page, content: "x".repeat(4500) }, 200, { etag }))
      .mockResolvedValueOnce(json({ ...page, content: "x".repeat(4500) }, 200, { etag }));
    const result = await run(["page", "get", "--wiki", wikiId, "--path", "/Home"]);
    expect(result.page).toMatchObject({ chars: 4500, content: expect.stringContaining("truncated") });
    expect(result.help).toEqual([expect.stringContaining("--full --org=synthetic-org --project=SyntheticProject")]);
    expect((await run(["page", "get", "--wiki", wikiId, "--path", "/Home", "--full"])).page)
      .toMatchObject({ content: "x".repeat(4500) });
  });

  it.each([
    { mode: "default", flags: [] },
    { mode: "full", flags: ["--full"] },
  ])("returns original Markdown in $mode output", async ({ flags }) => {
    const content = `[signed](https://example.com/file?sig=${secret}) `
      + `[auth](https://user:${secret}@example.com/file) `
      + `[entity](https&colon;//example.com/file?sv=1&amp;sig=${secret}) `
      + `[escaped](https\\://example.com/file?access\\_token=${secret})`;
    fetchMock.mockResolvedValueOnce(json({ ...page, content }, 200, { etag }));
    const result = await run(["page", "get", "--wiki", wikiId, "--path", "/Home", ...flags]);
    expect(result.page).toEqual({ id: page.id, path: page.path, etag, chars: content.length, content });
  });
});

describe("TD-065 wiki writes", () => {
  it("prechecks absence and creates a page without an update precondition", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Page not found" }, 404))
      .mockResolvedValueOnce(json(page, 201, { etag }));
    expect(await run(["page", "create", "--wiki", wikiId, "--path", "/Home", "--content", page.content]))
      .toMatchObject({ created: { id: 12, path: "/Home", etag } });
    expect(sent(1)).toMatchObject({ method: "PUT", body: { content: page.content },
      url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wiki/wikis/${wikiId}/pages?path=%2FHome&api-version=7.1` });
    expect(sent(1).headers).not.toHaveProperty("If-Match");
  });

  it("refuses to overwrite an existing page through create", async () => {
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag }));
    await expect(run(["page", "create", "--wiki", wikiId, "--path", "/Home", "--content", "replacement"]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the exact fetched ETag with the page update", async () => {
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag }))
      .mockResolvedValueOnce(json({ ...page, content: "replacement" }, 200, { etag: nextEtag }));
    expect(await run(["page", "update", "--wiki", wikiId, "--path", "/Home", "--content", "replacement"]))
      .toMatchObject({ updated: { id: 12, path: "/Home", etag: nextEtag } });
    expect(sent(1)).toMatchObject({ method: "PUT", body: { content: "replacement" }, headers: { "If-Match": etag } });
  });

  it("accepts a matching caller ETag and reads Markdown from the user-named file", async () => {
    const file = join(dir, "content.md");
    await writeFile(file, "# From file\n☃");
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag })).mockResolvedValueOnce(json(page, 200, { etag: nextEtag }));
    await run(["page", "update", "--wiki", wikiId, "--path", "/Home", "--file", file, "--if-match", etag]);
    expect(sent(1)).toMatchObject({ body: { content: "# From file\n☃" }, headers: { "If-Match": etag } });
  });

  it("allows intentional empty page content", async () => {
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag })).mockResolvedValueOnce(json({ ...page, content: "" }, 200, { etag: nextEtag }));
    await run(["page", "update", "--wiki", wikiId, "--path", "/Home", "--content="]);
    expect(sent(1).body).toEqual({ content: "" });
  });

  it("rejects a stale caller ETag before PUT", async () => {
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag }));
    await expect(run(["page", "update", "--wiki", wikiId, "--path", "/Home", "--content", "replacement", "--if-match", nextEtag]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses updates when the server omits the ETag", async () => {
    fetchMock.mockResolvedValueOnce(json(page));
    await expect(run(["page", "update", "--wiki", wikiId, "--path", "/Home", "--content", "replacement"]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a concurrent update rejected by the ETag guard", async () => {
    fetchMock.mockResolvedValueOnce(json(page, 200, { etag })).mockResolvedValueOnce(json({ message: secret }, 412));
    await expect(run(["page", "update", "--wiki", wikiId, "--path", "/Home", "--content", "replacement"]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "wiki request failed; response details withheld to protect secrets" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(1).headers).toMatchObject({ "If-Match": etag });
  });

  it("does not create when the absence precheck fails for another reason", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: secret }, 403));
    await expect(run(["page", "create", "--wiki", wikiId, "--path", "/Home", "--content", "text"]))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "wiki request failed; response details withheld to protect secrets" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["page", "get", "--wiki", wikiId], ["page", "get", "--path", "/Home"],
    ["list", "--limit", "0"], ["list", "extra"],
    ["page", "create", "--wiki", wikiId, "--path", "/Home"],
    ["page", "update", "--wiki", wikiId, "--path", "/Home", "--content", "text", "--file", "file.md"],
    ["page", "update", "--wiki", wikiId, "--path", "/Home", "--content", "text", "--if-match="],
  ])("rejects invalid wiki input before a request: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses unreadable content files before any request", async () => {
    await expect(run(["page", "create", "--wiki", wikiId, "--path", "/Home", "--file", join(dir, "absent.md")]))
      .rejects.toMatchObject({ code: "FILE_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("reads through the CLI using an explicit config and named profile with writes off", async () => {
  const config = join(dir, "profiles file.json");
  await writeFile(config, JSON.stringify({ defaultProfile: "other", profiles: {
    other: { org: "other-org", project: "Other", auth: "pat" },
    named: { org: "synthetic-org", project: "SyntheticProject", auth: "pat" },
  } }));
  const replay = join(dir, "replay.json");
  await writeFile(replay, JSON.stringify({ calls: [{ method: "GET",
    url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wiki/wikis/${wikiId}/pages?path=%2FHome&includeContent=true&api-version=7.1`,
    status: 200, body: JSON.stringify(page) }] }));
  const result = runCli(["page", "get", "--wiki", wikiId, "--path", "/Home"], replay, config, "0");
  expect(result.status).toBe(0);
  expect(decode(result.stdout)).toMatchObject({ page: { id: 12, path: "/Home", content: page.content } });
});

it("creates through the CLI and preserves named-profile context in its follow-up command", async () => {
  const config = join(dir, "profiles file.json");
  await writeFile(config, JSON.stringify({ profiles: { named: { org: "synthetic-org", project: "SyntheticProject", auth: "pat" } } }));
  const replay = join(dir, "replay.json");
  await writeFile(replay, JSON.stringify({ calls: [
    { method: "GET", url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wiki/wikis/${wikiId}/pages?path=%2FHome&includeContent=true&api-version=7.1`, status: 404, body: '{"message":"Page not found"}' },
    { method: "PUT", url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wiki/wikis/${wikiId}/pages?path=%2FHome&api-version=7.1`, status: 201, body: JSON.stringify(page) },
  ] }));
  const result = runCli(["page", "create", "--wiki", wikiId, "--path", "/Home", "--content", page.content], replay, config, "1");
  expect(result.status).toBe(0);
  expect(decode(result.stdout)).toMatchObject({ created: { id: 12, path: "/Home" },
    help: [expect.stringContaining(`'--config=${config}' --profile=named`)] });
});
