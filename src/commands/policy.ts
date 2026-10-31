import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

export async function policyCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  if (!["list", "show"].includes(sub)) throw new AxiError("Use repo policy list|show", "VALIDATION_ERROR");
  assertKnownFlags(args, sub === "list" ? ["config", "repo", "branch", "limit"] : ["config", "id", "limit"], `repo policy ${sub}`);
  const limit = auditLimit(args);
  assertAuditPositionals(args, sub === "show" ? 1 : 0);
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `repo policy ${sub}`);
  if (sub === "show") {
    const policy = await auditRequest(profile, { path: `_apis/policy/configurations/${auditId(args)}`, project });
    return { policy: safeAudit(policy, args) };
  }
  const repo = flagString(args, "repo");
  if (!repo) throw new AxiError("--repo is required for repository policies", "VALIDATION_ERROR");
  const branch = flagString(args, "branch");
  const result = await auditList(profile, {
    path: `_apis/git/policy/configurations`, project,
    apiVersion: "7.1-preview.1",
    query: { repositoryId: repo, refName: branch ? `refs/heads/${branch.replace(/^refs\/heads\//, "")}` : undefined },
  }, limit);
  return auditOutput("policies", result, args, ["id", "type", "isEnabled", "isBlocking"]);
}
