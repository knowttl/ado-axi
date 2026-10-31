import { AxiError } from "axi-sdk-js";
import { flagBool, flagList, flagNumber, flagString, type ParsedArgs } from "./args.js";
import { request, type RequestOptions } from "./client.js";
import type { ResolvedProfile } from "./config.js";
import { pickFields, truncate } from "./format.js";

export type AuditRecord = Record<string, unknown>;

export function assertAuditPositionals(args: ParsedArgs, maximum: number): void {
  if (args.positionals.length > maximum) {
    throw new AxiError("unexpected positional arguments", "VALIDATION_ERROR", ["Use --help for this command's arguments"]);
  }
}

export function auditLimit(args: ParsedArgs): number {
  const limit = flagNumber(args, "limit") ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new AxiError("--limit must be a positive integer", "VALIDATION_ERROR");
  }
  return limit;
}

export function auditId(args: ParsedArgs, flag = "id", index = 0): string {
  assertAuditPositionals(args, index + 1);
  const id = flagString(args, flag) ?? args.positionals[index];
  if (!id) throw new AxiError(`--${flag} or an identifier is required`, "VALIDATION_ERROR");
  return encodeURIComponent(id);
}

/** Untrusted API errors can echo credentials. Audit reads expose only the error category. */
export async function auditRequest<T>(profile: ResolvedProfile, options: RequestOptions): Promise<T> {
  try {
    return await request<T>(profile, { ...options, method: "GET" });
  } catch (error) {
    const code = error instanceof AxiError ? error.code : "API_ERROR";
    throw new AxiError("audit read failed; response details withheld to protect secrets", code, [
      "Check the selected organization, project, identifier, and read permissions",
    ]);
  }
}

/** Count every page while retaining at most the requested number of records. */
export async function auditList(
  profile: ResolvedProfile,
  options: RequestOptions,
  limit: number,
  collection = "value",
): Promise<{ rows: AuditRecord[]; total: number }> {
  const rows: AuditRecord[] = [];
  let total = 0;
  let continuation: string | undefined;
  const seen = new Set<string>();
  do {
    let headerToken: string | undefined;
    const response = await auditRequest<AuditRecord | AuditRecord[]>(profile, {
      ...options,
      query: { ...options.query, continuationToken: continuation },
      onHeaders: (headers) => { headerToken = headers.get("x-ms-continuationtoken") || undefined; },
    });
    const page = (Array.isArray(response) ? response : response[collection] ?? []) as AuditRecord[];
    total += page.length;
    rows.push(...page.slice(0, Math.max(0, limit - rows.length)));
    continuation = headerToken || (Array.isArray(response) ? undefined : response.continuationToken as string | undefined);
    if (continuation && seen.has(continuation)) {
      throw new AxiError("audit pagination did not advance; no partial result returned", "RESPONSE_INVALID");
    }
    if (continuation) seen.add(continuation);
  } while (continuation);
  return { rows, total };
}

/** Mask before selecting fields or expanding details, including nested secret variables. */
export function safeAudit(value: unknown, args: ParsedArgs): unknown {
  const limit = auditLimit(args);
  const full = flagBool(args, "full");
  function safe(item: unknown): unknown {
    if (typeof item === "string") return full ? item : truncate(item, 1200).text;
    if (Array.isArray(item)) {
      const items = item.slice(0, limit).map(safe);
      return item.length > limit ? { items, total: item.length, omitted: item.length - limit } : items;
    }
    if (!item || typeof item !== "object") return item;
    const record = item as AuditRecord;
    const out: AuditRecord = {};
    for (const [key, child] of Object.entries(record)) {
      if (/authorization|credential|password|secret|accesstoken|refreshtoken|privatekey|certificate|providerdata|capabilities/i.test(key) && key !== "isSecret") {
        out[key] = "***";
      } else if (key === "value" && record.isSecret === true) {
        out[key] = "***";
      } else if (key === "variables" && child && typeof child === "object") {
        const variables = Object.entries(child);
        out[key] = variables.slice(0, limit).map(([name, variable]) => ({ name, ...safe(variable) as AuditRecord }));
        out["variables-total"] = variables.length;
        out["variables-omitted"] = Math.max(0, variables.length - limit);
      } else if (key === "acesDictionary" && child && typeof child === "object") {
        const entries = Object.entries(child);
        out[key] = Object.fromEntries(entries.slice(0, limit).map(([descriptor, ace]) => [descriptor, safe(ace)]));
        out["aces-total"] = entries.length;
        out["aces-omitted"] = Math.max(0, entries.length - limit);
      } else {
        out[key] = safe(child);
      }
    }
    return out;
  }
  return safe(value);
}

export function auditOutput(
  name: string,
  result: { rows: AuditRecord[]; total: number },
  args: ParsedArgs,
  columns: readonly string[],
): AuditRecord {
  const safe = result.rows.map((row) => safeAudit(row, args) as AuditRecord);
  const selected = flagList(args, "fields");
  const fields = selected?.length ? selected : (flagBool(args, "full") ? undefined : [...columns]);
  const rows = pickFields(safe, fields);
  for (const [index, row] of rows.entries()) {
    const record = safe[index]!;
    for (const [collection, prefix] of [["acesDictionary", "aces"], ["variables", "variables"]] as const) {
      if (!(collection in row)) continue;
      for (const suffix of ["total", "omitted"]) {
        const key = `${prefix}-${suffix}`;
        if (key in record) row[key] = record[key];
      }
    }
  }
  const omitted = result.total - rows.length;
  return {
    count: `${rows.length} of ${result.total} ${name}`,
    omitted,
    [name]: rows,
    ...(omitted > 0 ? { help: [`Pass --limit ${result.total} to include all ${name}; --full expands fields, not the limit`] } : {}),
  };
}
