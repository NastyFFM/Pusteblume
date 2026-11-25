import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiRequest, ApiResponse } from "./handlers";

/** Adapter: Node-Request einer Vercel Function -> plattformneutraler Handler. */
export async function runVercel(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (r: ApiRequest) => Promise<ApiResponse>,
) {
  let body = "";
  for await (const chunk of req) body += chunk;

  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const result = await handler({ method: req.method ?? "GET", pathname: url.pathname, body, origin: `${proto}://${host}` });
  res.statusCode = result.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", result.status === 200 ? "public, max-age=300" : "no-store");
  res.end(JSON.stringify(result.body));
}
