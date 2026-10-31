import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "@toon-format/toon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repoCommand } from "../src/commands/repo.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const repoId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const endpointId = "33333333-3333-4333-8333-333333333333";
const typeId = "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd";
const secret = "synthetic-secret-never-output";
const repository = { id: repoId, name: "SyntheticRepo", project: { id: projectId, name: "SyntheticProject" },
  defaultBranch: "refs/heads/main", isDisabled: false, remoteUrl: `https://user:${secret}@example.com/repo` };
const configuration = { type: { id: typeId }, isEnabled: true, isBlocking: true,
  settings: { minimumApproverCount: 2, scope: [{ repositoryId: repoId, refName: "refs/heads/main", matchKind: "Exact" }] } };
const policy = { ...configuration, id: 7, revision: 3, url: `https://example.com/?token=${secret}` };
const fetchMock = vi.fn<typeof fetch>();
const profileConfig = fileURLToPath(new URL("./fixtures/repo-admin-config.json", import.meta.url));
const json = (value: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
function run(argv: string[]) { return repoCommand([...argv, ...context]); }
function sent(index: number) {
  const [url, options] = fetchMock.mock.calls[index]!;
  return { url: String(url), method: options?.method, body: options?.body ? JSON.parse(String(options.body)) : undefined };
}

beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ADO_AXI_CONFIG", fileURLToPath(new URL("./fixtures/absent-config.json", import.meta.url)));
  vi.stubEnv("ADO_AXI_PAT", "synthetic-placeholder"); vi.stubEnv("ADO_AXI_WRITES", "1");
  clearCredentialCache();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearCredentialCache(); });

