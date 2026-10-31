globalThis.fetch = async () => {
  process.exitCode = 99;
  process.on("exit", () => { process.exitCode = 99; });
  throw new Error("Unexpected network request");
};
