import { readFile } from "node:fs/promises";
import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditLimit, auditOutput, type AuditRecord } from "../lib/audit.js";
import { request, type RequestOptions } from "../lib/client.js";
import { requireProject } from "../lib/config.js";
import { commandHints, profileFromArgs } from "../lib/context.js";
import { truncate } from "../lib/format.js";

interface Wiki { id: string; name: string; type: string; repositoryId: string; mappedPath?: string }
interface WikiPage { id: number; path: string; content?: string }

export async function wikiCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const action = args.positionals.shift();
  const operation = action === "page" ? args.positionals.shift() : undefined;
  if (action !== "list" && !(action === "page" && ["get", "create", "update"].includes(operation ?? ""))) {
    throw new AxiError("Use wiki list or wiki page get|create|update", "VALIDATION_ERROR");
  }
  const write = operation === "create" || operation === "update";
  assertKnownFlags(args, action === "list" ? ["config", "limit"] : ["config", "wiki", "path",
    ...(write ? ["content", "file", ...(operation === "update" ? ["if-match"] : [])] : [])], `wiki ${action} ${operation ?? ""}`.trim());
  assertAuditPositionals(args, 0);
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `wiki ${action}`);
  const hint = commandHints(profile, args);
  async function call<T>(options: RequestOptions): Promise<T> {
    try { return await request<T>(profile, { ...options, project }); } catch (error) {
      throw new AxiError("wiki request failed; response details withheld to protect secrets",
        error instanceof AxiError ? error.code : "API_ERROR", ["Check the selected project, wiki, page path, permissions, and latest page ETag"]);
    }
  }
  if (action === "list") {
    const limit = auditLimit(args);
    const result = await call<{ value: Wiki[] }>({ path: "_apis/wiki/wikis" });
    const output = auditOutput("wikis", { rows: result.value.slice(0, limit).map((wiki) => ({
      id: wiki.id, name: wiki.name, type: wiki.type, repositoryId: wiki.repositoryId, mappedPath: wiki.mappedPath ?? "",
    })), total: result.value.length }, args, ["id", "name", "type"]);
    return { ...output, help: [...((output.help ?? []) as string[]),
      `Run \`${hint(["wiki", "page", "get", "--wiki", "<wiki-id>", "--path", "/<page>"])}\` to read a page`] };
  }
  const wiki = flagString(args, "wiki");
  const requestedPath = flagString(args, "path");
  if (!wiki?.trim() || !requestedPath?.trim()) throw new AxiError("--wiki and --path are required", "VALIDATION_ERROR");
  const path = requestedPath.startsWith("/") ? requestedPath : `/${requestedPath}`;
  const resource = `_apis/wiki/wikis/${encodeURIComponent(wiki)}/pages`;
  const pageCommand = ["wiki", "page", "get", "--wiki", wiki, "--path", path];
  let content = flagString(args, "content");
  const file = flagString(args, "file");
  const expected = flagString(args, "if-match");
  if (write) {
    if ((content === undefined) === (file === undefined)) {
      throw new AxiError("supply exactly one of --content <text> or --file <path>", "VALIDATION_ERROR");
    }
    if (expected !== undefined && !expected.trim()) throw new AxiError("--if-match requires a nonempty ETag", "VALIDATION_ERROR");
    if (file !== undefined) {
      try { content = await readFile(file, "utf8"); } catch {
        throw new AxiError("cannot read wiki content file", "FILE_ERROR", ["Pass a readable UTF-8 Markdown file with --file"]);
      }
    }
  }
  let etag: string | undefined;
  let page: WikiPage | undefined;
  try {
    page = await call<WikiPage>({ path: resource, query: { path, includeContent: true },
      onHeaders: (headers) => { etag = headers.get("etag") ?? undefined; } });
  } catch (error) {
    if (!(operation === "create" && error instanceof AxiError && error.code === "NOT_FOUND")) throw error;
  }
  if (operation === "get") {
    const original = page!.content ?? "";
    // Markdown can include credential-bearing or signed links. Mask those in output, including --full.
    const urlEntities: Record<string, string> = { amp: "&", AMP: "&", quest: "?", equals: "=", commat: "@",
      colon: ":", sol: "/", lowbar: "_", UnderBar: "_", hyphen: "-", dash: "-" };
    const safe = original.replace(/https?:\/\/[^\s<>"]+/gi, (url) => {
      const decoded = url.replace(/&#([xX][\da-fA-F]{1,6}|\d{1,7});|&([a-zA-Z]+);/g,
        (entity, numeric: string | undefined, named: string | undefined) => {
          if (named) return urlEntities[named] ?? entity;
          const code = /^[xX]/.test(numeric!) ? parseInt(numeric!.slice(1), 16) : Number(numeric);
          return code <= 0x7f ? String.fromCharCode(code) : entity;
        });
      return /\/\/[^/]*@|[?&](?:sig|token|access_token|pat|api[-_]?key|password|sas)=/i.test(decoded)
        ? `[redacted URL]${url.match(/[)\]]+$/)?.[0] ?? ""}` : url;
    });
    const preview = truncate(safe, flagBool(args, "full") ? Number.MAX_SAFE_INTEGER : 4000);
    return { page: { id: page!.id, path: page!.path, etag: etag ?? "", chars: original.length, content: preview.text },
      ...(preview.truncated ? { help: [`Run \`${hint([...pageCommand, "--full"])}\` for complete page content`] } : {}) };
  }
  if (operation === "create" && page) {
    throw new AxiError("page already exists; creation will not overwrite it", "PRECONDITION_FAILED", [
      `Run \`${hint(pageCommand)}\` before using wiki page update`,
    ]);
  }
  if (operation === "update" && (!etag || (expected !== undefined && expected !== etag))) {
    throw new AxiError("page ETag precondition failed; update refused", "PRECONDITION_FAILED", [
      `Run \`${hint(pageCommand)}\` to read the current page and ETag`,
    ]);
  }
  let updatedEtag: string | undefined;
  const updated = await call<WikiPage>({ method: "PUT", path: resource, query: { path }, body: { content },
    ...(operation === "update" ? { ifMatch: etag } : {}),
    onHeaders: (headers) => { updatedEtag = headers.get("etag") ?? undefined; } });
  return { [operation === "create" ? "created" : "updated"]: { id: updated.id, path: updated.path, etag: updatedEtag ?? "" },
    help: [`Run \`${hint(pageCommand)}\` to inspect the page`] };
}
