import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

export async function variableGroupCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  if (!["list", "show"].includes(sub)) throw new AxiError("Use variable-group list|show", "VALIDATION_ERROR");
  assertKnownFlags(args, sub === "show" ? ["id", "limit"] : ["limit"], `variable-group ${sub}`);
  const limit = auditLimit(args);
  assertAuditPositionals(args, sub === "show" ? 1 : 0);
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `variable-group ${sub}`);
  const path = "_apis/distributedtask/variablegroups";
  if (sub === "show") return { "variable-group": safeAudit(await auditRequest(profile, {
    path: `${path}/${auditId(args)}`, project,
  }), args) };
  return auditOutput("variable-groups", await auditList(profile, { path, project }, limit), args, ["id", "name", "type"]);
}
