import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditId, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { profileFromArgs } from "../lib/context.js";

export async function securityCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const group = args.positionals.shift();
  const sub = args.positionals.shift() ?? "list";
  if (group === "group" && args.positionals[0] === "list" && sub === "membership") {
    args.positionals.shift();
    return memberships(args);
  }
  if (group === "membership" && sub === "list") return memberships(args);
  if (group === "group" && ["list", "show"].includes(sub)) {
    assertKnownFlags(args, sub === "list" ? ["scope", "limit"] : ["id", "limit"], `security group ${sub}`);
    const limit = auditLimit(args);
    assertAuditPositionals(args, sub === "show" ? 1 : 0);
    const profile = profileFromArgs(args);
    if (sub === "show") return { group: safeAudit(await auditRequest(profile, {
      path: `_apis/graph/groups/${auditId(args)}`, host: "vssps", apiVersion: "7.1-preview.1",
    }), args) };
    return auditOutput("groups", await auditList(profile, {
      path: "_apis/graph/groups", host: "vssps", apiVersion: "7.1-preview.1",
      query: { scopeDescriptor: flagString(args, "scope") },
    }, limit), args, ["descriptor", "displayName", "principalName"]);
  }
  if (group === "permission" && ["list", "show"].includes(sub)) {
    assertKnownFlags(args, ["namespace", "token", "subject", "limit"], `security permission ${sub}`);
    const limit = auditLimit(args);
    const namespace = flagString(args, "namespace");
    assertAuditPositionals(args, 0);
    const token = flagString(args, "token");
    if (!namespace || (sub === "show" && !token)) {
      throw new AxiError("--namespace is required; show also requires --token", "VALIDATION_ERROR");
    }
    const result = await auditList(profileFromArgs(args), {
      path: `_apis/accesscontrollists/${encodeURIComponent(namespace)}`,
      query: { token, descriptors: flagString(args, "subject"), includeExtendedInfo: true, recurse: sub === "list" },
    }, limit);
    return auditOutput("permissions", result, args, ["token", "inheritPermissions", "acesDictionary"]);
  }
  throw new AxiError("Use security group list|show, membership list, or permission list|show", "VALIDATION_ERROR");
}

async function memberships(args: ReturnType<typeof parseArgs>): Promise<AuditRecord> {
  assertKnownFlags(args, ["id", "direction", "limit"], "security membership list");
  const limit = auditLimit(args);
  const id = auditId(args);
  const direction = flagString(args, "direction") ?? "up";
  if (!["up", "down"].includes(direction)) throw new AxiError("--direction must be up or down", "VALIDATION_ERROR");
  return auditOutput("memberships", await auditList(profileFromArgs(args), {
    path: `_apis/graph/memberships/${id}`, host: "vssps", apiVersion: "7.1-preview.1", query: { direction },
  }, limit), args, ["containerDescriptor", "memberDescriptor"]);
}
