import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decode, encode } from "@toon-format/toon";
import { workItemCommand } from "../src/commands/workItem.js";
import { queryCommand } from "../src/commands/query.js";
import { classificationCommand } from "../src/commands/classification.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const context = ["--org", "example-org", "--project", "Example Project"];
const queryId = "11111111-1111-4111-8111-111111111111";
let querySize = 5;
let linkedQuery = false;
let folder = false;

function classificationTree(kind: string, depth: number) {
  const structureType = kind === "areas" ? "area" : "iteration";
  const leaf = {
    id: 3, identifier: "33333333-3333-4333-8333-333333333333", name: "Sprint 1", structureType,
    path: `\\Example Project\\${structureType}\\Delivery\\Sprint 1`, hasChildren: false,
    url: `https://dev.azure.com/example-org/Example%20Project/_apis/wit/classificationnodes/${kind}/Delivery/Sprint%201`,
    ...(kind === "iterations" ? { attributes: { startDate: "2025-01-01T00:00:00Z", finishDate: "2025-01-14T00:00:00Z" } } : {}),
  };
  const child = {
    id: 2, identifier: "22222222-2222-4222-8222-222222222222", name: "Delivery", structureType,
    path: `\\Example Project\\${structureType}\\Delivery`, hasChildren: true,
    url: `https://dev.azure.com/example-org/Example%20Project/_apis/wit/classificationnodes/${kind}/Delivery`,
    ...(depth > 1 ? { children: [leaf] } : {}),
  };
  return {
    id: 1, identifier: "11111111-1111-4111-8111-111111111111", name: "Example Project", structureType,
    path: `\\Example Project\\${structureType}`, hasChildren: true,
    url: `https://dev.azure.com/example-org/Example%20Project/_apis/wit/classificationnodes/${kind}`,
    ...(depth > 0 ? { children: [child] } : {}),
  };
}

