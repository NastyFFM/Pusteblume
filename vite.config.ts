import { defineConfig, type Plugin } from "vite";
import { handleCardsRequest } from "./server/handlers";

/**
 * Dev-Plugin: bedient /api/cards lokal mit demselben Handler-Code, den die
 * Vercel Functions in ./api nutzen. Ohne Redis-Variablen landet alles in
 * .data/cards.json.
 */
function devApi(): Plugin {
  return {
    name: "pusteblume-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();

        let body = "";
        for await (const chunk of req) body += chunk;

        const result = await handleCardsRequest({
          method: req.method ?? "GET",
          pathname: url.pathname,
          body,
          origin: `http://${req.headers.host ?? "localhost:5173"}`,
        });
        res.statusCode = result.status;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(result.body));
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  server: { host: true, port: 5173 },
  build: { target: "es2022" },
});
