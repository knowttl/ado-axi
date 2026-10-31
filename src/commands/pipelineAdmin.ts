import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagNumber, flagString, parseArgs, type ParsedArgs } from "../lib/args.js";
import { assertAuditPositionals, auditLimit, auditOutput, type AuditRecord } from "../lib/audit.js";
import { request, type RequestOptions } from "../lib/client.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

function required(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (!value?.trim()) throw new AxiError(`--${name} is required`, "VALIDATION_ERROR");
  return value;
}

function positive(value: number | undefined, name: string): number {
  if (!Number.isSafeInteger(value) || value! < 1) {
    throw new AxiError(`${name} must be a positive integer`, "VALIDATION_ERROR");
  }
  return value!;
}

function definitionInput(args: ParsedArgs): AuditRecord {
  let value: unknown;
  try { value = JSON.parse(required(args, "definition")); } catch {
    throw new AxiError("--definition requires a JSON object", "VALIDATION_ERROR");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AxiError("--definition requires a JSON object", "VALIDATION_ERROR");
  }
  const definition = value as AuditRecord;
  if ("id" in definition || "revision" in definition) {
    throw new AxiError("omit id and revision from --definition; use the command id and --if-rev", "VALIDATION_ERROR");
  }
  return definition;
}

export async function pipelineAdminCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const action = args.positionals.shift()!;
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `pipeline ${action}`);
  // Definition responses and API errors can echo secret variables and repository credentials.
  async function call<T = AuditRecord>(options: RequestOptions): Promise<T> {
    try { return await request<T>(profile, {
      ...options, project,
      ...(options.path.startsWith("_apis/build/folders") ? { apiVersion: "7.1-preview.2" } : {}),
    }); } catch (error) {
      throw new AxiError("pipeline administration request failed; response details withheld to protect secrets",
        error instanceof AxiError ? error.code : "API_ERROR",
        ["Check the selected project, identifier, permissions, and definition; re-read before retrying"]);
    }
  }

  if (["create", "update", "delete"].includes(action)) {
    assertKnownFlags(args, action === "create" ? ["definition"]
      : action === "update" ? ["definition", "if-rev"] : ["if-rev", "confirm-delete"], `pipeline ${action}`);
    assertAuditPositionals(args, action === "create" ? 0 : 1);
    const input = action === "delete" ? undefined : definitionInput(args);
    const path = "_apis/build/definitions";
    if (action === "create") {
      if (typeof input!.name !== "string" || !input!.name.trim()) {
        throw new AxiError("--definition must include a nonempty name", "VALIDATION_ERROR");
      }
      const created = await call({ method: "POST", path, body: input });
      return { created: { id: created.id, revision: created.revision },
        help: [`Run \`ado-axi pipeline show ${created.id}\` to inspect the definition`] };
    }
    const id = positive(Number(args.positionals[0]), "pipeline id");
    const expected = flagNumber(args, "if-rev");
    if (expected !== undefined) positive(expected, "--if-rev");
    if (action === "delete") {
      positive(expected, "--if-rev");
      if (!flagBool(args, "confirm-delete")) {
        throw new AxiError("pipeline deletion requires --confirm-delete and --if-rev <n>", "VALIDATION_ERROR");
      }
    }
    const current = await call({ path: `${path}/${id}` });
    const revision = positive(current.revision as number, "definition revision");
    if (expected !== undefined && revision !== expected) {
      throw new AxiError("definition revision changed; re-read before retrying", "PRECONDITION_FAILED");
    }
    if (action === "delete") {
      // Azure's definition DELETE has no atomic revision predicate.
      await call({ method: "DELETE", path: `${path}/${id}` });
      return { deleted: { id, "checked-rev": revision } };
    }
    const updated = await call({ method: "PUT", path: `${path}/${id}`,
      body: { ...current, ...input, id, revision } });
    return { updated: { id, revision: updated.revision },
      help: [`Run \`ado-axi pipeline show ${id}\` to inspect the definition`] };
  }

  if (action === "folder") {
    const operation = args.positionals.shift() ?? "list";
    if (!["list", "create", "delete"].includes(operation)) {
      throw new AxiError("Use pipeline folder list|create|delete", "VALIDATION_ERROR");
    }
    assertKnownFlags(args, operation === "list" ? ["path", "limit"]
      : operation === "create" ? ["path"] : ["path", "confirm-delete"], `pipeline folder ${operation}`);
    assertAuditPositionals(args, 0);
    const path = operation === "list" ? flagString(args, "path") : required(args, "path");
    if (operation === "list") {
      const limit = auditLimit(args);
      const result = await call<{ value?: AuditRecord[] }>({ path: "_apis/build/folders", query: { path } });
      const rows = result.value ?? [];
      return auditOutput("folders", { rows: rows.slice(0, limit), total: rows.length }, args, ["path", "description"]);
    }
    if (!path!.startsWith("\\") || path === "\\") {
      throw new AxiError("--path must be a non-root absolute folder path such as \\Team", "VALIDATION_ERROR");
    }
    const resource = `_apis/build/folders/${encodeURIComponent(path!)}`;
    if (operation === "delete") {
      if (!flagBool(args, "confirm-delete")) {
        throw new AxiError("folder deletion requires --confirm-delete", "VALIDATION_ERROR");
      }
      const result = await call<{ value?: AuditRecord[] }>({ path: "_apis/build/folders", query: { path } });
      if (!(result.value ?? []).some((folder) => folder.path === path)) {
        return { folder: "already absent (no-op)" };
      }
      await call({ method: "DELETE", path: resource });
    } else {
      await call({ method: "PUT", path: resource, body: { path } });
    }
    return { [operation === "create" ? "created" : "deleted"]: { path } };
  }

  const operation = args.positionals.shift();
  if (operation !== "tag" && !(action === "build" && operation === "cancel")) {
    throw new AxiError("Use pipeline build cancel <id> or pipeline build|runs tag add|remove <id> --tag <tag>", "VALIDATION_ERROR");
  }
  const tagAction = operation === "tag" ? args.positionals.shift() : undefined;
  if (operation === "tag" && !["add", "remove"].includes(tagAction ?? "")) {
    throw new AxiError("tag requires add or remove", "VALIDATION_ERROR");
  }
  assertKnownFlags(args, operation === "tag" ? ["tag"] : [], `pipeline ${action} ${operation}`);
  assertAuditPositionals(args, 1);
  const id = positive(Number(args.positionals[0]), "run id");
  const path = `_apis/build/builds/${id}`;
  if (operation === "cancel") {
    const build = await call({ path });
    if (["completed", "cancelling"].includes(String(build.status))) {
      return { run: { id, status: build.status, outcome: "no-op" } };
    }
    await call({ method: "PATCH", path, body: { status: "cancelling" } });
    return { run: { id, status: "cancelling" } };
  }
  const tag = required(args, "tag");
  await call({ method: tagAction === "add" ? "PUT" : "DELETE", path: `${path}/tags/${encodeURIComponent(tag)}` });
  return { tagged: { run: id, tag, outcome: tagAction === "add" ? "added" : "removed" } };
}
