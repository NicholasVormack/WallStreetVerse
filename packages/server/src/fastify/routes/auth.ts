/**
 * Auth endpoints (Phase 1 stub).
 *
 * Issues an opaque dev session token. Phase 2 replaces this with signed JWTs
 * and persistent sessions backed by Postgres.
 */

import { FastifyInstance } from "fastify";

export interface AuthDeps {}

export const registerAuthRoutes = (app: FastifyInstance, _deps: AuthDeps) => {
  app.post<{ Body: { zoneId?: string } }>("/auth/token", async (req) => {
    const token = `ws_dev_${crypto.randomUUID()}`;
    return {
      token,
      zoneId: req.body.zoneId ?? null,
      expiresIn: 3600,
      issuedAt: new Date().toISOString(),
    };
  });

  app.get("/auth/verify", async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ valid: false, reason: "missing bearer token" });
    }
    return { valid: true, token: auth.slice(7) };
  });
};
