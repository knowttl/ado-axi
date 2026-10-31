import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decode, encode } from "@toon-format/toon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repoCommand, projectCommand } from "../src/commands/repo.js";
import { pipelineCommand } from "../src/commands/pipeline.js";
import { securityCommand } from "../src/commands/security.js";
import { serviceEndpointCommand } from "../src/commands/serviceEndpoint.js";
import { variableGroupCommand } from "../src/commands/variableGroup.js";
import { agentCommand } from "../src/commands/agent.js";
import { poolCommand } from "../src/commands/pool.js";
import { queueCommand } from "../src/commands/queue.js";
import { userCommand } from "../src/commands/user.js";
import { teamCommand } from "../src/commands/team.js";

const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const secret = "synthetic-secret-never-output";
const variables = {
  environment: { value: "test", isSecret: false },
  credential: { value: secret, isSecret: true },
  absentSecret: { value: null, isSecret: true },
};
const policy = {
  id: 7, revision: 1, isEnabled: true, isBlocking: true,
  type: { id: "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd", displayName: "Minimum number of reviewers" },
  settings: { minimumApproverCount: 2, scope: [{ repositoryId: "synthetic-repo", refName: "refs/heads/main", matchKind: "Exact" }] },
};
const group = { descriptor: "vssgp.synthetic", displayName: "Synthetic reviewers", principalName: "[SyntheticProject]\\Reviewers", subjectKind: "group" };
const acl = { token: "repoV2/synthetic-project/synthetic-repo", inheritPermissions: true,
  acesDictionary: { "vssgp.synthetic": { descriptor: "vssgp.synthetic", allow: 2, deny: 4, extendedInfo: { effectiveAllow: 2, effectiveDeny: 4 } } } };
const endpoint = { id: "synthetic-endpoint", name: "Synthetic connection", type: "azurerm", isReady: true,
  authorization: { scheme: "ServicePrincipal", parameters: { serviceprincipalkey: secret, serviceprincipalid: "synthetic-principal" } },
  data: { arbitraryCredential: secret }, url: `https://user:${secret}@example.com`,
};
const variableGroup = { id: 4, name: "Synthetic settings", type: "Vsts", variables, providerData: null };
const definition = { id: 9, name: "Synthetic build", revision: 2, variables,
  process: { type: 2, yamlFilename: "azure-pipelines.yml" }, repository: { id: "synthetic-repo", type: "TfsGit", name: "Synthetic repo" } };
const agent = { id: 3, name: "Synthetic agent", version: "4.0.0", enabled: true, status: "online", systemCapabilities: { arbitrary: secret }, userCapabilities: { custom: secret } };
const pool = { id: 2, name: "Synthetic pool", poolType: "automation", isHosted: false };
const queue = { id: 5, name: "Synthetic queue", pool };
const user = { id: "synthetic-user", user: { descriptor: "aad.synthetic", displayName: "Synthetic User", principalName: "synthetic@example.com" },
  accessLevel: { licensingSource: "account", accountLicenseType: "express", status: "active" }, lastAccessedDate: "2026-10-01T00:00:00Z" };
const team = { id: "synthetic-team", name: "Synthetic team", description: "Audit team" };
const member = { identity: { id: "synthetic-user", displayName: "Synthetic User", uniqueName: "synthetic@example.com" }, isTeamAdmin: false };
const repo = { id: "synthetic-repo", name: "Synthetic repo", defaultBranch: "refs/heads/main", isDisabled: false };
const project = { id: "synthetic-project", name: "SyntheticProject", state: "wellFormed", visibility: "private" };

