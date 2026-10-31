import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { profileFromArgs } from "../lib/context.js";

export async function agentCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  if (!["list", "show"].includes(sub)) throw new AxiError("Use agent list|show --pool <id>", "VALIDATION_ERROR");
  assertKnownFlags(args, sub === "show" ? ["pool", "id", "limit"] : ["pool", "limit"], `agent ${sub}`);
  const limit = auditLimit(args);
  assertAuditPositionals(args, sub === "show" ? 1 : 0);
  const pool = flagString(args, "pool");
  if (!pool) throw new AxiError("--pool is required", "VALIDATION_ERROR");
  const profile = profileFromArgs(args);
  const path = `_apis/distributedtask/pools/${encodeURIComponent(pool)}/agents`;
  // Capabilities are arbitrary environment variables and can contain unmarked credentials.
  const query = { includeCapabilities: false };
  if (sub === "show") return { agent: safeAudit(await auditRequest(profile, {
    path: `${path}/${auditId(args)}`, query,
  }), args) };
  return auditOutput("agents", await auditList(profile, { path, query }, limit), args, ["id", "name", "status", "enabled"]);
}
