import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagNumber, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditLimit, auditList, auditOutput, auditRequest, safeAudit, type AuditRecord } from "../lib/audit.js";
import { request } from "../lib/client.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

/** Release artifacts and environments include service URLs and secret variables, including under --full. */
function releaseOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(releaseOutput);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key, /url|uri|href|_links/i.test(key) ? "***" : releaseOutput(child),
  ]));
}

export async function releaseCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const action = args.positionals.shift();
  if (!["list", "show", "create"].includes(action ?? "")) {
    throw new AxiError("Use pipeline release list|show|create", "VALIDATION_ERROR");
  }
  assertKnownFlags(args, action === "create" ? ["definition", "description", "artifacts", "draft"]
    : action === "list" ? ["definition", "limit"] : ["limit"], `pipeline release ${action}`);
  assertAuditPositionals(args, action === "show" ? 1 : 0);
  const limit = auditLimit(args);
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `pipeline release ${action}`);
  const path = "_apis/release/releases";
  const definition = flagNumber(args, "definition");
  if (definition !== undefined && (!Number.isSafeInteger(definition) || definition < 1)) {
    throw new AxiError("--definition must be a positive integer", "VALIDATION_ERROR");
  }
  if (action === "list") {
    const result = await auditList(profile, {
      path, host: "vsrm", project, query: { definitionId: definition, $top: Math.min(limit, 100) },
    }, limit);
    const output = auditOutput("releases", {
      ...result, rows: result.rows.map((row) => releaseOutput(row) as AuditRecord),
    }, args, ["id", "name", "status", "createdOn"]);
    return { ...output, help: [
      ...((output.help ?? []) as string[]), "Run `ado-axi pipeline release show <id> --full` to inspect a release",
    ] };
  }
  if (action === "show") {
    const id = Number(args.positionals[0]);
    if (!Number.isSafeInteger(id) || id < 1) throw new AxiError("a positive release id is required", "VALIDATION_ERROR");
    const release = await auditRequest<AuditRecord>(profile, { path: `${path}/${id}`, project, host: "vsrm" });
    return { release: safeAudit(releaseOutput(release), args),
      ...(!flagBool(args, "full") && typeof release.description === "string" && release.description.length > 1200
        ? { help: [`Run \`ado-axi pipeline release show ${id} --full\` for the complete description`] } : {}) };
  }
  if (definition === undefined) throw new AxiError("release create requires --definition <id>", "VALIDATION_ERROR");
  const description = flagString(args, "description");
  const draft = flagString(args, "draft");
  if (draft !== undefined && draft !== "true" && draft !== "false") {
    throw new AxiError("--draft requires true or false", "VALIDATION_ERROR");
  }
  const artifactJson = flagString(args, "artifacts");
  let artifacts: Array<{ alias: string; instanceReference: { id: string } }> | undefined;
  if (artifactJson !== undefined) {
    let value: unknown;
    try { value = JSON.parse(artifactJson); } catch {
      throw new AxiError("--artifacts requires a JSON array of {alias, instanceReference: {id}}", "VALIDATION_ERROR");
    }
    if (!Array.isArray(value) || value.some((item) => !item || typeof item.alias !== "string" || !item.alias.trim()
      || typeof item.instanceReference?.id !== "string" || !item.instanceReference.id.trim())) {
      throw new AxiError("--artifacts requires a JSON array of {alias, instanceReference: {id}}", "VALIDATION_ERROR");
    }
    artifacts = value;
  }
  let created: { id: number; name: string; status: string };
  try {
    created = await request(profile, {
      method: "POST", path, project, host: "vsrm",
      body: { definitionId: definition, ...(description === undefined ? {} : { description }),
        ...(artifacts === undefined ? {} : { artifacts }), ...(draft === undefined ? {} : { isDraft: draft === "true" }) },
    });
  } catch (error) {
    throw new AxiError("release create failed; response details withheld to protect secrets",
      error instanceof AxiError ? error.code : "API_ERROR", ["Check the release definition, artifact versions, and create permissions"]);
  }
  return { created: { id: created.id, name: created.name, status: created.status },
    help: [`Run \`ado-axi pipeline release show ${created.id}\` to inspect the release`] };
}
