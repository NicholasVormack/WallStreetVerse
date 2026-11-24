/**
 * Fastify application serving REST/health/auth endpoints.
 *
 * Decoupled from Colyseus: health checks verify Postgres + Redis connectivity,
 * and auth issues Phase-1 stub session tokens. No game state lives here.
 *
 * CORS is set manually so the Vite dev client (localhost:5173) can reach the
 * API (localhost:3001) during development.
 */

import Fastify from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";

export interface AppDependencies {
  pool: Pool;
  redis: Redis;
}

export const createApp = async (deps: AppDependencies) => {
  const app = Fastify({ logger: true });

  app.addHook("onRequest", (req, reply, done) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
    reply.header("access-control-allow-headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      reply.status(204).send();
    }
    done();
  });

  // Dependencies are closed over by route modules; no request decoration needed.
  require("./routes/health.js").registerHealthRoutes(app, deps);
  require("./routes/auth.js").registerAuthRoutes(app, deps);

  return app;
};
