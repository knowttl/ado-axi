import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sync as spawnSync } from "cross-spawn";

const prefix = mkdtempSync(join(tmpdir(), "ado-axi-install-"));
const env = {
  PATH: process.env.PATH,
  HOME: prefix,
  USERPROFILE: prefix,
  SystemRoot: process.env.SystemRoot,
  npm_config_userconfig: join(prefix, ".npmrc"),
  npm_config_globalconfig: join(prefix, "global.npmrc"),
};

try {
  const install = spawnSync("npm", ["install", "--global", "--prefix", prefix, "--registry=https://registry.npmjs.org/", "@knowttl/ado-axi"], { env, stdio: "inherit" });
  if (install.error) throw install.error;
  if (install.status !== 0) throw new Error(`npm install failed with status ${install.status}`);
  const executable = process.platform === "win32" ? join(prefix, "ado-axi.cmd") : join(prefix, "bin", "ado-axi");
  const help = spawnSync(executable, ["--help"], { env, encoding: "utf8" });
  if (help.error) throw help.error;
  if (help.status !== 0 || !help.stdout.includes("ado-axi")) throw new Error("Installed executable did not print ado-axi help");
  process.stdout.write(help.stdout);
} finally {
  rmSync(prefix, { recursive: true, force: true });
}
