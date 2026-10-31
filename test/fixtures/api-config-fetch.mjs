globalThis.fetch = async (input, options) => new Response(JSON.stringify({
  url: String(input),
  method: options.method,
  authorization: new Headers(options.headers).get("authorization"),
}), { status: 200, headers: { "content-type": "application/json" } });
