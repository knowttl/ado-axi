import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pipelineCommand } from "../src/commands/pipeline.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const definition = {
  id: 42, revision: 7, name: "Synthetic CI", path: "\\Team", type: "build",
  queue: { id: 1 }, repository: { id: "11111111-1111-4111-8111-111111111111", type: "TfsGit", name: "SyntheticRepo" },
  process: { type: 2, yamlFilename: "azure-pipelines.yml" },
  variables: { hidden: { value: "synthetic-secret", isSecret: true } },
};
const fetchMock = vi.fn<typeof fetch>();
function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
}
function run(argv: string[]) { return pipelineCommand([...argv, ...context]); }
function sent(index: number) {
  const [url, options] = fetchMock.mock.calls[index]!;
  return { url: new URL(String(url)), method: options?.method,
    body: options?.body ? JSON.parse(String(options.body)) : undefined };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ADO_AXI_PAT", "synthetic-placeholder");
  vi.stubEnv("ADO_AXI_CONFIG", fileURLToPath(new URL("./fixtures/absent-config.json", import.meta.url)));
  vi.stubEnv("ADO_AXI_WRITES", "1");
  clearCredentialCache();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearCredentialCache(); });

describe("pipeline definition administration (TD-065)", () => {
  it("creates a definition without printing returned secrets", async () => {
    reply(definition);
    const input = { name: definition.name, repository: definition.repository, process: definition.process, queue: definition.queue };
    const result = await run(["create", "--definition", JSON.stringify(input)]);
    expect(sent(0)).toMatchObject({ method: "POST", body: input });
    expect(sent(0).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/definitions");
    expect(result.created).toEqual({ id: 42, revision: 7 });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });

  it("preserves the complete definition and carries its revision on update", async () => {
    reply(definition); reply({ ...definition, revision: 8, name: "New CI" });
    expect((await run(["update", "42", "--definition", '{"name":"New CI"}'])).updated)
      .toEqual({ id: 42, revision: 8 });
    expect(sent(1)).toMatchObject({ method: "PUT", body: { ...definition, name: "New CI" } });
  });

  it.each(["update", "delete"])("refuses stale revisions for %s", async (action) => {
    reply(definition);
    await expect(run([action, "42", "--if-rev", "6", ...(action === "update"
      ? ["--definition", '{"name":"New CI"}'] : ["--confirm-delete"])]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["delete", "42", "--if-rev", "7"], ["delete", "42", "--confirm-delete"],
    ["update", "42", "--definition", '{"revision":8}'],
    ["create", "--definition", "[]"], ["create", "--definition", "{}"],
    ["update", "42", "extra", "--definition", "{}"],
  ])("rejects invalid definition input before a request: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prechecks the confirmed definition deletion", async () => {
    reply(definition); reply(undefined, 204);
    expect(await run(["delete", "42", "--if-rev", "7", "--confirm-delete"]))
      .toEqual({ deleted: { id: 42, "checked-rev": 7 } });
    expect(sent(1).method).toBe("DELETE");
    expect(sent(1).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/definitions/42");
  });

  it("withholds API errors that echo secrets", async () => {
    reply({ message: "synthetic-secret https://user:password@example.com" }, 400);
    await expect(run(["create", "--definition", '{"name":"CI"}']))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: "pipeline administration request failed; response details withheld to protect secrets" });
  });
});

describe("build and run administration", () => {
  it.each([
    ["build", "add", "PUT"], ["runs", "add", "PUT"],
  ])("%s tag %s uses the build tag endpoint", async (noun, action, method) => {
    reply(["release candidate"]);
    expect(await run([noun, "tag", action, "42", "--tag", "release candidate"]))
      .toEqual({ tagged: { run: 42, tag: "release candidate", outcome: action === "add" ? "added" : "removed" } });
    expect(sent(0).method).toBe(method);
    expect(sent(0).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/builds/42/tags/release%20candidate");
  });

  it.each([
    ["build", "verified"], ["build", "release#1"],
    ["runs", "release candidate"], ["runs", "release#1"],
  ])("%s removes tag %s without replacing unrelated tags", async (noun, tag) => {
    reply(["keep-me"]);
    expect(await run([noun, "tag", "remove", "42", "--tag", tag]))
      .toEqual({ tagged: { run: 42, tag, outcome: "removed" } });
    expect(sent(0)).toMatchObject({ method: "PATCH", body: { tagsToRemove: [tag] } });
    expect(sent(0).body).toEqual({ tagsToRemove: [tag] });
    expect(sent(0).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/builds/42/tags");
    expect(sent(0).url.searchParams.get("api-version")).toBe("7.1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels an active build", async () => {
    reply({ id: 42, status: "inProgress" }); reply({ id: 42, status: "cancelling" });
    expect(await run(["build", "cancel", "42"])).toEqual({ run: { id: 42, status: "cancelling" } });
    expect(sent(1)).toMatchObject({ method: "PATCH", body: { status: "cancelling" } });
  });

  it.each(["add", "remove"])("rejects the removed singular run tag %s alias before a request", async (action) => {
    await expect(run(["run", "tag", action, "42", "--tag", "synthetic"]))
      .rejects.toMatchObject({ code: "UNKNOWN_FLAG" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues a pipeline through the singular run command", async () => {
    reply({ id: 101, state: "inProgress" });
    expect((await run(["run", "--pipeline", "42", "--branch", "main"])).queued)
      .toMatchObject({ run: 101, pipeline: "42", state: "inProgress", branch: "main" });
    expect(sent(0)).toMatchObject({ method: "POST", body: {
      resources: { repositories: { self: { refName: "refs/heads/main" } } },
    } });
    expect(sent(0).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/pipelines/42/runs");
  });

  it.each(["completed", "cancelling"])("acknowledges %s builds without cancelling again", async (status) => {
    reply({ id: 42, status });
    expect(await run(["build", "cancel", "42"])).toEqual({ run: { id: 42, status, outcome: "no-op" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pipeline folders", () => {
  it("bounds reads even with --full and writes disabled", async () => {
    vi.stubEnv("ADO_AXI_WRITES", "0");
    reply({ count: 2, value: [{ path: "\\Team", description: "CI" }, { path: "\\Other" }] });
    expect(await run(["folder", "list", "--limit", "1", "--full"]))
      .toEqual({ count: "1 of 2 folders", omitted: 1, folders: [{ path: "\\Team", description: "CI" }],
        help: ["Pass --limit 2 to include all folders; --full expands fields, not the limit"] });
    expect(sent(0).method).toBe("GET");
    expect(sent(0).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/folders");
    expect(sent(0).url.searchParams.has("path")).toBe(false);
    expect(sent(0).url.searchParams.get("api-version")).toBe("7.1-preview.2");
  });

  it.each([
    ["\\", "%5C"], ["\\Team", "%5CTeam"], ["\\Team\\Release #1", "%5CTeam%5CRelease%20%231"],
  ])("lists folders under %s through the route parameter", async (path, encoded) => {
    reply({ count: 1, value: [{ path, description: "Synthetic folder" }] });
    expect(await run(["folder", "list", "--path", path]))
      .toEqual({ count: "1 of 1 folders", omitted: 0, folders: [{ path, description: "Synthetic folder" }] });
    expect(sent(0).method).toBe("GET");
    expect(sent(0).url.pathname).toBe(`/synthetic-org/SyntheticProject/_apis/build/folders/${encoded}`);
    expect(sent(0).url.searchParams.has("path")).toBe(false);
    expect(sent(0).url.searchParams.get("api-version")).toBe("7.1-preview.2");
  });

  it("reports an empty folder list", async () => {
    reply({ count: 0, value: [] });
    expect(await run(["folder", "list"])).toEqual({ count: "0 of 0 folders", omitted: 0, folders: [] });
  });

  it.each(["\\Team", "\\Team\\Release #1"])("creates folder %s through the query parameter", async (path) => {
    reply({ path });
    expect(await run(["folder", "create", "--path", path]))
      .toEqual({ created: { path } });
    expect(sent(0)).toMatchObject({ method: "PUT", body: { path } });
    expect(sent(0).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/folders");
    expect(sent(0).url.searchParams.get("path")).toBe(path);
    expect(sent(0).url.searchParams.get("api-version")).toBe("7.1-preview.2");
  });

  it.each([
    ["\\Team", "%5CTeam"], ["\\Team\\Release #1", "%5CTeam%5CRelease%20%231"],
  ])("checks folder %s through the route before deletion through the query", async (path, encoded) => {
    reply({ count: 1, value: [{ path }] }); reply(undefined, 204);
    expect(await run(["folder", "delete", "--path", path, "--confirm-delete"]))
      .toEqual({ deleted: { path } });
    expect(sent(0).method).toBe("GET");
    expect(sent(0).url.pathname).toBe(`/synthetic-org/SyntheticProject/_apis/build/folders/${encoded}`);
    expect(sent(0).url.searchParams.has("path")).toBe(false);
    expect(sent(1).method).toBe("DELETE");
    expect(sent(1).url.pathname).toBe("/synthetic-org/SyntheticProject/_apis/build/folders");
    expect(sent(1).url.searchParams.get("path")).toBe(path);
    expect(sent(0).url.searchParams.get("api-version")).toBe("7.1-preview.2");
    expect(sent(1).url.searchParams.get("api-version")).toBe("7.1-preview.2");
  });

  it("acknowledges an absent folder", async () => {
    reply({ count: 0, value: [] });
    expect(await run(["folder", "delete", "--path", "\\Team", "--confirm-delete"]))
      .toEqual({ folder: "already absent (no-op)" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["folder"], ["folder", "--path", "\\Team"],
    ["folder", "delete", "--path", "\\Team"], ["folder", "delete", "--path", "\\", "--confirm-delete"],
    ["folder", "list", "--limit", "0"], ["build", "tag", "add", "42"], ["build", "cancel", "0"],
  ])("rejects unsafe or incomplete input: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
