import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagNumber, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, type AuditRecord } from "../lib/audit.js";
import { request, type RequestOptions } from "../lib/client.js";
import { configPath, requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";
import { normalizeBranchName } from "./ref.js";

function required(args: ReturnType<typeof parseArgs>, name: string): string {
  const value = flagString(args, name);
  if (!value?.trim()) throw new AxiError(`--${name} is required`, "VALIDATION_ERROR");
  return value;
}

function positive(value: number | undefined, name: string): number {
  if (!Number.isSafeInteger(value) || value! < 1) throw new AxiError(`${name} must be a positive integer`, "VALIDATION_ERROR");
  return value!;
}

export async function repoAdminCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const action = args.positionals.shift();
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `repo ${action}`);
  function followUp(command: string[]): string {
    const selectors = [`--org=${profile.org}`, `--project=${project}`];
    const selectedConfig = profile.configPath ?? flagString(args, "config");
    if (selectedConfig) selectors.push(`--config=${configPath(selectedConfig)}`);
    if (profile.configPath) selectors.push(`--profile=${profile.name}`);
    return ["ado-axi", ...command, ...selectors].map((value) =>
      /^[a-zA-Z0-9_./:=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`).join(" ");
  }
  // Import failures and policy settings can echo credentials. Never return raw API errors.
  async function call<T = AuditRecord>(options: RequestOptions): Promise<T> {
    try { return await request<T>(profile, { ...options, project: options.project ?? project }); } catch (error) {
      throw new AxiError("repository administration request failed; response details withheld to protect secrets",
        error instanceof AxiError ? error.code : "API_ERROR", ["Check the selected project, identifiers, settings, and write permissions"]);
    }
  }

  if (action === "policy") {
    const operation = args.positionals.shift();
    if (!["create", "update", "delete"].includes(operation ?? "")) {
      throw new AxiError("Use repo policy create|update|delete", "VALIDATION_ERROR");
    }
    assertKnownFlags(args, operation === "create" ? ["config", "policy-json"]
      : operation === "update" ? ["config", "policy-json", "if-rev"] : ["config", "if-rev", "confirm-delete"], `repo policy ${operation}`);
    assertAuditPositionals(args, operation === "create" ? 0 : 1);
    const id = operation === "create" ? undefined : positive(Number(args.positionals[0]), "policy id");
    const expected = flagNumber(args, "if-rev");
    if (expected !== undefined) positive(expected, "--if-rev");
    let config: AuditRecord | undefined;
    if (operation === "delete") {
      positive(expected, "--if-rev");
      if (!flagBool(args, "confirm-delete")) throw new AxiError("policy deletion requires --confirm-delete and --if-rev <n>", "VALIDATION_ERROR");
    } else {
      let value: unknown;
      try { value = JSON.parse(required(args, "policy-json")); } catch {
        throw new AxiError("--policy-json requires a policy configuration JSON object", "VALIDATION_ERROR");
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new AxiError("--policy-json requires a policy configuration JSON object", "VALIDATION_ERROR");
      }
      config = value as AuditRecord;
      if ("id" in config || "revision" in config) throw new AxiError("omit id and revision from --policy-json; use the policy id and --if-rev", "VALIDATION_ERROR");
      if (!Object.keys(config).length || Object.keys(config).some((key) => !["type", "settings", "isEnabled", "isBlocking"].includes(key))) {
        throw new AxiError("--policy-json must contain policy fields: type, settings, isEnabled, isBlocking", "VALIDATION_ERROR");
      }
      const type = config.type as { id?: unknown } | undefined;
      if ((operation === "create" || "type" in config)
        && (typeof type?.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(type.id))) {
        throw new AxiError("policy type.id must be a GUID", "VALIDATION_ERROR");
      }
      for (const name of ["isEnabled", "isBlocking"]) {
        if ((operation === "create" || name in config) && typeof config[name] !== "boolean") {
          throw new AxiError(`policy ${name} must be a boolean`, "VALIDATION_ERROR");
        }
      }
      if ((operation === "create" || "settings" in config)
        && (!config.settings || typeof config.settings !== "object" || Array.isArray(config.settings))) {
        throw new AxiError("policy settings must be a JSON object", "VALIDATION_ERROR");
      }
    }
    const path = "_apis/policy/configurations";
    if (operation === "create") {
      const created = await call({ method: "POST", path, body: config });
      return { created: { id: created.id, revision: created.revision },
        help: [`Run \`${followUp(["repo", "policy", "show", String(created.id)])}\` to inspect the configuration`] };
    }
    let current: AuditRecord;
    try { current = await call({ path: `${path}/${id}` }); } catch (error) {
      if (operation === "delete" && error instanceof AxiError && error.code === "NOT_FOUND") {
        return { policy: "already absent (no-op)" };
      }
      throw error;
    }
    const revision = positive(current.revision as number, "policy revision");
    if (expected !== undefined && expected !== revision) throw new AxiError("policy revision changed; re-read before retrying", "PRECONDITION_FAILED");
    if (operation === "delete") {
      // Policy DELETE has no documented atomic revision predicate.
      await call({ method: "DELETE", path: `${path}/${id}` });
      return { deleted: { id, "checked-rev": revision } };
    }
    const updated = await call({ method: "PUT", path: `${path}/${id}`, body: { ...current, ...config, id, revision } });
    return { updated: { id, revision: updated.revision },
      help: [`Run \`${followUp(["repo", "policy", "show", String(id)])}\` to inspect the configuration`] };
  }

  if (!["create", "update", "delete", "import"].includes(action ?? "")) {
    throw new AxiError("Use repo create|update|delete|import", "VALIDATION_ERROR");
  }
  assertKnownFlags(args, action === "create" ? ["config", "name"] : action === "update" ? ["config", "repo", "name", "default-branch", "disabled"]
    : action === "delete" ? ["config", "repo", "confirm-delete"] : ["config", "repo", "source-url", "service-endpoint"], `repo ${action}`);
  assertAuditPositionals(args, 0);
  const path = "_apis/git/repositories";
  if (action === "create") {
    const name = required(args, "name");
    const target = await call({ path: `_apis/projects/${encodeURIComponent(project)}`, project: "" });
    const created = await call({ method: "POST", path, body: { name, project: { id: target.id } } });
    return { created: { id: created.id, name: created.name },
      help: [`Run \`${followUp(["repo", "show", String(created.id)])}\` to inspect the repository`] };
  }
  const repo = required(args, "repo");
  const body: AuditRecord = {};
  if (action === "delete") {
    if (!flagBool(args, "confirm-delete")) throw new AxiError("repository deletion requires --confirm-delete", "VALIDATION_ERROR");
  } else if (action === "update") {
    const name = flagString(args, "name");
    const branch = flagString(args, "default-branch");
    const disabled = flagString(args, "disabled");
    if (name !== undefined) body.name = required(args, "name");
    if (branch !== undefined) body.defaultBranch = normalizeBranchName(branch);
    if (disabled !== undefined) {
      if (disabled !== "true" && disabled !== "false") throw new AxiError("--disabled requires true or false", "VALIDATION_ERROR");
      body.isDisabled = disabled === "true";
    }
    if (Object.keys(body).length === 0) throw new AxiError("repository update requires --name, --default-branch, or --disabled", "VALIDATION_ERROR");
  } else {
    let source: URL;
    try { source = new URL(required(args, "source-url")); } catch {
      throw new AxiError("--source-url requires a credential-free HTTPS Git URL", "VALIDATION_ERROR");
    }
    if (source.protocol !== "https:" || source.username || source.password || source.search || source.hash) {
      throw new AxiError("--source-url requires HTTPS without embedded credentials, query parameters, or fragments", "VALIDATION_ERROR",
        ["Use --service-endpoint <id> for authenticated imports"]);
    }
    const endpoint = flagString(args, "service-endpoint") === undefined ? undefined : required(args, "service-endpoint");
    body.parameters = { gitSource: { url: source.toString() }, ...(endpoint ? { serviceEndpointId: endpoint } : {}) };
  }
  let current: { id: string; name: string };
  try { current = await call({ path: `${path}/${encodeURIComponent(repo)}` }); } catch (error) {
    if (action === "delete" && error instanceof AxiError && error.code === "NOT_FOUND") {
      return { repo: "already absent (no-op)" };
    }
    throw error;
  }
  const resource = `${path}/${encodeURIComponent(current.id)}`;
  if (action === "delete") {
    // Resolve the selected name to an immutable id before deleting; no ETag/revision predicate is documented.
    await call({ method: "DELETE", path: resource });
    return { deleted: { id: current.id, name: current.name } };
  }
  if (action === "import") {
    const imported = await call({ method: "POST", path: `${resource}/importRequests`, body });
    return { import: { repo: current.id, id: imported.importRequestId, status: imported.status },
      help: [`Run \`${followUp(["api", `${resource}/importRequests/${imported.importRequestId}`])}\` to check import status`] };
  }
  const updated = await call({ method: "PATCH", path: resource, body });
  return { updated: { id: updated.id, name: updated.name, defaultBranch: updated.defaultBranch, disabled: updated.isDisabled },
    help: [`Run \`${followUp(["repo", "show", current.id])}\` to inspect the repository`] };
}
