import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decode } from "@toon-format/toon";
import { describe, expect, it } from "vitest";

const context = ["--org", "synthetic-org", "--project", "SyntheticProject"];
const mutations = [
  ["work-item", "create"],
  ["work-item", "update", "42"],
  ["work-item", "delete", "42", "--if-rev", "7"],
  ["work-item", "delete", "42", "--if-rev", "7", "--destroy", "--confirm-destroy"],
  ["work-item", "comment", "42"],
  ["work-item", "attach", "42", "--file", "synthetic-attachment.txt"],
  ["work-item", "link", "add", "42"],
  ["work-item", "link", "remove", "42", "--index", "1", "--if-rev", "7"],
  ["work-item", "links", "remove", "42"],
  ["wi", "update", "42"],
  ["workitem", "delete", "42"],
  ["work-items", "create"],
  ["pr", "create"], ["pr", "update", "42"], ["pr", "complete", "42"],
  ["pr", "abandon", "42"], ["pr", "approve", "42"], ["pr", "vote", "42"],
  ["pr", "comment", "42"], ["pr", "reviewer", "add", "42"], ["pr", "reviewer", "remove", "42"],
  ["pr", "thread", "resolve", "42"], ["pr", "thread", "reopen", "42"], ["pr", "thread", "reply", "42"],
  ["prs", "update", "42"], ["pipeline", "run"], ["pipelines", "run"],
  ["pipeline", "create"], ["pipeline", "update", "42"], ["pipeline", "delete", "42"],
  ["pipelines", "delete", "42"], ["pipeline", "build", "cancel", "42"],
  ["pipeline", "build", "tag", "add", "42"], ["pipeline", "build", "tag", "remove", "42"],
  ["pipeline", "runs", "tag", "add", "42"], ["pipeline", "runs", "tag", "remove", "42"],
  ["pipeline", "folder", "create"], ["pipeline", "folder", "delete"],
  ["pipeline", "release", "create"], ["pipelines", "release", "create", "--definition", "4"],
  ["repo", "create"], ["repo", "update", "--repo", "Repo"], ["repo", "delete", "--repo", "Repo"], ["repo", "import", "--repo", "Repo"],
  ["repo", "policy", "create"], ["repo", "policy", "update", "7"], ["repo", "policy", "delete", "7"],
  ["repos", "create"], ["repos", "update"], ["repos", "delete"], ["repos", "import"],
  ["repos", "policy", "create"], ["repos", "policy", "update", "7"], ["repos", "policy", "delete", "7"],
  ["wiki", "page", "create", "--file", "/absent.md"], ["wiki", "page", "update"],
  ["ref", "create"], ["ref", "delete"], ["refs", "delete"],
  ["config", "init"], ["config", "add"],
  ["api", "POST", "_apis/example"], ["api", "PATCH", "_apis/example"],
  ["api", "PUT", "_apis/example"], ["api", "DELETE", "_apis/example"],
  ["api", "_apis/example", "--method", "patch"],
  ["api", "_apis/example", "--body", "{}"],
];

function run(argv: string[], writes?: string, input = "") {
  const env = {
    ...process.env, ADO_AXI_WRITES: writes, ADO_AXI_PAT: "synthetic-placeholder",
    ADO_AXI_CONFIG: fileURLToPath(new URL("./fixtures/absent-config.json", import.meta.url)),
  };
  return spawnSync(process.execPath, [
    "--import", "tsx", "--import", fileURLToPath(new URL("./fixtures/no-network.mjs", import.meta.url)),
    fileURLToPath(new URL("../src/bin/ado-axi.ts", import.meta.url)), ...argv, ...context,
  ], { encoding: "utf8", timeout: 10_000, env, input });
}

describe("CLI write enablement", () => {
  it.each(mutations)("refuses disabled mutation %j before any request", (...argv) => {
    const result = run(argv);
    expect(result.status).toBe(1);
    expect(decode(result.stdout)).toEqual({
      error: "writes are disabled", code: "WRITES_DISABLED",
      help: ["Set ADO_AXI_WRITES=1 to enable write commands"],
    });
    expect(result.stderr).toBe("");
  });

  it.each(["", "0", "true", "01"])("requires the exact enablement value instead of %j", (value) => {
    expect(decode(run(["wi", "delete", "42", "--if-rev", "7"], value).stdout))
      .toMatchObject({ code: "WRITES_DISABLED" });
  });

  it("refuses implicit POST from piped stdin before any request", () => {
    const result = run(["api", "_apis/example"], undefined, "{}");
    expect(result.status).toBe(1);
    expect(decode(result.stdout)).toMatchObject({ code: "WRITES_DISABLED" });
  });

  it.each(["work-item", "pr", "pipeline", "repo", "ref", "wiki", "config", "api"])("keeps %s help available", (command) => {
    const result = run([command, "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ADO_AXI_WRITES=1");
  });
});
