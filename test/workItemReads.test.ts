import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode, decode } from "@toon-format/toon";
import { workItemCommand } from "../src/commands/workItem.js";
import { clearCredentialCache } from "../src/lib/auth.js";

const context = ["--org", "example-org", "--project", "Example Project"];
let queryResultSize = 25;
const fields: Record<string, unknown> = {
  "System.Id": 42,
  "System.WorkItemType": "Bug",
  "System.Title": "Synthetic event",
  "System.State": "Active",
  "System.AssignedTo": { displayName: "Alex Example", uniqueName: "alex@example.com" },
  "System.CreatedDate": "2025-01-02T03:04:05Z",
  "System.ChangedDate": "2025-02-03T04:05:06Z",
  "System.Description": "<p>Event description</p>",
  "System.TeamProject": "Example Project",
  "Custom.EventSeverity": "High",
  "Custom.EventType": "Service event",
  "Custom.Details": "x".repeat(1400),
  "Custom.Threshold": "Use <limit> & preserve whitespace  ",
  "Custom.Attempts": 0,
  "Custom.Reviewed": false,
  "Microsoft.VSTS.Common.Severity": "2 - High",
  "Microsoft.VSTS.Common.Resolution": "Fixed",
  "Microsoft.VSTS.TCM.ReproSteps": "<p>Open the example page</p>",
};

beforeEach(() => {
  queryResultSize = 25;
  vi.stubEnv("ADO_AXI_CONFIG", "/tmp/ado-axi-work-item-reads-no-config.json");
  vi.stubEnv("ADO_EXAMPLE_ORG_PAT", "synthetic-test-token");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/wiql")) {
      const ids = Array.from({ length: queryResultSize }, (_, i) => ({ id: 42 + i }));
      const top = url.searchParams.get("$top");
      return Response.json({ queryType: "flat", queryResultType: "workItem", asOf: "2026-01-01T00:00:00Z",
        columns: [{ referenceName: "System.Id", name: "ID", url: "https://dev.azure.com/example-org/_apis/wit/fields/System.Id" }],
        workItems: top ? ids.slice(0, Number(top)) : ids });
    }
    if (url.pathname.endsWith("/workitemsbatch")) {
      const body = JSON.parse(String(init?.body)) as { ids: number[]; fields: string[] };
      const unknown = body.fields.find((field) => !(field in fields));
      if (unknown) return Response.json({ message: `TF51535: Cannot find field ${unknown}` }, { status: 400 });
      return Response.json({ count: body.ids.length, value: body.ids.map((id) => ({ id, rev: 3,
        fields: Object.fromEntries(body.fields.map((field) => [field, field === "System.Id" ? id : fields[field]])) })) });
    }
    if (url.pathname.endsWith("/workitems/42")) return Response.json({ id: 42, rev: 3, fields });
    throw new Error(`Unexpected API request: ${url.pathname}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  clearCredentialCache();
});

describe("work-item read regressions", () => {
  it.each([
    [3, "3 work items shown"],
    [5, "5 work items shown"],
  ])("TD-059: reports the displayed count with limit %i", async (limit, count) => {
    const result = await workItemCommand(["list", "--limit", String(limit), ...context]);
    expect(result.count).toBe(count);
    expect(result["work-items"]).toHaveLength(limit as number);
  });

  it("TD-059: reports only displayed items when the limit exceeds the returned result size", async () => {
    const result = await workItemCommand(["list", "--limit", "30", ...context]);
    expect(result.count).toBe("25 work items shown");
    expect(result["work-items"]).toHaveLength(25);
  });

  it.each([
    { limit: 3, query: [] },
    { limit: 5, query: ["--query", "SELECT [System.Id] FROM WorkItems"] },
    { limit: 30, query: [] },
  ])("TD-059: bounds WIQL results without exhaustive claims with limit $limit", async ({ limit, query }) => {
    queryResultSize = 20000;
    const result = await workItemCommand(["list", "--limit", String(limit), ...query, ...context]);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("$top")).toBe(String(limit));
    expect(decode(encode(result))).toMatchObject({ count: `${limit} work items shown` });
    expect(result["work-items"]).toHaveLength(limit);
    expect(result.help).toEqual([
      "Run `ado-axi work-item get <id>` for full detail",
      'Run `ado-axi work-item update <id> --state <state>` to change state',
    ]);
  });

  it("TD-060: fills requested reference-name columns", async () => {
    const result = await workItemCommand(["list", "--limit", "1", "--fields",
      "System.AssignedTo,System.CreatedDate,Custom.EventSeverity,Custom.EventType,Microsoft.VSTS.Common.Severity", ...context]);
    expect(result["work-items"]).toEqual([{
      "System.AssignedTo": "Alex Example",
      "System.CreatedDate": "2025-01-02T03:04:05Z",
      "Custom.EventSeverity": "High",
      "Custom.EventType": "Service event",
      "Microsoft.VSTS.Common.Severity": "2 - High",
    }]);
  });

  it("TD-060: fills the created alias alongside existing aliases", async () => {
    const result = await workItemCommand(["list", "--limit", "1", "--fields", "id,created,assignee,changed,state", ...context]);
    expect(result["work-items"]).toEqual([{ id: 42, created: "2025-01-02", assignee: "Alex Example", changed: "2025-02-03", state: "Active" }]);
  });

  it("TD-060: reports an unknown short field name", async () => {
    await expect(workItemCommand(["list", "--fields", "craeted", ...context]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("craeted") });
  });

  it("TD-060: reports an unknown reference name from the API", async () => {
    await expect(workItemCommand(["list", "--fields", "Custom.Unknown", ...context]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("Custom.Unknown") });
  });

  it.each(["get", "view"])("TD-061: %s includes non-System fields by reference name with bounded text in full output", async (command) => {
    const result = await workItemCommand([command, "42", "--full", ...context]);
    expect(decode(encode(result))).toMatchObject({
      "work-item": { description: "Event description" },
      fields: {
        "Custom.EventSeverity": "High",
        "Custom.EventType": "Service event",
        "Custom.Threshold": "Use <limit> & preserve whitespace  ",
        "Custom.Attempts": 0,
        "Custom.Reviewed": false,
        "Microsoft.VSTS.Common.Severity": "2 - High",
        "Microsoft.VSTS.Common.Resolution": "Fixed",
        "Microsoft.VSTS.TCM.ReproSteps": "Open the example page",
        "Custom.Details": `${"x".repeat(1200)}\n... (truncated, 1400 chars total)`,
      },
    });
    expect(result.fields).not.toHaveProperty("System.Title");
    expect(result.fields).not.toHaveProperty("System.TeamProject");
  });

  it("keeps additional fields out of the default detail view", async () => {
    const result = await workItemCommand(["get", "42", ...context]);
    expect(result.fields).toBeUndefined();
    expect(result["work-item"]).toMatchObject({ title: "Synthetic event", description: "Event description" });
  });
});
