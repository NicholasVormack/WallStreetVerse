/**
 * PostgreSQL connection pool (node-postgres).
 *
 * Phase 1 uses this for health checks and to establish the connection to the
 * database that Phase 2 will use for persistence. No business logic touches it
 * yet.
 */

import { Pool } from "pg";
import type { PoolClient } from "pg";

let pool: Pool | null = null;

export const createPostgresPool = (connectionString: string): Pool => {
  if (pool) return pool;
  pool = new Pool({ connectionString });
  pool.on("error", (err) => {
    console.error("[postgres] unexpected idle client error", err);
  });
  return pool;
};

export const getPostgresPool = (): Pool => {
  if (!pool) throw new Error("Postgres pool not initialized. Call createPostgresPool first.");
  return pool;
};

export const postgresHealthCheck = async (client: PoolClient): Promise<void> => {
  await client.query("SELECT 1");
};
