/**
 * Health endpoints.
 * GET /health      - aggregate status incl. Postgres + Redis
 * GET /health/live - liveness (always ok)
 * GET /health/ready - readiness (DB + cache reachable)
 */

import { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { postgresHealthCheck } from "../../db/postgres.js";

export interface HealthDeps {
  pool: Pool;
  redis: Redis;
}

const checkPostgres = async (pool: Pool): Promise<string> => {
  const client = await pool.connect();
  try {
    await postgresHealthCheck(client);
    return "ok";
  } catch {
    return "fail";
  } finally {
    client.release();
  }
};

const checkRedis = async (redis: Redis): Promise<string> => {
  try {
    await redis.ping();
    return "ok";
  } catch {
    return "fail";
  }
};

export const registerHealthRoutes = (app: FastifyInstance, deps: HealthDeps) => {
  app.get("/health", async (_req, reply) => {
    const [postgres, redis] = await Promise.all([checkPostgres(deps.pool), checkRedis(deps.redis)]);
    const status = postgres === "ok" && redis === "ok" ? "ok" : "degraded";
    return reply.status(status === "ok" ? 200 : 503).send({
      status,
      checks: { postgres, redis },
      time: new Date().toISOString(),
    });
  });

  app.get("/health/live", () => ({ status: "ok" }));

  app.get("/health/ready", async (_req, reply) => {
    const [postgres, redis] = await Promise.all([checkPostgres(deps.pool), checkRedis(deps.redis)]);
    const status = postgres === "ok" && redis === "ok" ? "ok" : "degraded";
    return reply.status(status === "ok" ? 200 : 503).send({
      status,
      checks: { postgres, redis },
      time: new Date().toISOString(),
    });
  });
};
