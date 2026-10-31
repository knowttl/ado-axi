import { configPath, resolveProfile, type ResolvedProfile } from "./config.js";
import { flagString, type ParsedArgs } from "./args.js";

export function profileFromArgs(args: ParsedArgs): ResolvedProfile {
  return resolveProfile({
    profile: flagString(args, "profile"),
    org: flagString(args, "org"),
    project: flagString(args, "project"),
    config: flagString(args, "config"),
  });
}

/** Render executable follow-up commands without losing profile authentication or shell quoting. */
export function commandHints(profile: ResolvedProfile, args: ParsedArgs): (command: string[]) => string {
  const selectors = [`--org=${profile.org}`];
  if (profile.project) selectors.push(`--project=${profile.project}`);
  const selectedConfig = profile.configPath ?? flagString(args, "config");
  if (selectedConfig) selectors.push(`--config=${configPath(selectedConfig)}`);
  if (profile.configPath) selectors.push(`--profile=${profile.name}`);
  return (command) => ["ado-axi", ...command, ...selectors].map((value) =>
    /^[a-zA-Z0-9_./:=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`).join(" ");
}

export function subcommandOf(
  args: ParsedArgs,
  known: readonly string[],
  command: string,
  fallback?: string,
): string {
  const sub = args.positionals[0];
  if (!sub) {
    if (fallback) return fallback;
    throw new Error(`missing subcommand for \`${command}\` (expected: ${known.join(" | ")})`);
  }
  return sub;
}
