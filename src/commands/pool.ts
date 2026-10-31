import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { profileFromArgs } from "../lib/context.js";

export async function poolCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  if (!["list", "show"].includes(sub)) throw new AxiError("Use pool list|show", "VALIDATION_ERROR");
  assertKnownFlags(args, sub === "show" ? ["id", "limit"] : ["limit"], `pool ${sub}`);
  const limit = auditLimit(args);
  assertAuditPositionals(args, sub === "show" ? 1 : 0);
  const profile = profileFromArgs(args);
  const path = "_apis/distributedtask/pools";
  if (sub === "show") return { pool: safeAudit(await auditRequest(profile, { path: `${path}/${auditId(args)}` }), args) };
  return auditOutput("pools", await auditList(profile, { path }, limit), args, ["id", "name", "poolType", "isHosted"]);
}
