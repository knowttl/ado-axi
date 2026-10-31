import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

export async function serviceEndpointCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const sub = args.positionals.shift() ?? "list";
  if (!["list", "show"].includes(sub)) throw new AxiError("Use service-endpoint list|show", "VALIDATION_ERROR");
  assertKnownFlags(args, sub === "show" ? ["id", "limit"] : ["limit"], `service-endpoint ${sub}`);
  const limit = auditLimit(args);
  assertAuditPositionals(args, sub === "show" ? 1 : 0);
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `service-endpoint ${sub}`);
  const path = "_apis/serviceendpoint/endpoints";
  if (sub === "show") return { endpoint: endpoint(await auditRequest(profile, {
    path: `${path}/${auditId(args)}`, project,
  }), args) };
  const result = await auditList(profile, { path, project }, limit);
  return auditOutput("endpoints", { ...result, rows: result.rows.map((row) => endpoint(row, args)) }, args, ["id", "name", "type", "isReady"]);
}

/** Connection URLs/data may carry embedded credentials. Never return these free-form fields. */
function endpoint(value: AuditRecord, args: ReturnType<typeof parseArgs>): AuditRecord {
  const { authorization, data, url, ...metadata } = value;
  return safeAudit({ ...metadata, authorization: "***", data: "***", url: "***" }, args) as AuditRecord;
}