type Command = (argv: string[]) => Promise<Record<string, unknown>>;
interface ListCase { name: string; command: Command; argv: string[]; path: string; row: object; collection: string; source?: string }
const lists: ListCase[] = [
  { name: "repository policies", command: repoCommand, argv: ["policy", "list", "--repo", "synthetic-repo"], path: "/synthetic-org/SyntheticProject/_apis/git/policy/configurations", row: policy, collection: "policies" },
  { name: "security groups", command: securityCommand, argv: ["group", "list"], path: "/synthetic-org/_apis/graph/groups", row: group, collection: "groups" },
  { name: "security memberships", command: securityCommand, argv: ["membership", "list", "vssgp.synthetic"], path: "/synthetic-org/_apis/graph/memberships/vssgp.synthetic", row: { containerDescriptor: "vssgp.container", memberDescriptor: "vssgp.synthetic" }, collection: "memberships" },
  { name: "security permissions", command: securityCommand, argv: ["permission", "list", "--namespace", "synthetic-namespace"], path: "/synthetic-org/_apis/accesscontrollists/synthetic-namespace", row: acl, collection: "permissions" },
  { name: "service endpoints", command: serviceEndpointCommand, argv: ["list"], path: "/synthetic-org/SyntheticProject/_apis/serviceendpoint/endpoints", row: endpoint, collection: "endpoints" },
  { name: "variable groups", command: variableGroupCommand, argv: ["list"], path: "/synthetic-org/SyntheticProject/_apis/distributedtask/variablegroups", row: variableGroup, collection: "variable-groups" },
  { name: "agents", command: agentCommand, argv: ["list", "--pool", "2"], path: "/synthetic-org/_apis/distributedtask/pools/2/agents", row: agent, collection: "agents" },
  { name: "pools", command: poolCommand, argv: ["list"], path: "/synthetic-org/_apis/distributedtask/pools", row: pool, collection: "pools" },
  { name: "queues", command: queueCommand, argv: ["list"], path: "/synthetic-org/SyntheticProject/_apis/distributedtask/queues", row: queue, collection: "queues" },
  { name: "users", command: userCommand, argv: ["list"], path: "/synthetic-org/_apis/userentitlements", row: user, collection: "users", source: "members" },
  { name: "teams", command: teamCommand, argv: ["list"], path: "/synthetic-org/_apis/projects/SyntheticProject/teams", row: team, collection: "teams" },
  { name: "team members", command: teamCommand, argv: ["member", "list", "--team", "synthetic-team"], path: "/synthetic-org/_apis/projects/SyntheticProject/teams/synthetic-team/members", row: member, collection: "members" },
];

let scratch: string;
const fetchMock = vi.fn();

