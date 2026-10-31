// TD-062 subprocess fixture: synthetic responses only, with no network fallback.
const id = "11111111-2222-4333-8444-555555555555";
const url = `https://dev.azure.com/synthetic-org/SyntheticProject/_apis/wit/attachments/${id}`;
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

globalThis.fetch = async (input, options) => {
  const path = new URL(input as string).pathname;
  if (path.endsWith("/workitems/42") && options!.method === "GET") {
    return json({ id: 42, rev: 7, relations: [{ rel: "AttachedFile", url, attributes: { name: "evidence.bin" } }] });
  }
  if (path.endsWith("/attachments") && options!.method === "POST") return json({ id, url });
  if (path.endsWith("/workitems/42") && options!.method === "PATCH") {
    return json({ message: "synthetic private response body" }, 412);
  }
  if (path.endsWith(`/attachments/${id}`) && options!.method === "GET") {
    return new Response(new Uint8Array([0, 255, 128, 13, 10, 65]));
  }
  throw new Error("unexpected synthetic attachment request");
};
