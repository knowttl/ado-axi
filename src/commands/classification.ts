import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, flagBool, flagList, flagNumber, parseArgs } from "../lib/args.js";
import { request } from "../lib/client.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";
import { countLine, pickFields } from "../lib/format.js";

interface ClassificationNode {
  id: number;
  name: string;
  hasChildren: boolean;
  children?: ClassificationNode[];
  attributes?: { startDate?: string; finishDate?: string };
}

export async function classificationCommand(kind: "area" | "iteration", argv: string[]): Promise<Record<string, unknown>> {
  const args = parseArgs(argv);
  assertKnownFlags(args, ["limit", "depth"], `${kind} list`);
  if ((args.positionals[0] ?? "list") !== "list" || args.positionals.length > 1) {
    throw new AxiError(`Usage: ado-axi ${kind} list [--depth 10] [--limit 50] [--full]`, "VALIDATION_ERROR");
  }
  const limit = flagNumber(args, "limit") ?? 50;
  const depth = flagNumber(args, "depth") ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(depth) || depth < 0) {
    throw new AxiError("--limit must be a positive integer and --depth a nonnegative integer", "VALIDATION_ERROR");
  }
  const profile = profileFromArgs(args);
  const project = requireProject(profile, `${kind} list`);
  const root = await request<ClassificationNode>(profile, {
    path: `_apis/wit/classificationnodes/${kind === "area" ? "areas" : "iterations"}`,
    project,
    query: { $depth: depth },
  });
  const rows: Array<Record<string, unknown>> = [];
  let deeper = false;
  function visit(node: ClassificationNode, parent: string): void {
    const path = parent ? `${parent}\\${node.name}` : node.name;
    rows.push({ id: node.id, path, ...(kind === "iteration" ? {
      start: node.attributes?.startDate?.slice(0, 10) ?? "",
      finish: node.attributes?.finishDate?.slice(0, 10) ?? "",
    } : {}) });
    if (node.hasChildren && !node.children?.length) deeper = true;
    for (const child of node.children ?? []) visit(child, path);
  }
  visit(root, "");
  const shown = flagBool(args, "full") ? rows : rows.slice(0, limit);
  const help: string[] = [];
  if (shown.length < rows.length) help.push(`Run \`ado-axi ${kind} list --depth ${depth} --full\` for all paths at this depth`);
  if (deeper) help.push(`Run \`ado-axi ${kind} list --depth ${depth + 1}\` to include deeper paths`);
  return {
    project,
    depth,
    count: `${countLine(shown.length, rows.length, `${kind} paths`)} within requested depth`,
    [`${kind}s`]: pickFields(shown, flagList(args, "fields")),
    "left-out": rows.length - shown.length,
    ...(help.length ? { help } : {}),
  };
}
