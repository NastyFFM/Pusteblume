import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCardsRequest } from "../server/handlers";
import { runVercel } from "../server/vercel";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return runVercel(req, res, handleCardsRequest);
}
