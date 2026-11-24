/**
 * WallStreetVerse Phase 1 server entrypoint.
 *
 * Boots:
 *   - PostgreSQL pool (health + Phase 2 persistence)
 *   - Redis client (zone transfer tokens)
 *   - Fastify on :3001  (REST /health, /auth)
 *   - Colyseus on :2567 (WebSocket authoritative zone rooms)
 */

import { createPostgresPool } from "./db/postgres.js";
import { createRedisClient } from "./db/redis.js";
import { createApp } from "./fastify/app.js";
import { createColyseusServer } from "./colyseus/server.js";
import { HTTP_PORT } from "@wallstreet/shared";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://ws_dev:ws_dev_password@localhost:5432/wallstreet_verse";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const start = async (): Promise<void> => {
  const pool = createPostgresPool(DATABASE_URL);
  const redis = createRedisClient(REDIS_URL);
  await redis.connect();

  const app = await createApp({ pool, redis });
  await app.listen({ port: HTTP_PORT, host: "0.0.0.0" });
  console.log(`[fastify] listening on http://0.0.0.0:${HTTP_PORT}`);

  const { wss } = createColyseusServer();

  const shutdown = async (signal: string) => {
    console.log(`[server] shutting down on ${signal}`);
    try {
      if (wss && typeof wss.close === "function") {
        await new Promise<void>((resolve) => wss.close(() => resolve()));
      }
    } catch {
      // ignore close errors
    }
    await app.close();
    await pool.end();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
  console.error("[server] fatal startup error", err);
  process.exit(1);
});
