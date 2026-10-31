import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditLimit, auditOutput, auditRequest, type AuditRecord } from "../lib/audit.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

export async function teamCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  const members = sub === "list-member" || (sub === "member" && args.positionals.shift() === "list");
  if (sub !== "list" && !members) throw new AxiError("Use team list or team member list --team <id>", "VALIDATION_ERROR");
  assertKnownFlags(args, members ? ["team", "limit"] : ["limit"], members ? "team member list" : "team list");
  const limit = auditLimit(args);
  assertAuditPositionals(args, 0);
  const profile = profileFromArgs(args);
  const project = requireProject(profile, "team");
  const team = flagString(args, "team");
  if (members && !team) throw new AxiError("--team is required", "VALIDATION_ERROR");
  const path = `_apis/projects/${encodeURIComponent(project)}/teams${members ? `/${encodeURIComponent(team!)}/members` : ""}`;
  // Core team APIs use offset pagination rather than continuation tokens.
  const rows: AuditRecord[] = [];
  let total = 0;
  let page: AuditRecord[];
  do {
    const response = await auditRequest<{ value: AuditRecord[] }>(profile, { path, query: { $top: 100, $skip: total } });
    page = response.value;
    rows.push(...page.slice(0, Math.max(0, limit - rows.length)));
    total += page.length;
  } while (page.length === 100);
  return auditOutput(members ? "members" : "teams", { rows, total }, args, members ? ["identity", "isTeamAdmin"] : ["id", "name", "description"]);
}
