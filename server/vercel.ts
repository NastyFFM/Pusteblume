import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiRequest, ApiResponse } from "./handlers";

/** Adapter: Node-Request einer Vercel Function -> plattformneutraler Handler. */
export async function runVercel(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (r: ApiRequest) => Promise<ApiResponse>,
) {
  // Vercel liest den Body bereits vorab und legt ihn als req.body ab (String oder geparstes Objekt).
  // Nur wenn das fehlt, den Stream selbst lesen.
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  let body = "";
  if (typeof pre === "string") body = pre;
  else if (pre && typeof pre === "object") body = JSON.stringify(pre);
  else if (pre === undefined && !req.readableEnded) {
    for await (const chunk of req) body += chunk;
  }

  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const result = await handler({ method: req.method ?? "GET", pathname: url.pathname, body, origin: `${proto}://${host}` });
  res.statusCode = result.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", result.status === 200 ? "public, max-age=300" : "no-store");
  res.end(JSON.stringify(result.body));
}
