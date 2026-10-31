import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagString, parseArgs } from "../lib/args.js";
import { assertAuditPositionals, auditLimit, auditOutput, auditRequest, type AuditRecord } from "../lib/audit.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";

const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;

interface Artifact {
  id: number;
  name: string;
  resource: { type: string; properties?: { artifactsize?: string } };
}

export async function pipelineArtifactCommand(argv: string[]): Promise<AuditRecord> {
  const args = parseArgs(argv);
  const operation = args.positionals.shift();
  if (operation !== "list" && operation !== "download") {
    throw new AxiError("Use pipeline runs artifact list|download <run-id>", "VALIDATION_ERROR");
  }
  assertKnownFlags(args, operation === "list" ? ["limit"] : ["name", "out", "force"], `pipeline runs artifact ${operation}`);
  assertAuditPositionals(args, 1);
  const run = Number(args.positionals[0]);
  if (!Number.isSafeInteger(run) || run < 1) throw new AxiError("a positive run id is required", "VALIDATION_ERROR");
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `pipeline runs artifact ${operation}`);
  const path = `_apis/build/builds/${run}/artifacts`;
  if (operation === "list") {
    const limit = auditLimit(args);
    const result = await auditRequest<{ value: Artifact[] }>(profile, { path, project });
    // Artifact resource URLs/data can contain signed download tokens. Do not expose them, even with --full/--fields.
    const rows = result.value.slice(0, limit).map((artifact) => ({
      id: artifact.id, name: artifact.name, type: artifact.resource.type,
      bytes: artifact.resource.properties?.artifactsize ?? "unknown",
    }));
    const output = auditOutput("artifacts", { rows, total: result.value.length }, args, ["id", "name", "type", "bytes"]);
    return { run, ...output, help: [
      ...((output.help ?? []) as string[]),
      `Run \`ado-axi pipeline runs artifact download ${run} --name <name> --out <path>\` to save an artifact ZIP`,
    ] };
  }
  const name = flagString(args, "name");
  const destination = flagString(args, "out");
  if (!name?.trim() || !destination?.trim()) {
    throw new AxiError("artifact download requires --name <name> and --out <path>", "VALIDATION_ERROR");
  }
  const out = resolve(destination);
  // Address the artifact through our selected org/project, never a response-supplied signed URL.
  let bytes: Buffer;
  try {
    bytes = await auditRequest<Buffer>(profile, {
      path, project, query: { artifactName: name, $format: "zip" },
      accept: "application/zip", binaryMaxBytes: MAX_ARTIFACT_BYTES,
    });
  } catch (error) {
    if (error instanceof AxiError && error.code === "SIZE_LIMIT") {
      throw new AxiError(`artifact exceeds the ${MAX_ARTIFACT_BYTES} byte download limit`, "SIZE_LIMIT");
    }
    throw error;
  }
  try {
    await writeFile(out, bytes, { flag: flagBool(args, "force") ? "w" : "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new AxiError("output already exists", "FILE_EXISTS", ["Choose another --out <path> or pass --force to overwrite"]);
    }
    throw new AxiError("cannot write artifact output", "FILE_ERROR", ["Choose a writable --out <path>"]);
  }
  return { artifact: { run, name, path: out, bytes: bytes.length, "max-bytes": MAX_ARTIFACT_BYTES } };
}
