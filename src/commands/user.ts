import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { profileFromArgs } from "../lib/context.js";

export async function userCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  if (!["list", "show"].includes(sub)) throw new AxiError("Use user list|show", "VALIDATION_ERROR");
  assertKnownFlags(args, sub === "show" ? ["id", "limit"] : ["limit"], `user ${sub}`);
  const limit = auditLimit(args);
  assertAuditPositionals(args, sub === "show" ? 1 : 0);
  const profile = profileFromArgs(args);
  const path = "_apis/userentitlements";
  const options = { host: "vsaex" as const, apiVersion: "7.1-preview.3" };
  if (sub === "show") return { user: safeAudit(await auditRequest(profile, { ...options, path: `${path}/${auditId(args)}` }), args) };
  return auditOutput("users", await auditList(profile, { ...options, path }, limit, "members"), args, ["id", "user", "accessLevel", "lastAccessedDate"]);
}
