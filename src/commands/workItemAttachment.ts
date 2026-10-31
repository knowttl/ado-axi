import { createHash } from "node:crypto";
import { open, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagNumber, flagString, parseArgs } from "../lib/args.js";
import { request } from "../lib/client.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";
import { assertWritesEnabled } from "../lib/writes.js";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Item {
  rev: number;
  relations?: { rel: string; url: string; attributes?: { name?: string } }[];
}

function attachmentId(url: string): string {
  const id = new URL(url).pathname.split("/").pop() ?? "";
  if (!ATTACHMENT_ID.test(id)) throw new AxiError("invalid attachment URL id", "RESPONSE_INVALID");
  return id;
}

export async function workItemAttachment(action: string, args: ReturnType<typeof parseArgs>): Promise<Record<string, unknown>> {
  const attach = action === "attach";
  if (attach) assertWritesEnabled(true);
  assertKnownFlags(args, attach ? ["file", "comment", "if-rev"] : ["name", "out", "force"], `work-item ${action}`);
  const positionals = [...args.positionals];
  if (!attach && positionals.shift() !== "get") {
    throw new AxiError("Usage: ado-axi work-item attachment get <id> --name <file> [--out <path>] [--force]", "VALIDATION_ERROR");
  }
  const id = Number(positionals[0]);
  if (positionals.length !== 1 || !Number.isSafeInteger(id) || id < 1) {
    throw new AxiError("a positive work-item id is required", "VALIDATION_ERROR");
  }
  const file = flagString(args, attach ? "file" : "name");
  if (!file) throw new AxiError(`${attach ? "--file" : "--name"} is required`, "VALIDATION_ERROR");
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `work-item ${action}`);
  const itemPath = `_apis/wit/workitems/${id}`;

  if (attach) {
    const comment = flagString(args, "comment");
    const ifRev = flagNumber(args, "if-rev");
    if (ifRev !== undefined && (!Number.isSafeInteger(ifRev) || ifRev < 1)) {
      throw new AxiError("--if-rev must be a positive integer", "VALIDATION_ERROR");
    }
    let bytes: Buffer;
    try {
      const handle = await open(file, "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new AxiError("--file must name a regular file", "VALIDATION_ERROR");
        if (stat.size > MAX_ATTACHMENT_BYTES) throw new AxiError(`file exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`, "SIZE_LIMIT");
        const buffer = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
          const read = await handle.read(buffer, size, buffer.length - size, null);
          if (read.bytesRead === 0) break;
          size += read.bytesRead;
        }
        if (size > MAX_ATTACHMENT_BYTES) throw new AxiError(`file exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`, "SIZE_LIMIT");
        bytes = buffer.subarray(0, size);
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error instanceof AxiError) throw error;
      throw new AxiError("cannot read --file", "FILE_ERROR", ["Pass a readable local file path with --file"]);
    }
    const current = await request<Item>(profile, { path: itemPath, project });
    const rev = ifRev ?? current.rev;
    if (!Number.isSafeInteger(rev) || rev < 1 || current.rev !== rev) {
      throw new AxiError("work-item revision check failed before upload", "PRECONDITION_FAILED", [`Run \`ado-axi work-item get ${id}\` before retrying`]);
    }
    const name = basename(file);
    let uploaded: { id: string; url: string };
    try {
      uploaded = await request(profile, {
        method: "POST", path: "_apis/wit/attachments", project,
        query: { fileName: name }, body: bytes, contentType: "application/octet-stream",
      });
    } catch {
      throw new AxiError("attachment upload failed", "ATTACHMENT_UPLOAD_FAILED", ["Check access and connectivity before retrying"]);
    }
    let updated: Item;
    try {
      updated = await request<Item>(profile, {
        method: "PATCH", path: itemPath, project, contentType: "application/json-patch+json",
        body: [
          { op: "test", path: "/rev", value: rev },
          { op: "add", path: "/relations/-", value: {
            rel: "AttachedFile", url: uploaded.url,
            attributes: { ...(comment ? { comment } : {}) },
          } },
        ],
      });
    } catch {
      throw Object.assign(new AxiError("attachment uploaded but work-item relation failed", "ATTACHMENT_UNLINKED", [
        `Run \`ado-axi work-item get ${id}\` to read the current rev and relations`,
        `Reuse the uploaded URL in an AttachedFile relation with \`ado-axi api PATCH ${itemPath} --content-type json-patch --body '<json-patch>'\` and a /rev test; rerunning attach uploads another file`,
      ]), { attachment: { id: uploaded.id, url: uploaded.url, name, size: bytes.length } });
    }
    return { attachment: { id: uploaded.id, name, size: bytes.length, rev: updated.rev } };
  }

  const item = await request<Item>(profile, { path: itemPath, project, query: { $expand: "relations" } });
  const matches = (item.relations ?? []).filter((relation) => relation.rel === "AttachedFile" && relation.attributes?.name === file);
  if (matches.length === 0) throw new AxiError(`attachment '${file}' not found`, "NOT_FOUND", [`Run \`ado-axi work-item link list ${id} --full\` to see attachment names`]);
  if (matches.length > 1) throw new AxiError(`attachment name '${file}' is ambiguous`, "VALIDATION_ERROR", matches.map((relation) => `candidate: ${attachmentId(relation.url)} ${relation.url}`));
  if (basename(file) !== file || file === "." || file === ".." || file.includes("\\")) {
    throw new AxiError("attachment name must be a plain filename", "VALIDATION_ERROR");
  }
  const out = resolve(flagString(args, "out") ?? file);
  const attachment = attachmentId(matches[0]!.url);
  const bytes = await request<Buffer>(profile, {
    path: `_apis/wit/attachments/${attachment}`, project,
    accept: "application/octet-stream", binaryMaxBytes: MAX_ATTACHMENT_BYTES,
  });
  try {
    await writeFile(out, bytes, { flag: flagBool(args, "force") ? "w" : "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new AxiError("output already exists", "FILE_EXISTS", ["Choose --out <path> or pass --force to overwrite"]);
    }
    throw new AxiError("cannot write attachment output", "FILE_ERROR", ["Choose a writable --out <path>"]);
  }
  return { attachment: { id: attachment, name: file, path: out, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } };
}
