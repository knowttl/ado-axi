import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
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
  const rows: AuditRecord[] = [];
  let total = 0;
  let page: AuditRecord[];
  do {
    const response = await auditRequest<{ members: AuditRecord[] }>(profile, {
      ...options, path, query: { top: 100, skip: total },
    });
    page = response.members;
    rows.push(...page.slice(0, Math.max(0, limit - rows.length)));
    total += page.length;
  } while (page.length === 100);
  return auditOutput("users", { rows, total }, args, ["id", "user", "accessLevel", "lastAccessedDate"]);
}
