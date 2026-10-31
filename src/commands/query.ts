import { AxiError } from "axi-sdk-js";
import { assertKnownFlags, parseArgs } from "../lib/args.js";
import { request } from "../lib/client.js";
import { requireProject } from "../lib/config.js";
import { profileFromArgs } from "../lib/context.js";
import { listWorkItems } from "./workItem.js";

export async function queryCommand(argv: string[]): Promise<Record<string, unknown>> {
  const args = parseArgs(argv);
  assertKnownFlags(args, ["limit"], "query run");
  const [sub, selector, ...extra] = args.positionals;
  if (sub !== "run" || !selector || extra.length > 0) {
    throw new AxiError("a saved query id or path is required", "VALIDATION_ERROR", [
      'Usage: ado-axi query run <id|"Shared Queries/path"> [--limit 30] [--fields id,title,state]',
    ]);
  }
  let id = selector;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector)) {
    const profile = profileFromArgs(args);
    const query = await request<{ id: string; isFolder?: boolean }>(profile, {
      path: `_apis/wit/queries/${selector.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")}`,
      project: requireProject(profile, "query run"),
    });
    if (query.isFolder) throw new AxiError("the saved query path is a folder", "VALIDATION_ERROR");
    id = query.id;
  }
  return listWorkItems({ ...args, positionals: [] }, id);
}
