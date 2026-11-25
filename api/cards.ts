import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCardsRequest } from "../server/handlers";
import { runVercel } from "../server/vercel";

// Hinweis: Die Functions werden als CommonJS gebaut (kein "type": "module" in package.json),
// damit Vercel die relativen Importe ohne Dateiendung auflösen kann.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return runVercel(req, res, handleCardsRequest);
}