beforeEach(() => {
  scratch = mkdtempSync(join(process.cwd(), ".ado-audit-"));
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

function respond(path: string, body: unknown, headers?: Record<string, string>, status = 200): void {
  fetchMock.mockImplementationOnce(async (url: string, options: RequestInit) => {
    expect(new URL(url).pathname).toBe(path);
    expect(options.method).toBe("GET");
    return new Response(JSON.stringify(body), { status, headers });
  });
}

describe("TD-064 bounded audit lists", () => {
  it.each(lists)("bounds $name and reports the left-out count under --full", async ({ command, argv, path, row, collection, source }) => {
    respond(path, { [source ?? "value"]: [row, row, row], count: 3 });
    const result = await command([...argv, ...context, "--limit", "1", "--full"]);
    expect(result.count).toBe(`1 of 3 ${collection}`);
    expect(result.omitted).toBe(2);
    expect(result[collection]).toHaveLength(1);
    expect(encode(result)).not.toContain(secret);
    expect(result.help).toEqual([`Pass --limit 3 to include all ${collection}; --full expands fields, not the limit`]);
  });

  it.each(lists)("reports an explicit empty list for $name", async ({ command, argv, path, collection, source }) => {
    respond(path, { [source ?? "value"]: [], count: 0 });
    const result = await command([...argv, ...context]);
    expect(result).toMatchObject({ count: `0 of 0 ${collection}`, omitted: 0, [collection]: [] });
  });

  it("counts continuation pages without returning more than the limit", async () => {
    respond("/synthetic-org/_apis/graph/groups", { value: [group, group] }, { "x-ms-continuationtoken": "next-page" });
    fetchMock.mockImplementationOnce(async (url: string) => {
      expect(new URL(url).searchParams.get("continuationToken")).toBe("next-page");
      return new Response(JSON.stringify({ value: [group] }));
    });
    expect(await securityCommand(["group", "list", ...context, "--limit", "1"])).toMatchObject({
      count: "1 of 3 groups", omitted: 2, groups: [{ descriptor: "vssgp.synthetic", displayName: "Synthetic reviewers", principalName: "[SyntheticProject]\\Reviewers" }],
    });
  });

  it.each([
    { command: teamCommand, argv: ["list"], row: team, source: "value", skip: "$skip", collection: "teams" },
  ])("counts offset pages for $collection", async ({ command, argv, row, source, skip, collection }) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ [source]: Array.from({ length: 100 }, () => row) })));
    fetchMock.mockImplementationOnce(async (url: string) => {
      expect(new URL(url).searchParams.get(skip)).toBe("100");
      return new Response(JSON.stringify({ [source]: [row] }));
    });
    const result = await command([...argv, ...context, "--limit", "1"]);
    expect(result).toMatchObject({ count: `1 of 101 ${collection}`, omitted: 100 });
    expect(result[collection]).toHaveLength(1);
  });

  it.each([1, 100])("counts user continuation pages after %s members", async (pageSize) => {
    respond("/synthetic-org/_apis/userentitlements", {
      members: Array.from({ length: pageSize }, () => user), continuationToken: "next-users",
    });
    fetchMock.mockImplementationOnce(async (url: string) => {
      const query = new URL(url).searchParams;
      expect(query.get("continuationToken")).toBe("next-users");
      expect(query.has("skip")).toBe(false);
      expect(query.has("top")).toBe(false);
      return new Response(JSON.stringify({ members: [user], continuationToken: null }));
    });
    expect(await userCommand(["list", ...context, "--limit", "1"])).toMatchObject({
      count: `1 of ${pageSize + 1} users`, omitted: pageSize, users: [user],
    });
  });

  it.each(["0", "-1", "1.5", "Infinity"])("rejects invalid limit %s before HTTP", async (limit) => {
    await expect(poolCommand(["list", ...context, "--limit", limit])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { command: poolCommand, argv: ["list", "unexpected"] },
    { command: repoCommand, argv: ["policy", "show", "7", "unexpected"] },
    { command: pipelineCommand, argv: ["show", "9", "--unknown", "value"] },
  ])("rejects unrecognized input $argv before HTTP", async ({ command, argv }) => {
    await expect(command([...argv, ...context])).rejects.toMatchObject({ code: expect.stringMatching(/VALIDATION_ERROR|UNKNOWN_FLAG/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TD-064 audit details", () => {
  it.each([
    { mode: "default", flags: [] },
    { mode: "full", flags: ["--full"] },
  ])("strips only structured URL userinfo in $mode output", async ({ flags }) => {
    const url = `https://user:${secret}@example.com/repo?sig=synthetic-signature#section`;
    const clean = "https://example.com/repo?sig=synthetic-signature#section";
    const description = `[repository](${url})`;
    respond("/synthetic-org/SyntheticProject/_apis/git/repositories/synthetic-repo", {
      ...repo, url, remoteUrl: url, _links: { web: { href: url } }, sources: [{ uri: url }],
      webUrl: "https://EXAMPLE.com", malformedUrl: "not a URL", password: secret, variables, description,
    });
    const result = await repoCommand(["show", "synthetic-repo", ...context, ...flags]);
    expect(result.repo).toMatchObject({ url: clean, remoteUrl: clean, _links: { web: { href: clean } },
      sources: [{ uri: clean }], webUrl: "https://EXAMPLE.com", malformedUrl: "not a URL", password: "***",
      variables: [{ name: "environment", value: "test", isSecret: false },
        { name: "credential", value: "***", isSecret: true }, { name: "absentSecret", value: "***", isSecret: true }],
      description });
  });

  it("strips structured URL userinfo before list field selection", async () => {
    respond("/synthetic-org/SyntheticProject/_apis/git/policy/configurations", { value: [{ ...policy,
      url: `https://user:${secret}@example.com/policy?sig=synthetic-signature`, password: secret,
    }] });
    expect(await repoCommand(["policy", "list", "--repo", "synthetic-repo", ...context, "--fields", "url,password"]))
      .toMatchObject({ policies: [{ url: "https://example.com/policy?sig=synthetic-signature", password: "***" }] });
  });

  it.each([
    { name: "policy", command: repoCommand, argv: ["policy", "show", "7"], path: "/synthetic-org/SyntheticProject/_apis/policy/configurations/7", body: policy, key: "policy", expected: { id: 7, settings: policy.settings } },
    { name: "group", command: securityCommand, argv: ["group", "show", "vssgp.synthetic"], path: "/synthetic-org/_apis/graph/groups/vssgp.synthetic", body: group, key: "group", expected: group },
    { name: "permission", command: securityCommand, argv: ["permission", "show", "--namespace", "synthetic-namespace", "--token", acl.token], path: "/synthetic-org/_apis/accesscontrollists/synthetic-namespace", body: { value: [acl] }, key: "permissions", expected: [acl] },
    { name: "endpoint", command: serviceEndpointCommand, argv: ["show", "synthetic-endpoint"], path: "/synthetic-org/SyntheticProject/_apis/serviceendpoint/endpoints/synthetic-endpoint", body: endpoint, key: "endpoint", expected: { id: "synthetic-endpoint", name: "Synthetic connection", authorization: "***", data: "***", url: "***" } },
    { name: "variable group", command: variableGroupCommand, argv: ["show", "4"], path: "/synthetic-org/SyntheticProject/_apis/distributedtask/variablegroups/4", body: variableGroup, key: "variable-group", expected: { id: 4, variables: [{ name: "environment", value: "test", isSecret: false }, { name: "credential", value: "***", isSecret: true }, { name: "absentSecret", value: "***", isSecret: true }] } },
    { name: "pipeline", command: pipelineCommand, argv: ["show", "9"], path: "/synthetic-org/SyntheticProject/_apis/build/definitions/9", body: definition, key: "pipeline", expected: { id: 9, name: "Synthetic build", process: definition.process } },
    { name: "agent", command: agentCommand, argv: ["show", "3", "--pool", "2"], path: "/synthetic-org/_apis/distributedtask/pools/2/agents/3", body: agent, key: "agent", expected: { id: 3, status: "online", systemCapabilities: "***", userCapabilities: "***" } },
    { name: "pool", command: poolCommand, argv: ["show", "2"], path: "/synthetic-org/_apis/distributedtask/pools/2", body: pool, key: "pool", expected: pool },
    { name: "queue", command: queueCommand, argv: ["show", "5"], path: "/synthetic-org/SyntheticProject/_apis/distributedtask/queues/5", body: queue, key: "queue", expected: queue },
    { name: "user", command: userCommand, argv: ["show", "synthetic-user"], path: "/synthetic-org/_apis/userentitlements/synthetic-user", body: user, key: "user", expected: user },
    { name: "project", command: projectCommand, argv: ["show"], path: "/synthetic-org/_apis/projects/SyntheticProject", body: project, key: "project", expected: project },
    { name: "repo", command: repoCommand, argv: ["show", "synthetic-repo"], path: "/synthetic-org/SyntheticProject/_apis/git/repositories/synthetic-repo", body: repo, key: "repo", expected: repo },
  ])("shows $name metadata without secrets under --full", async ({ command, argv, path, body, key, expected }) => {
    respond(path, body);
    const result = await command([...argv, ...context, "--full"]);
    expect(result[key]).toMatchObject(expected);
    expect(encode(result)).not.toContain(secret);
  });

  it("masks pipeline variables before --fields and preserves safe values", async () => {
    respond("/synthetic-org/SyntheticProject/_apis/build/definitions/9", definition);
    const result = await pipelineCommand(["variable", "list", "--pipeline", "9", ...context, "--full", "--fields", "name,value"]);
    expect(result).toMatchObject({ count: "3 of 3 variables", omitted: 0,
      variables: [{ name: "environment", value: "test" }, { name: "credential", value: "***" }, { name: "absentSecret", value: "***" }] });
    expect(encode(result)).not.toContain(secret);
  });

  it("bounds pipeline variables even under --full", async () => {
    respond("/synthetic-org/SyntheticProject/_apis/build/definitions/9", definition);
    expect(await pipelineCommand(["variable", "list", "--pipeline", "9", ...context, "--limit", "1", "--full"])).toMatchObject({
      count: "1 of 3 variables", omitted: 2, variables: [{ name: "environment", value: "test" }],
    });
  });

  it("bounds nested variables in a full variable-group detail", async () => {
    respond("/synthetic-org/SyntheticProject/_apis/distributedtask/variablegroups/4", variableGroup);
    expect(await variableGroupCommand(["show", "4", ...context, "--limit", "1", "--full"])).toMatchObject({
      "variable-group": { variables: [{ name: "environment", value: "test" }], "variables-total": 3, "variables-omitted": 2 },
    });
  });

  it("preserves nested variable counts when selecting the collection", async () => {
    respond("/synthetic-org/SyntheticProject/_apis/distributedtask/variablegroups", { value: [variableGroup] });
    expect(await variableGroupCommand(["list", ...context, "--limit", "1", "--fields", "variables"])).toMatchObject({
      "variable-groups": [{ variables: [{ name: "environment", value: "test" }], "variables-total": 3, "variables-omitted": 2 }],
    });
  });

  it.each([
    ["list"], ["show"], ["list", "--full"], ["show", "--full"],
    ["list", "--fields", "acesDictionary"], ["show", "--full", "--fields", "acesDictionary"],
  ])("preserves ACE counts alongside bounded dictionaries with %j", async (...argv) => {
    respond("/synthetic-org/_apis/accesscontrollists/synthetic-namespace", { value: [{ ...acl, acesDictionary: {
      "vssgp.synthetic": acl.acesDictionary["vssgp.synthetic"],
      "vssgp.other": { descriptor: "vssgp.other", allow: 4, deny: 0 },
    } }] });
    expect(await securityCommand(["permission", ...argv, "--namespace", "synthetic-namespace", "--token", acl.token, ...context, "--limit", "1"])).toMatchObject({
      permissions: [{ acesDictionary: acl.acesDictionary, "aces-total": 2, "aces-omitted": 1 }],
    });
  });

  it.each([400, 403, 404, 500])("withholds credentials echoed in HTTP %s errors", async (status) => {
    respond("/synthetic-org/SyntheticProject/_apis/serviceendpoint/endpoints/synthetic-endpoint", { message: `Credential rejected: ${secret}` }, undefined, status);
    await expect(serviceEndpointCommand(["show", "synthetic-endpoint", ...context, "--full"])).rejects.toMatchObject({
      message: "audit read failed; response details withheld to protect secrets",
      suggestions: ["Check the selected organization, project, identifier, and read permissions"],
    });
  });

  it("withholds credentials from transport errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error(secret));
    await expect(variableGroupCommand(["show", "4", ...context, "--full"])).rejects.toMatchObject({
      message: "audit read failed; response details withheld to protect secrets", code: "NETWORK_ERROR",
      suggestions: ["Check the selected organization, project, identifier, and read permissions"],
    });
  });

  it.each(["OtherSyntheticProject", "SyntheticProject"])("uses selected project %s", async (selected) => {
    respond(`/synthetic-org/${selected}/_apis/serviceendpoint/endpoints`, { value: [endpoint] });
    expect(await serviceEndpointCommand(["list", "--org", "synthetic-org", "--project", selected])).toMatchObject({
      endpoints: [{ id: "synthetic-endpoint", name: "Synthetic connection", type: "azurerm", isReady: true }],
    });
  });
});

describe("audit CLI dispatch", () => {
  it.each([
    { command: "repo", group: "policy", action: ["list", "--repo", "synthetic-repo"],
      path: "SyntheticProject/_apis/git/policy/configurations?repositoryId=synthetic-repo&api-version=7.1-preview.1",
      body: { value: [policy] }, expected: { policies: [{ id: 7 }] } },
    { command: "repo", group: "policy", action: ["show", "7"],
      path: "SyntheticProject/_apis/policy/configurations/7?api-version=7.1",
      body: policy, expected: { policy: { id: 7 } } },
    { command: "pipeline", group: "variable-group", action: ["list"],
      path: "SyntheticProject/_apis/distributedtask/variablegroups?api-version=7.1",
      body: { value: [variableGroup] }, expected: { "variable-groups": [{ id: 4 }] } },
    { command: "pipeline", group: "variable-group", action: ["show", "4"],
      path: "SyntheticProject/_apis/distributedtask/variablegroups/4?api-version=7.1",
      body: variableGroup, expected: { "variable-group": { id: 4 } } },
    { command: "pipeline", group: "agent", action: ["list", "--pool", "2"],
      path: "_apis/distributedtask/pools/2/agents?includeCapabilities=false&api-version=7.1",
      body: { value: [agent] }, expected: { agents: [{ id: 3 }] } },
    { command: "pipeline", group: "agent", action: ["show", "3", "--pool", "2"],
      path: "_apis/distributedtask/pools/2/agents/3?includeCapabilities=false&api-version=7.1",
      body: agent, expected: { agent: { id: 3 } } },
    { command: "pipeline", group: "pool", action: ["list"],
      path: "_apis/distributedtask/pools?api-version=7.1",
      body: { value: [pool] }, expected: { pools: [{ id: 2 }] } },
    { command: "pipeline", group: "pool", action: ["show", "2"],
      path: "_apis/distributedtask/pools/2?api-version=7.1",
      body: pool, expected: { pool: { id: 2 } } },
    { command: "pipeline", group: "queue", action: ["list"],
      path: "SyntheticProject/_apis/distributedtask/queues?api-version=7.1",
      body: { value: [queue] }, expected: { queues: [{ id: 5 }] } },
    { command: "pipeline", group: "queue", action: ["show", "5"],
      path: "SyntheticProject/_apis/distributedtask/queues/5?api-version=7.1",
      body: queue, expected: { queue: { id: 5 } } },
  ])("preserves flags before $command $group $action", ({ command, group, action, path, body, expected }) => {
    const fixture = join(scratch, "replay.json");
    writeFileSync(fixture, JSON.stringify({ calls: [{ method: "GET", url: `https://dev.azure.com/synthetic-org/${path}`, status: 200, body: JSON.stringify(body) }] }));
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.ts", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)), command, ...context, "--limit=1", group, ...action, "--full",
    ], { encoding: "utf8", timeout: 10_000, env: { ...process.env, ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: fixture } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(decode(result.stdout)).toMatchObject(expected);
  });
});

describe("audit CLI secret handling", () => {
  it.each([
    { name: "endpoint credentials", argv: ["service-endpoint", "show", "synthetic-endpoint"],
      url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/serviceendpoint/endpoints/synthetic-endpoint?api-version=7.1", body: endpoint,
      expected: { endpoint: { name: "Synthetic connection", authorization: "***", data: "***", url: "***" } } },
    { name: "variable group secrets", argv: ["pipeline", "variable-group", "show", "4"],
      url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/distributedtask/variablegroups/4?api-version=7.1", body: variableGroup,
      expected: { "variable-group": { variables: [{ name: "environment", value: "test", isSecret: false }, { name: "credential", value: "***", isSecret: true }, { name: "absentSecret", value: "***", isSecret: true }] } } },
    { name: "pipeline variable secrets", argv: ["pipeline", "variable", "list", "--pipeline", "9"],
      url: "https://dev.azure.com/synthetic-org/SyntheticProject/_apis/build/definitions/9?api-version=7.1", body: definition,
      expected: { variables: [{ name: "environment", value: "test", isSecret: false }, { name: "credential", value: "***", isSecret: true }, { name: "absentSecret", value: "***", isSecret: true }] } },
  ])("masks $name in actual CLI stdout under --full", ({ argv, url, body, expected }) => {
    const fixture = join(scratch, "replay.json");
    writeFileSync(fixture, JSON.stringify({ calls: [{ method: "GET", url, status: 200, body: JSON.stringify(body) }] }));
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--import", fileURLToPath(new URL("../scripts/benchmark/fetch-hook.ts", import.meta.url)),
      fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)), ...argv, ...context, "--full",
    ], { encoding: "utf8", timeout: 10_000, env: { ...process.env, ADO_AXI_PAT: "synthetic-placeholder", ADO_AXI_BENCH_MODE: "replay", ADO_AXI_BENCH_FILE: fixture } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(secret);
    expect(decode(result.stdout)).toMatchObject(expected);
  });
});
