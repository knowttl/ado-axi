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
  vi.stubEnv("ADO_AXI_WRITES", "1");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

describe("work-item link list mapping", () => {
  const projectId = "11111111-1111-1111-1111-111111111111";
  const repoId = "22222222-2222-2222-2222-222222222222";

  it("resolves hierarchy and artifact links to readable targets", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      ...item,
      id: 4211,
      relations: [
        { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/synthetic-org/_apis/wit/workItems/4200" },
        {
          rel: "ArtifactLink",
          url: `vstfs:///Git/PullRequestId/${projectId}%2F${repoId}%2F812`,
          attributes: { name: "Pull Request", comment: "implements" },
        },
        {
          rel: "ArtifactLink",
          url: `vstfs:///Git/Commit/${projectId}%2F${repoId}%2F${"c".repeat(40)}`,
          attributes: { name: "Fixed in Commit" },
        },
      ],
    }));

    const result = await workItemCommand(["link", "list", "4211", ...context]);

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(new URL(url).pathname).toBe("/synthetic-org/_apis/wit/workitems/4211");
    expect(new URL(url).searchParams.get("$expand")).toBe("relations");
    expect(options.method).toBe("GET");
    expect(result.links).toEqual([
      { index: 0, type: "parent", target: 4200, comment: "" },
      { index: 1, type: "pull-request", target: "812", comment: "implements" },
      { index: 2, type: "commit", target: "cccccccc", comment: "" },
    ]);
  });

  it("keeps the full branch name of a Git ref artifact link", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      ...item,
      id: 4211,
      rev: 3,
      relations: [
        {
          rel: "ArtifactLink",
          url: `vstfs:///Git/Ref/${projectId}%2F${repoId}%2FGBfeature%2Flogin`,
          attributes: { name: "Branch" },
        },
      ],
    }));
    const result = await workItemCommand(["link", "list", "4211", ...context]);
    expect(result.links).toEqual([{ index: 0, type: "branch", target: "feature/login", comment: "" }]);
  });
});

describe("reads with writes disabled", () => {
  it.each([
    { argv: ["api", "GET", "_apis/projects"], method: "GET", url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/projects?api-version=7.1", body: { count: 0, value: [] }, expected: { count: 0, value: [] } },
    { argv: ["work-item", "list"], method: "POST", url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wit/wiql?%24top=30&api-version=7.1", body: { workItems: [] }, expected: { "work-items": expect.stringContaining("0 work items found") } },
  ])("allows $method reads through the CLI", ({ argv, method, url, body, expected }) => {
    const fixture = join(scratch, "read-replay.json");
    writeFileSync(fixture, JSON.stringify({ calls: [
      { method, url, status: 200, body: JSON.stringify(body) },
    ] }));
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.mjs", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)), ...argv, ...context,
    ], { encoding: "utf8", timeout: 10_000, input: "", env: { ...process.env, ADO_AXI_WRITES: undefined, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: fixture } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(decode(result.stdout)).toMatchObject(expected);
  });
});

describe("TD-068 work-item delete", () => {
  it.each([
    { flags: [], destroy: "false", outcome: "moved to recycle bin", response: () => Response.json({ id: 42, name: "Synthetic task", project: "SyntheticProject", deletedBy: "Synthetic User", deletedDate: "2026-10-30T00:00:00Z", resource: item }) },
    { flags: ["--destroy", "--confirm-destroy"], destroy: "true", outcome: "permanently destroyed", response: () => new Response(null, { status: 204 }) },
  ])("reports $outcome and sends the matching DELETE request", async ({ flags, destroy, outcome, response }) => {
    fetchMock.mockResolvedValueOnce(Response.json(item));
    fetchMock.mockResolvedValueOnce(response());
    const result = await workItemCommand(["delete", "42", "--if-rev", "7", ...flags, ...context]);
    const [readUrl, readOptions] = fetchMock.mock.calls[0]!;
    expect(new URL(readUrl).pathname).toBe("/synthetic-org/_apis/wit/workitems/42");
    expect(readOptions.method).toBe("GET");
    const [url, options] = fetchMock.mock.calls[1]!;
    expect(new URL(url).pathname).toBe("/synthetic-org/_apis/wit/workitems/42");
    expect(new URL(url).searchParams.get("destroy")).toBe(destroy);
    expect(options).toMatchObject({ method: "DELETE", body: undefined });
    expect(decode(encode(result))).toEqual({ deleted: { id: 42, outcome, "checked-rev": 7 } });
  });

  it.each([[], ["--destroy", "--confirm-destroy"]])("refuses stale revisions without attempting DELETE: %j", async (...flags) => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...item, rev: 8 }));
    await expect(workItemCommand(["delete", "42", "--if-rev", "7", ...flags, ...context]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a server revision conflict without retrying DELETE", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(item));
    fetchMock.mockResolvedValueOnce(Response.json({ message: "revision conflict" }, { status: 412 }));
    await expect(workItemCommand(["delete", "42", "--if-rev", "7", ...context]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [],
    ["--destroy", "--confirm-destroy"],
    ["--if-rev", "7", "--destroy"],
    ["--if-rev", "7", "--destroy", "--confirm-destroy=false"],
    ["--if-rev", "0"],
    ["--if-rev", "1.5"],
    ["--if-rev"],
  ])("requires a revision and explicit destruction confirmation before any API call: %j", async (...flags) => {
    await expect(workItemCommand(["delete", "42", ...flags, ...context]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat an inaccessible or absent item as a successful deletion", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: "Work item does not exist or is inaccessible" }, { status: 404 }));
    await expect(workItemCommand(["delete", "42", "--if-rev", "7", ...context]))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prints a plain recycle-bin outcome through the actual CLI", () => {
    const fixture = join(scratch, "replay.json");
    writeFileSync(fixture, JSON.stringify({ calls: [
      { method: "GET", url: "https://dev.azure.com/synthetic-org/_apis/wit/workitems/42?api-version=7.1", status: 200, body: JSON.stringify(item) },
      { method: "DELETE", url: "https://dev.azure.com/synthetic-org/_apis/wit/workitems/42?destroy=false&api-version=7.1", status: 200, body: JSON.stringify({ id: 42, name: "Synthetic task", project: "SyntheticProject", deletedBy: "Synthetic User", deletedDate: "2026-10-30T00:00:00Z", resource: item }) },
    ] }));
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.mjs", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)),
      "work-item", "delete", "42", "--if-rev", "7", ...context,
    ], { encoding: "utf8", timeout: 10_000, env: { ...process.env, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: fixture } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(decode(result.stdout)).toEqual({ deleted: { id: 42, outcome: "moved to recycle bin", "checked-rev": 7 } });
  });
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
