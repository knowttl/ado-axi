import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@toon-format/toon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workItemCommand } from "../src/commands/workItem.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const attachmentId = "11111111-2222-4333-8444-555555555555";
const attachmentUrl = `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wit/attachments/${attachmentId}`;
const otherId = "22222222-2222-4333-8444-555555555555";
const content = Buffer.from([0, 255, 128, 13, 10, 65]);
const fetchMock = vi.fn<typeof fetch>();
let dir: string;
let context: string[];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const relation = { rel: "AttachedFile", url: attachmentUrl, attributes: { name: "evidence.bin", comment: "Test evidence" } };

function runCli(argv: string[]) {
  return spawnSync(process.execPath, [
    "--import", createRequire(import.meta.url).resolve("tsx"), "--import", fileURLToPath(new URL("./fixtures/attachment-api.mjs", import.meta.url)),
    fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)), "work-item", ...argv, ...context,
  ], { cwd: dir, encoding: "utf8", env: process.env, timeout: 10_000 });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ado-attachment-"));
  const config = join(dir, "config.json");
  await writeFile(config, JSON.stringify({ profiles: { test: { org: "synthetic-org", project: "SyntheticProject", auth: "pat" } }, defaultProfile: "test" }));
  context = ["--profile", "test"];
  vi.stubEnv("ADO_AXI_CONFIG", config);
  vi.stubEnv("ADO_AXI_PAT", "synthetic-placeholder");
  vi.stubEnv("ADO_AXI_WRITES", "1");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await writeFile(join(dir, "evidence.bin"), content);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearCredentialCache();
  await rm(dir, { recursive: true, force: true });
});