describe("TD-065 repository administration", () => {
  it("creates a repository in the selected project without exposing response URLs", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: projectId, name: "SyntheticProject" })).mockResolvedValueOnce(json(repository));
    const result = await run(["create", "--name", "SyntheticRepo"]);
    expect(result).toMatchObject({ created: { id: repoId, name: "SyntheticRepo" } });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(0).url).toBe("https://dev.azure.com/synthetic-org/_apis/projects/SyntheticProject?api-version=7.1");
    expect(sent(1)).toEqual({ method: "POST", url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories?api-version=7.1",
      body: { name: "SyntheticRepo", project: { id: projectId } } });
  });

  it("resolves a name and patches only requested repository fields by immutable id", async () => {
    fetchMock.mockResolvedValueOnce(json(repository))
      .mockResolvedValueOnce(json({ ...repository, name: "Renamed", defaultBranch: "refs/heads/develop", isDisabled: true }));
    expect(await run(["update", "--repo", "SyntheticRepo", "--name", "Renamed", "--default-branch", "develop", "--disabled", "true"]))
      .toMatchObject({ updated: { id: repoId, name: "Renamed", defaultBranch: "refs/heads/develop", disabled: true } });
    expect(sent(0).url).toBe("https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories/SyntheticRepo?api-version=7.1");
    expect(sent(1)).toEqual({ method: "PATCH", url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories/${repoId}?api-version=7.1`,
      body: { name: "Renamed", defaultBranch: "refs/heads/develop", isDisabled: true } });
  });

  it("supports enabling a disabled repository without changing other fields", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...repository, isDisabled: true })).mockResolvedValueOnce(json(repository));
    await run(["update", "--repo", repoId, "--disabled", "false"]);
    expect(sent(1).body).toEqual({ isDisabled: false });
  });

  it("prechecks a confirmed deletion and deletes by the resolved repository id", async () => {
    fetchMock.mockResolvedValueOnce(json(repository)).mockResolvedValueOnce(json(undefined, 204));
    expect(await run(["delete", "--repo", "SyntheticRepo", "--confirm-delete"]))
      .toEqual({ deleted: { id: repoId, name: "SyntheticRepo" } });
    expect(sent(1)).toEqual({ method: "DELETE", body: undefined,
      url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories/${repoId}?api-version=7.1` });
  });

  it("does not delete when the precheck fails", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: secret }, 403));
    await expect(run(["delete", "--repo", "Missing", "--confirm-delete"]))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "repository administration request failed; response details withheld to protect secrets" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("acknowledges an already absent repository without a delete request", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Repository not found" }, 404));
    expect(await run(["delete", "--repo", "Missing", "--confirm-delete"]))
      .toEqual({ repo: "already absent (no-op)" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("queues a repository import with a service endpoint and withholds source details", async () => {
    fetchMock.mockResolvedValueOnce(json(repository)).mockResolvedValueOnce(json({ importRequestId: 5, status: "queued",
      parameters: { gitSource: { url: `https://user:${secret}@example.com` }, serviceEndpointId: endpointId } }));
    const result = await run(["import", "--repo", "SyntheticRepo", "--source-url", "https://example.com/public/repo.git", "--service-endpoint", endpointId]);
    expect(result).toMatchObject({ import: { repo: repoId, id: 5, status: "queued" } });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(1)).toEqual({ method: "POST", url: `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories/${repoId}/importRequests?api-version=7.1`,
      body: { parameters: { gitSource: { url: "https://example.com/public/repo.git" }, serviceEndpointId: endpointId } } });
  });

  it("supports imports from a public source without an endpoint", async () => {
    fetchMock.mockResolvedValueOnce(json(repository)).mockResolvedValueOnce(json({ importRequestId: 5, status: "queued" }));
    await run(["import", "--repo", repoId, "--source-url", "https://example.com/repo.git"]);
    expect(sent(1).body).toEqual({ parameters: { gitSource: { url: "https://example.com/repo.git" } } });
  });

  it.each([
    ["create"], ["create", "--name="], ["create", "extra", "--name", "Repo"],
    ["update", "--repo", "Repo"], ["update", "--repo", "Repo", "--disabled", "yes"],
    ["update", "--repo", "Repo", "--default-branch", "refs/tags/v1"],
    ["delete", "--repo", "Repo"], ["delete", "--confirm-delete"],
    ["import", "--repo", "Repo", "--source-url", "https://user:password@example.com/repo.git"],
    ["import", "--repo", "Repo", "--source-url", "https://example.com/repo.git?token=secret"],
    ["import", "--repo", "Repo", "--source-url", "https://example.com/repo.git#secret"],
    ["import", "--repo", "Repo", "--source-url", "ssh://example.com/repo.git"],
    ["import", "--repo", "Repo", "--source-url", "https://example.com/repo.git", "--service-endpoint="],
  ])("rejects invalid repository input before any request: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TD-065 repository policy administration", () => {
  it("creates a policy from a typed configuration and withholds response URLs", async () => {
    fetchMock.mockResolvedValueOnce(json(policy));
    const result = await run(["policy", "create", "--policy-json", JSON.stringify(configuration)]);
    expect(result).toMatchObject({ created: { id: 7, revision: 3 } });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(sent(0)).toEqual({ method: "POST", url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/policy/configurations?api-version=7.1", body: configuration });
  });

  it("merges requested fields and sends the fetched policy revision", async () => {
    fetchMock.mockResolvedValueOnce(json(policy)).mockResolvedValueOnce(json({ ...policy, isEnabled: false, revision: 4 }));
    expect(await run(["policy", "update", "7", "--policy-json", '{"isEnabled":false}']))
      .toMatchObject({ updated: { id: 7, revision: 4 } });
    expect(sent(1)).toEqual({ method: "PUT", url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/policy/configurations/7?api-version=7.1",
      body: { ...policy, isEnabled: false } });
  });

  it.each(["update", "delete"])("rejects stale policy revisions before %s", async (action) => {
    fetchMock.mockResolvedValueOnce(json(policy));
    await expect(run(["policy", action, "7", "--if-rev", "2", ...(action === "update"
      ? ["--policy-json", '{"isEnabled":false}'] : ["--confirm-delete"])]))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prechecks the revision of a confirmed policy deletion", async () => {
    fetchMock.mockResolvedValueOnce(json(policy)).mockResolvedValueOnce(json(undefined, 204));
    expect(await run(["policy", "delete", "7", "--if-rev", "3", "--confirm-delete"]))
      .toEqual({ deleted: { id: 7, "checked-rev": 3 } });
    expect(sent(1)).toEqual({ method: "DELETE", body: undefined, url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/policy/configurations/7?api-version=7.1" });
  });

  it("acknowledges an already absent policy without a delete request", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Policy not found" }, 404));
    expect(await run(["policy", "delete", "7", "--if-rev", "3", "--confirm-delete"]))
      .toEqual({ policy: "already absent (no-op)" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["policy", "create"], ["policy", "create", "--policy-json"],
    ["policy", "update", "7"], ["policy", "update", "7", "--policy-json"],
    ["policy", "create", "--policy-json", "{}"], ["policy", "create", "--policy-json", "[]"],
    ["policy", "create", "--policy-json", '{"type":{"id":"invalid"}}'],
    ["policy", "update", "7", "--policy-json", '{"revision":9}'], ["policy", "update", "7", "--policy-json", "{}"],
    ["policy", "update", "7", "--policy-json", '{"isenabled":false}'],
    ["policy", "update", "7", "--policy-json", '{"isEnabled":"false"}'],
    ["policy", "update", "7", "--policy-json", '{"settings":[]}'],
    ["policy", "delete", "7", "--if-rev", "3"], ["policy", "delete", "7", "--confirm-delete"],
    ["policy", "delete", "0", "--if-rev", "3", "--confirm-delete"],
  ])("rejects invalid policy input before any request: %j", async (...argv) => {
    await expect(run(argv)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("withholds secret-bearing mutation errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: secret }, 400));
    await expect(run(["policy", "create", "--policy-json", JSON.stringify(configuration)]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: "repository administration request failed; response details withheld to protect secrets" });
  });
});

async function replayCli(argv: string[] | string, calls: unknown[], env: NodeJS.ProcessEnv = {}) {
  const dir = await mkdtemp(join(process.cwd(), ".ado-repo-admin-"));
  try {
    const fixture = join(dir, "replay.json");
    await writeFile(fixture, JSON.stringify({ calls }));
    const cli = [
      "--import", createRequire(import.meta.url).resolve("tsx"), "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.ts", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)),
    ];
    const options = { cwd: dir, encoding: "utf8" as const, timeout: 10_000,
      env: { ...process.env, ...env, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: fixture,
        ADO_AXI_TEST_NODE: process.execPath, ADO_AXI_TEST_TSX: cli[1], ADO_AXI_TEST_HOOK: cli[3], ADO_AXI_TEST_CLI: cli[4] } };
    if (typeof argv === "string") {
      return spawnSync("sh", ["-c", "alias ado-axi='\"$ADO_AXI_TEST_NODE\" --import \"$ADO_AXI_TEST_TSX\" --import \"$ADO_AXI_TEST_HOOK\" \"$ADO_AXI_TEST_CLI\"'\n" + argv], options);
    }
    return spawnSync(process.execPath, [...cli, ...argv], options);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

it("dispatches repository creation through the real CLI with TOON output", async () => {
  const result = await replayCli(["repo", "create", "--name", "SyntheticRepo", ...context], [
    { method: "GET", url: "https://dev.azure.com/synthetic-org/_apis/projects/SyntheticProject?api-version=7.1", status: 200, body: JSON.stringify({ id: projectId, name: "SyntheticProject" }) },
    { method: "POST", url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories?api-version=7.1", status: 201, body: JSON.stringify(repository) },
  ]);
  expect(result.status).toBe(0);
  expect(decode(result.stdout)).toMatchObject({ created: { id: repoId, name: "SyntheticRepo" } });
  expect(result.stdout).not.toContain(secret);
});

it("executes a follow-up hint for context selected only by flags", async () => {
  const url = `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/git/repositories/${repoId}?api-version=7.1`;
  const mutation = await replayCli(["repo", "update", "--repo", repoId, "--disabled", "false", ...context], [
    { method: "GET", url, status: 200, body: JSON.stringify(repository) },
    { method: "PATCH", url, status: 200, body: JSON.stringify(repository) },
  ]);
  expect(mutation.status).toBe(0);
  const output = decode(mutation.stdout) as { help: string[] };
  const hint = /^Run `([\s\S]*)` to /.exec(output.help[0]!)![1]!;
  const read = await replayCli(hint, [{ method: "GET", url, status: 200, body: JSON.stringify({ id: repoId }) }]);
  expect(read.status, read.stdout + read.stderr).toBe(0);
  expect(decode(read.stdout)).toMatchObject({ repo: { id: repoId } });
});

describe.each(["repo", "repos"])("%s explicit configuration and follow-up context", (command) => {
  let dir: string;
  let selectors: string[];
  const profileName = "named ' \" $ADO_AXI_TEST_UNSET $(printf wrong) `printf wrong`";
  const project = "Project's Team";
  const base = `https://dev.azure.com/named-org/${encodeURIComponent(project)}/`;
  const repoPath = `_apis/git/repositories/${repoId}`;
  const policyPath = "_apis/policy/configurations";
  const env = { ADO_AXI_ORG: undefined, ADO_AXI_PROJECT: undefined, ADO_AXI_CONFIG: undefined,
    ADO_AXI_TEST_UNSET: undefined, ADO_AXI_WRITES: "1", ADO_AXI_PAT: "synthetic-placeholder" };

  beforeEach(async () => {
    dir = await mkdtemp(join(process.cwd(), ".ado-context-"));
    const config = join(dir, "profiles ' $ADO_AXI_TEST_UNSET `printf wrong`.json");
    await writeFile(config, JSON.stringify({ defaultProfile: "default", profiles: {
      default: { org: "synthetic-org", project: "SyntheticProject", auth: "pat", patEnv: "ADO_AXI_PAT" },
      [profileName]: { org: "configured-org", project: "ConfiguredProject", auth: "pat", patEnv: "ADO_AXI_PAT" },
    } }));
    selectors = ["--config", config, "--profile", profileName, "--org", "named-org", "--project", project];
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it.each([
    { argv: ["create", "--name", "SyntheticRepo"], calls: [
      { method: "GET", url: `https://dev.azure.com/named-org/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`, status: 200, body: JSON.stringify({ id: projectId }) },
      { method: "POST", url: `${base}_apis/git/repositories?api-version=7.1`, status: 200, body: JSON.stringify(repository) },
    ], result: { created: { id: repoId } }, path: repoPath, body: { id: repoId }, inspection: { repo: { id: repoId } } },
    { argv: ["update", "--repo", repoId, "--disabled", "false"], calls: [
      { method: "GET", url: `${base}${repoPath}?api-version=7.1`, status: 200, body: JSON.stringify(repository) },
      { method: "PATCH", url: `${base}${repoPath}?api-version=7.1`, status: 200, body: JSON.stringify(repository) },
    ], result: { updated: { id: repoId } }, path: repoPath, body: { id: repoId }, inspection: { repo: { id: repoId } } },
    { argv: ["import", "--repo", repoId, "--source-url", "https://example.com/repo.git"], calls: [
      { method: "GET", url: `${base}${repoPath}?api-version=7.1`, status: 200, body: JSON.stringify(repository) },
      { method: "POST", url: `${base}${repoPath}/importRequests?api-version=7.1`, status: 200, body: JSON.stringify({ importRequestId: 5, status: "queued" }) },
    ], result: { import: { id: 5 } }, path: `${repoPath}/importRequests/5`, body: { importRequestId: 5, status: "completed" }, inspection: { response: { importRequestId: 5, status: "completed" } } },
    { argv: ["policy", "create", "--policy-json", JSON.stringify(configuration)], calls: [
      { method: "POST", url: `${base}${policyPath}?api-version=7.1`, status: 200, body: JSON.stringify(policy) },
    ], result: { created: { id: 7 } }, path: `${policyPath}/7`, body: { id: 7, revision: 3 }, inspection: { policy: { id: 7, revision: 3 } } },
    { argv: ["policy", "update", "7", "--policy-json", '{"isEnabled":false}'], calls: [
      { method: "GET", url: `${base}${policyPath}/7?api-version=7.1`, status: 200, body: JSON.stringify(policy) },
      { method: "PUT", url: `${base}${policyPath}/7?api-version=7.1`, status: 200, body: JSON.stringify({ ...policy, revision: 4 }) },
    ], result: { updated: { id: 7 } }, path: `${policyPath}/7`, body: { id: 7, revision: 4 }, inspection: { policy: { id: 7, revision: 4 } } },
  ])("executes the context-bearing hint for $argv", async ({ argv, calls, result, path, body, inspection }) => {
    const mutation = await replayCli([...selectors, command, ...argv], calls, env);
    expect(mutation.status).toBe(0);
    const output = decode(mutation.stdout) as { help: string[] };
    expect(output).toMatchObject(result);
    const hint = /^Run `([\s\S]*)` to /.exec(output.help[0]!)![1]!;
    const read = await replayCli(hint, [
      { method: "GET", url: `${base}${path}?api-version=7.1`, status: 200, body: JSON.stringify(body) },
    ], env);
    expect(read.status, read.stdout + read.stderr).toBe(0);
    expect(decode(read.stdout)).toMatchObject(inspection);
  });

  it("deletes using an explicit profile file", async () => {
    const result = await replayCli([...selectors, command, "delete", "--repo", repoId, "--confirm-delete"], [
      { method: "GET", url: `${base}${repoPath}?api-version=7.1`, status: 200, body: JSON.stringify(repository) },
      { method: "DELETE", url: `${base}${repoPath}?api-version=7.1`, status: 204, body: null },
    ], env);
    expect(result.status).toBe(0);
    expect(decode(result.stdout)).toMatchObject({ deleted: { id: repoId } });
  });
});

describe.each([
  ["repo", [], profileConfig, "synthetic-org/SyntheticProject"],
  ["repos", [], profileConfig, "synthetic-org/SyntheticProject"],
  ["repo", ["--profile", "named"], profileConfig, "named-org/NamedProject"],
  ["repos", ["--profile", "named"], profileConfig, "named-org/NamedProject"],
  ["repo", ["--config", profileConfig], undefined, "synthetic-org/SyntheticProject"],
  ["repos", ["--config", profileConfig], undefined, "synthetic-org/SyntheticProject"],
  ["repo", ["--config", profileConfig, "--profile", "named"], undefined, "named-org/NamedProject"],
  ["repos", ["--config", profileConfig, "--profile", "named"], undefined, "named-org/NamedProject"],
] as const)("policy profiles: %s %j (config %s)", (command, selectors, configPath, scope) => {
  const env = { ADO_AXI_ORG: undefined, ADO_AXI_PROJECT: undefined, ADO_AXI_CONFIG: configPath };

  it("creates a policy using the saved organization and project", async () => {
    const result = await replayCli([command, "policy", "create", "--policy-json", JSON.stringify(configuration), ...selectors], [
      { method: "POST", url: `https://dev.azure.com/${scope}/_apis/policy/configurations?api-version=7.1`, status: 200, body: JSON.stringify(policy) },
    ], env);
    expect(result.status).toBe(0);
    expect(decode(result.stdout)).toMatchObject({ created: { id: 7, revision: 3 } });
  });

  it("updates a policy using the saved organization and project", async () => {
    const result = await replayCli([command, "policy", "update", "7", "--policy-json", '{"isEnabled":false}', ...selectors], [
      { method: "GET", url: `https://dev.azure.com/${scope}/_apis/policy/configurations/7?api-version=7.1`, status: 200, body: JSON.stringify(policy) },
      { method: "PUT", url: `https://dev.azure.com/${scope}/_apis/policy/configurations/7?api-version=7.1`, status: 200, body: JSON.stringify({ ...policy, isEnabled: false, revision: 4 }) },
    ], env);
    expect(result.status).toBe(0);
    expect(decode(result.stdout)).toMatchObject({ updated: { id: 7, revision: 4 } });
  });
});
