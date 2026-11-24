/**
 * Redis-backed zone transfer tokens.
 *
 * Tokens are short-lived, server-generated capabilities that authorize a zone
 * handoff. A client can never forge a token; it must receive one from the
 * server after entering a portal on the server side.
 */

import { getRedisClient, transferTokenKey } from "../../db/redis.js";
import type { Vec2 } from "@wallstreet/shared";
import type { ZoneId } from "@wallstreet/shared";
import type { EntityState } from "@wallstreet/shared";

export interface TransferTokenPayload {
  readonly targetZone: ZoneId;
  readonly sessionId: string;
  readonly spawn: Vec2;
  /** Authoritative entity state to restore in the target zone. */
  readonly entityState: EntityState;
  readonly issuedAt: number;
}

const redis = (): ReturnType<typeof getRedisClient> => getRedisClient();

/**
 * Issue a transfer token with a TTL. Returns the opaque token string.
 */
export const issueTransferToken = async (payload: TransferTokenPayload, ttlSeconds: number = 30): Promise<string> => {
  const token = `${payload.targetZone}:${payload.sessionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  await redis().setex(transferTokenKey(token), ttlSeconds, JSON.stringify(payload));
  return token;
};

/**
 * Atomically consume and return a transfer token payload. Returns null when
 * the token is missing, expired, or already consumed.
 */
export const consumeTransferToken = async (token: string): Promise<TransferTokenPayload | null> => {
  const raw = await redis().getdel(transferTokenKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TransferTokenPayload;
  } catch {
    return null;
  }
};
