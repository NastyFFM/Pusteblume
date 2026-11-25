import type { IncomingMessage, ServerResponse } from "node:http";

/** Minimale Function ohne Importe: zeigt, ob Vercel Functions in diesem Projekt überhaupt laufen. */
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, node: process.version, redis: Boolean(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) }));
}