describe("TD-062 work-item attach", () => {
  it("renders partial upload failure structurally on stdout with a failing exit code", () => {
    const result = runCli(["attach", "42", "--file", join(dir, "evidence.bin")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(decode(result.stdout)).toMatchObject({
      code: "ATTACHMENT_UNLINKED", error: "attachment uploaded but work-item relation failed",
      attachment: { id: attachmentId, url: attachmentUrl, name: "evidence.bin", size: 6 },
    });
    expect(result.stdout).not.toContain("synthetic private response body");
  });
  it("refuses writes before reading a file or contacting the API", async () => {
    vi.stubEnv("ADO_AXI_WRITES", "0");
    await expect(workItemCommand(["attach", "42", "--file", "/missing", ...context])).rejects.toMatchObject({ code: "WRITES_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["evidence.bin", "missing.bin"])("rejects a bare --comment before reading %s or contacting the API", async (file) => {
    await expect(workItemCommand(["attach", "42", "--file", join(dir, file), "--comment", ...context])).rejects.toMatchObject({
      code: "VALIDATION_ERROR", message: "flag --comment requires a value",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ flags: [] }, { flags: ["--if-rev", "7"] }])("uploads local binary bytes and links with a revision guard $flags", async ({ flags }) => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7 }))
      .mockResolvedValueOnce(json({ id: attachmentId, url: attachmentUrl }))
      .mockResolvedValueOnce(json({ id: 42, rev: 8 }));
    const result = await workItemCommand(["attach", "42", "--file", join(dir, "evidence.bin"), "--comment", "Test evidence", ...flags, ...context]);
    expect(result).toEqual({ attachment: { id: attachmentId, name: "evidence.bin", size: 6, rev: 8 } });
    const [url, upload] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe("https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wit/attachments?fileName=evidence.bin&api-version=7.1");
    expect(upload).toMatchObject({ method: "POST", headers: { "Content-Type": "application/octet-stream" } });
    expect(Buffer.from(upload!.body as Uint8Array)).toEqual(content);
    const [patchUrl, patch] = fetchMock.mock.calls[2]!;
    expect(String(patchUrl)).toBe("https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wit/workitems/42?api-version=7.1");
    expect(patch).toMatchObject({ method: "PATCH", headers: { "Content-Type": "application/json-patch+json" } });
    expect(JSON.parse(patch!.body as string)).toEqual([
      { op: "test", path: "/rev", value: 7 },
      { op: "add", path: "/relations/-", value: { rel: "AttachedFile", url: attachmentUrl, attributes: { comment: "Test evidence" } } },
    ]);
  });

  it("reports the uploaded attachment and recovery guidance when linking fails", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7 }))
      .mockResolvedValueOnce(json({ id: attachmentId, url: attachmentUrl }))
      .mockResolvedValueOnce(json({ message: "synthetic private response" }, 412));
    await expect(workItemCommand(["attach", "42", "--file", join(dir, "evidence.bin"), ...context])).rejects.toMatchObject({
      message: "attachment uploaded but work-item relation failed", code: "ATTACHMENT_UNLINKED",
      attachment: { id: attachmentId, url: attachmentUrl, name: "evidence.bin", size: 6 },
      suggestions: [expect.stringContaining("work-item get 42"), expect.stringContaining("ado-axi api PATCH _apis/wit/workitems/42 --content-type json-patch --body '<json-patch>'")],
    });
  });

  it("refuses an over-cap file before upload", async () => {
    const handle = await open(join(dir, "large.bin"), "w");
    await handle.truncate(25 * 1024 * 1024 + 1);
    await handle.close();
    await expect(workItemCommand(["attach", "42", "--file", join(dir, "large.bin"), ...context])).rejects.toMatchObject({ code: "SIZE_LIMIT", message: "file exceeds the 26214400 byte limit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a stale explicit revision before upload", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 8 }));
    await expect(workItemCommand(["attach", "42", "--file", join(dir, "evidence.bin"), "--if-rev", "7", ...context])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("TD-062 work-item attachment get", () => {
  it("writes to ./<name> by default through the CLI", async () => {
    await rm(join(dir, "evidence.bin"));
    const result = runCli(["attachment", "get", "42", "--name", "evidence.bin"]);
    expect(result.status).toBe(0);
    expect(await readFile(join(dir, "evidence.bin"))).toEqual(content);
    expect(decode(result.stdout)).toEqual({ attachment: {
      id: attachmentId, name: "evidence.bin", path: join(dir, "evidence.bin"), bytes: 6,
      sha256: createHash("sha256").update(content).digest("hex"),
    } });
  });
  it("downloads the named binary attachment and reports its checksum with writes off", async () => {
    vi.stubEnv("ADO_AXI_WRITES", "0");
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7, relations: [relation] }))
      .mockResolvedValueOnce(new Response(content));
    const out = join(dir, "download.bin");
    const result = await workItemCommand(["attachment", "get", "42", "--name", "evidence.bin", "--out", out, ...context]);
    expect(await readFile(out)).toEqual(content);
    expect(result).toEqual({ attachment: { id: attachmentId, name: "evidence.bin", path: out, bytes: 6, sha256: createHash("sha256").update(content).digest("hex") } });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${attachmentUrl}?api-version=7.1`);
  });

  it("refuses ambiguous names and lists each candidate", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7, relations: [relation, { ...relation, url: attachmentUrl.replace(attachmentId, otherId) }] }));
    await expect(workItemCommand(["attachment", "get", "42", "--name", "evidence.bin", ...context])).rejects.toMatchObject({
      code: "VALIDATION_ERROR", message: "attachment name 'evidence.bin' is ambiguous",
      suggestions: [`candidate: ${attachmentId} ${attachmentUrl}`, `candidate: ${otherId} ${attachmentUrl.replace(attachmentId, otherId)}`],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an existing output unchanged without --force", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7, relations: [relation] }))
      .mockResolvedValueOnce(new Response("replacement"));
    const out = join(dir, "evidence.bin");
    await expect(workItemCommand(["attachment", "get", "42", "--name", "evidence.bin", "--out", out, ...context])).rejects.toMatchObject({ code: "FILE_EXISTS" });
    expect(await readFile(out)).toEqual(content);
  });

  it("overwrites output only with --force", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7, relations: [relation] }))
      .mockResolvedValueOnce(new Response("replacement"));
    const out = join(dir, "evidence.bin");
    await workItemCommand(["attachment", "get", "42", "--name", "evidence.bin", "--out", out, "--force", ...context]);
    expect(await readFile(out, "utf8")).toBe("replacement");
  });

  it.each([false, true])("rejects sign-in HTML and preserves output with force=%j", async (force) => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7, relations: [relation] }))
      .mockResolvedValueOnce(new Response("<title>Azure DevOps Services | Sign In</title>", { headers: { "content-type": "text/html" } }));
    const out = join(dir, "evidence.bin");
    await expect(workItemCommand(["attachment", "get", "42", "--name", "evidence.bin", "--out", out, ...(force ? ["--force"] : []), ...context])).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(await readFile(out)).toEqual(content);
  });

  it.each([true, false])("bounds downloads with Content-Length present=%j", async (declared) => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, rev: 7, relations: [relation] }))
      .mockResolvedValueOnce(new Response(new Uint8Array(25 * 1024 * 1024 + 1), { headers: declared ? { "content-length": "26214401" } : {} }));
    const out = join(dir, "download.bin");
    await expect(workItemCommand(["attachment", "get", "42", "--name", "evidence.bin", "--out", out, ...context])).rejects.toMatchObject({ code: "SIZE_LIMIT" });
    await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
