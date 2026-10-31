import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decode, encode } from "@toon-format/toon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workItemCommand } from "../src/commands/workItem.js";

const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const fetchMock = vi.fn();
const relations = [
  { rel: "System.LinkTypes.Related", url: "https://dev.azure.com/synthetic-org/_apis/wit/workItems/43" },
  { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/synthetic-org/_apis/wit/workItems/44" },
  { rel: "System.LinkTypes.Related", url: "https://dev.azure.com/synthetic-org/_apis/wit/workItems/45" },
];
const item = { id: 42, rev: 7, fields: { "System.Title": "Synthetic task", "System.WorkItemType": "Task", "System.State": "New" }, relations };
let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "ado-writes-"));
  const config = join(scratch, "config.json");
  writeFileSync(config, JSON.stringify({ profiles: { synthetic: { org: "synthetic-org", project: "SyntheticProject", auth: "pat" } } }));
  vi.stubEnv("ADO_AXI_CONFIG", config);
  vi.stubEnv("ADO_AXI_PAT", "synthetic-placeholder");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

describe("TD-063 work-item link remove", () => {
  it("removes exactly the relation selected from link list with an atomic revision test", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(item));
    const listed = await workItemCommand(["link", "list", "42", ...context]);
    expect(listed.links).toEqual([
      { index: 0, type: "related", target: 43, comment: "" },
      { index: 1, type: "parent", target: 44, comment: "" },
      { index: 2, type: "related", target: 45, comment: "" },
    ]);
    fetchMock.mockResolvedValueOnce(Response.json(item));
    fetchMock.mockResolvedValueOnce(Response.json({ ...item, rev: 8, relations: [relations[0], relations[2]] }));
    const result = await workItemCommand(["link", "remove", "42", "--index", "1", "--if-rev", "7", ...context]);
    const [readUrl] = fetchMock.mock.calls[1]!;
    expect(new URL(readUrl).searchParams.get("$expand")).toBe("relations");
    const [url, options] = fetchMock.mock.calls[2]!;
    expect(new URL(url).pathname).toBe("/synthetic-org/_apis/wit/workitems/42");
    expect(options).toMatchObject({ method: "PATCH", headers: { "Content-Type": "application/json-patch+json" } });
    expect(JSON.parse(options.body)).toEqual([
      { op: "test", path: "/rev", value: 7 },
      { op: "remove", path: "/relations/1" },
    ]);
    expect(decode(encode(result))).toMatchObject({ removed: { "work-item": 42, index: 1, type: "parent", target: 44, rev: 8 } });
  });

  it("refuses an unknown relation without writing", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(item));
    await expect(workItemCommand(["link", "remove", "42", "--index", "3", "--if-rev", "7", ...context]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("no relation at index 3") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a stale index revision before writing", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...item, rev: 8 }));
    await expect(workItemCommand(["link", "remove", "42", "--index", "1", "--if-rev", "7", ...context]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 412])("refuses a concurrent change without retrying (HTTP %s)", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json(item));
    fetchMock.mockResolvedValueOnce(Response.json({ message: "VS403351: Test Operation failed", typeKey: "WorkItemRevisionMismatchException" }, { status }));
    await expect(workItemCommand(["link", "remove", "42", "--index", "1", "--if-rev", "7", ...context]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("without retry") });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["--index", "1"],
    ["--index", "-1", "--if-rev", "7"],
    ["--index", "0.5", "--if-rev", "7"],
    ["--index", "1", "--if-rev", "0"],
    ["--index", "1", "--if-rev"],
  ])("validates removal input before contacting the API: %j", async (...argv) => {
    await expect(workItemCommand(["link", "remove", "42", ...argv, ...context])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prints the removal result through the actual CLI", () => {
    const fixture = join(scratch, "replay.json");
    writeFileSync(fixture, JSON.stringify({ calls: [
      { method: "GET", url: "https://dev.azure.com/synthetic-org/_apis/wit/workitems/42?%24expand=relations&api-version=7.1", status: 200, body: JSON.stringify(item) },
      { method: "PATCH", url: "https://dev.azure.com/synthetic-org/_apis/wit/workitems/42?api-version=7.1", status: 200, body: JSON.stringify({ ...item, rev: 8, relations: [relations[0], relations[2]] }) },
    ] }));
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.mjs", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)),
      "work-item", "link", "remove", "42", "--index", "1", "--if-rev", "7", ...context,
    ], { encoding: "utf8", timeout: 10_000, env: { ...process.env, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: fixture } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(decode(result.stdout)).toMatchObject({ removed: { "work-item": 42, index: 1, type: "parent", target: 44, rev: 8 } });
  });
});
