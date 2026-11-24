/**
 * Redis client (ioredis).
 *
 * Phase 1 use case: short-lived zone transfer tokens. A token is written with a
 * TTL when a player enters a portal, consumed atomically when the target room
 * validates it, and never derivable from client data.
 */

import Redis from "ioredis";

let client: Redis | null = null;

export const createRedisClient = (url: string): Redis => {
  if (client) return client;
  client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
  client.on("error", (err) => console.error("[redis] error", err));
  return client;
};

export const getRedisClient = (): Redis => {
  if (!client) throw new Error("Redis client not initialized. Call createRedisClient first.");
  return client;
};

/** Namespace for transfer tokens to avoid colliding with other keys. */
export const TRANSFER_TOKEN_PREFIX = "ws:transfer:";

export const transferTokenKey = (token: string): string => `${TRANSFER_TOKEN_PREFIX}${token}`;
