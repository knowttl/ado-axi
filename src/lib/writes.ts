import { AxiError } from "axi-sdk-js";
import { parseArgs } from "./args.js";

export function assertWritesEnabled(write: boolean): void {
  if (write && process.env.ADO_AXI_WRITES !== "1") {
    throw new AxiError("writes are disabled", "WRITES_DISABLED", [
      "Set ADO_AXI_WRITES=1 to enable write commands",
    ]);
  }
}

export function isWriteCommand(command: string, argv: string[]): boolean {
  const [action, operation] = parseArgs(argv).positionals;
  switch (command) {
    case "work-item":
      return ["create", "update", "delete", "comment"].includes(action ?? "")
        || (["link", "links"].includes(action ?? "") && ["add", "remove"].includes(operation ?? ""));
    case "pr":
      return ["create", "update", "complete", "abandon", "approve", "vote", "comment"].includes(action ?? "")
        || (action === "reviewer" && ["add", "remove"].includes(operation ?? ""))
        || (action === "thread" && ["resolve", "reopen", "reply"].includes(operation ?? ""));
    case "pipeline":
      return action === "run";
    case "ref":
      return action === "create" || action === "delete";
    case "config":
      return action === "init" || action === "add";
    default:
      return false;
  }
}