beforeEach(() => {
  querySize = 5;
  linkedQuery = false;
  folder = false;
  vi.stubEnv("ADO_AXI_CONFIG", "/tmp/ado-axi-boards-reads-no-config.json");
  vi.stubEnv("ADO_EXAMPLE_ORG_PAT", "synthetic-test-token");
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (init?.method !== "GET") throw new Error(`Read command sent ${init?.method}`);
    if (url.pathname.endsWith("/workitemrelationtypes")) return Response.json({ count: 2, value: [
      { referenceName: "System.LinkTypes.Hierarchy-Forward", name: "Child", url: "https://dev.azure.com/example-org/_apis/wit/workItemRelationTypes/System.LinkTypes.Hierarchy-Forward",
        attributes: { usage: "workItemLink", enabled: true, directional: true, acyclic: true, topology: "tree", isForward: true, oppositeEndReferenceName: "System.LinkTypes.Hierarchy-Reverse" } },
      { referenceName: "System.LinkTypes.Hierarchy-Reverse", name: "Parent", url: "https://dev.azure.com/example-org/_apis/wit/workItemRelationTypes/System.LinkTypes.Hierarchy-Reverse",
        attributes: { usage: "workItemLink", enabled: true, directional: true, acyclic: true, topology: "tree", isForward: false, oppositeEndReferenceName: "System.LinkTypes.Hierarchy-Forward" } },
    ] });
    if (decodeURIComponent(url.pathname).endsWith("/queries/Shared Queries/Open bugs")) {
      return Response.json({ id: queryId, name: "Open bugs", path: "Shared Queries/Open bugs", isFolder: folder,
        queryType: "flat", columns: [{ referenceName: "System.Id", name: "ID" }],
        wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project" });
    }
    if (url.pathname.endsWith(`/wiql/${queryId}`)) {
      const top = url.searchParams.get("$top");
      if (!top) throw new Error("Saved query must retain a server-side bound");
      const workItems = Array.from({ length: Math.min(querySize, Number(top)) }, (_, i) => ({
        id: 42 + i, url: `https://dev.azure.com/example-org/_apis/wit/workItems/${42 + i}`,
      }));
      return Response.json({ queryType: linkedQuery ? "tree" : "flat", queryResultType: linkedQuery ? "workItemLink" : "workItem",
        asOf: "2025-01-01T00:00:00Z", columns: [{ referenceName: "System.Id", name: "ID", url: "https://dev.azure.com/example-org/_apis/wit/fields/System.Id" }],
        ...(linkedQuery ? { workItemRelations: [
          { rel: null, source: null, target: workItems[0] },
          { rel: "System.LinkTypes.Hierarchy-Forward", source: workItems[0], target: workItems[1] },
        ] } : { workItems }) });
    }
    if (url.pathname.endsWith("/workitems")) {
      const ids = url.searchParams.get("ids")!.split(",").map(Number);
      return Response.json({ count: ids.length, value: ids.map((id) => ({ id, rev: 1, fields: {
        "System.Id": id, "System.WorkItemType": "Bug", "System.Title": `Synthetic bug ${id}`,
        "System.State": url.searchParams.get("asOf") === "2025-01-01T00:00:00Z" ? "Active" : "Closed",
        "System.AssignedTo": { displayName: "Alex Example", uniqueName: "alex@example.com" },
        "System.CreatedDate": "2025-01-01T00:00:00Z", "System.ChangedDate": "2025-01-02T00:00:00Z", "Custom.Priority": 0,
      } })) });
    }
    const kind = url.pathname.split("/").pop()!;
    if (kind === "areas" || kind === "iterations") {
      return Response.json(classificationTree(kind, Number(url.searchParams.get("$depth"))));
    }
    throw new Error(`Unexpected synthetic API request: ${url.pathname}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearCredentialCache();
});

describe("TD-063 Boards reads", () => {
  it("lists bounded relation types with an exact left-out count", async () => {
    const result = decode(encode(await workItemCommand(["link", "types", "--limit", "1", ...context])));
    expect(result).toMatchObject({ count: "1 of 2 link types", "left-out": 1, "link-types": [
      { reference: "System.LinkTypes.Hierarchy-Forward", name: "Child", usage: "workItemLink", enabled: true },
    ], help: ["Run `ado-axi work-item link types --full` for all link types"] });
  });

  it("expands relation types with full and selects requested fields", async () => {
    const result = await workItemCommand(["link", "types", "--limit", "1", "--full", "--fields", "name", ...context]);
    expect(result["link-types"]).toEqual([{ name: "Child" }, { name: "Parent" }]);
    expect(result.count).toBe("2 link types");
  });

  it.each([queryId, "Shared Queries/Open bugs", "Shared Queries\\Open bugs"])("runs saved query %s with the shared field handling", async (selector) => {
    const result = await queryCommand(["run", selector, "--limit", "2", "--fields", "id,title,assignee,created,Custom.Priority", ...context]);
    expect(decode(encode(result))).toMatchObject({ count: "2 work items shown", "work-items": [
      { id: 42, title: "Synthetic bug 42", assignee: "Alex Example", created: "2025-01-01", "Custom.Priority": 0 },
      { id: 43, title: "Synthetic bug 43", assignee: "Alex Example", created: "2025-01-01", "Custom.Priority": 0 },
    ] });
  });

  it.each([{ flags: [] }, { flags: ["--full"] }])("bounds large saved queries with $flags", async ({ flags }) => {
    querySize = 20000;
    const result = await queryCommand(["run", queryId, "--limit", "3", ...flags, ...context]);
    expect(result.count).toBe("3 work items shown");
    expect(result["work-items"]).toHaveLength(3);
    const queryCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/wiql/"))!;
    expect(new URL(String(queryCall[0])).searchParams.get("$top")).toBe("3");
  });

  it("reports returned rows without claiming the requested limit was reached", async () => {
    const result = await queryCommand(["run", queryId, "--limit", "30", ...context]);
    expect(result.count).toBe("5 work items shown");
  });

  it("reads saved query items across the API's 200-item batch boundary", async () => {
    querySize = 201;
    const result = await queryCommand(["run", queryId, "--limit", "201", "--fields", "id", ...context]);
    expect(result.count).toBe("201 work items shown");
    expect(result["work-items"]).toHaveLength(201);
    expect((result["work-items"] as Array<{ id: number }>).at(-1)).toEqual({ id: 242 });
  });

  it.each([queryId, "Shared Queries/Open bugs", "Shared Queries\\Open bugs"])("preserves historical values across hydration chunks for %s", async (selector) => {
    querySize = 201;
    const result = await queryCommand(["run", selector, "--limit", "201", "--fields", "state,System.State", ...context]);
    expect(result["work-items"]).toEqual(Array.from({ length: 201 }, () => ({ state: "Active", "System.State": "Active" })));
  });

  it("preserves historical values for linked-query sources and targets", async () => {
    linkedQuery = true;
    const result = await queryCommand(["run", queryId, "--fields", "id,state", ...context]);
    expect(result["work-items"]).toEqual([{ id: 42, state: "Active" }, { id: 43, state: "Active" }]);
  });

  it("reports a definitive empty saved query", async () => {
    querySize = 0;
    const result = await queryCommand(["run", queryId, ...context]);
    expect(result["work-items"]).toBe("0 work items found in Example Project (saved query)");
  });

  it("renders distinct linked-query work items within the display bound", async () => {
    linkedQuery = true;
    const result = await queryCommand(["run", queryId, "--fields", "id", ...context]);
    expect(result["work-items"]).toEqual([{ id: 42 }, { id: 43 }]);
    expect(result.count).toBe("2 work items shown");
  });

  it("rejects a saved query folder", async () => {
    folder = true;
    await expect(queryCommand(["run", "Shared Queries/Open bugs", ...context])).rejects.toThrow("the saved query path is a folder");
  });

  it.each([
    { kind: "area" as const, expected: [{ id: 1, path: "Example Project" }, { id: 2, path: "Example Project\\Delivery" }] },
    { kind: "iteration" as const, expected: [
      { id: 1, path: "Example Project", start: "", finish: "" },
      { id: 2, path: "Example Project\\Delivery", start: "", finish: "" },
    ] },
  ])("bounds the $kind tree with usable paths and a left-out count", async ({ kind, expected }) => {
    const result = await classificationCommand(kind, ["list", "--depth", "2", "--limit", "2", ...context]);
    expect(result.count).toBe(`2 of 3 ${kind} paths within requested depth`);
    expect(result["left-out"]).toBe(1);
    expect(result[`${kind}s`]).toEqual(expected);
  });

  it("shows full iteration paths with their configured dates", async () => {
    const result = await classificationCommand("iteration", ["list", "--limit", "1", "--full", ...context]);
    expect(result.iterations).toEqual([
      { id: 1, path: "Example Project", start: "", finish: "" },
      { id: 2, path: "Example Project\\Delivery", start: "", finish: "" },
      { id: 3, path: "Example Project\\Delivery\\Sprint 1", start: "2025-01-01", finish: "2025-01-14" },
    ]);
    expect(result["left-out"]).toBe(0);
  });

  it("keeps the depth bound with full and discloses deeper branches", async () => {
    const result = await classificationCommand("area", ["list", "--depth", "0", "--full", ...context]);
    expect(result.areas).toEqual([{ id: 1, path: "Example Project" }]);
    expect(result.count).toBe("1 area paths within requested depth");
    expect(result.help).toEqual(["Run `ado-axi area list --depth 1` to include deeper paths"]);
  });

  it.each(["-1", "1.5", "0"])("rejects invalid query limit %s before sending a request", async (limit) => {
    await expect(queryCommand(["run", queryId, "--limit", limit, ...context])).rejects.toThrow("--limit must be a positive integer");
    expect(fetch).not.toHaveBeenCalled();
  });
});
