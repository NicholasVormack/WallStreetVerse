/**
 * Zod runtime validation schemas for network payloads.
 * The server validates every client->server message against these schemas
 * before touching the simulation. The client may use them to validate
 * inbound messages defensively.
 */

import { z } from "zod";
import type { ZoneId } from "../constants.js";

export const movementInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  dx: z.number().finite().min(-1).max(1),
  dy: z.number().finite().min(-1).max(1),
  dt: z.number().finite().nonnegative().max(1),
  timestamp: z.number().finite().nonnegative(),
});

export type MovementInputSchema = z.infer<typeof movementInputSchema>;

export const inputIntentSchema = z.object({
  type: z.literal("movement"),
  input: movementInputSchema,
});

export type InputIntentSchema = z.infer<typeof inputIntentSchema>;

export const pingSchema = z.object({
  timestamp: z.number().finite().nonnegative(),
});

export const joinRequestSchema = z.object({
  zoneId: z.string().refine((v): v is ZoneId => ["wallstreet", "cryptocorner", "lounge"].includes(v), {
    message: "invalid zoneId",
  }),
  token: z.string().optional(),
});

export type JoinRequestSchema = z.infer<typeof joinRequestSchema>;

export const snapshotEntitySchema = z.object({
  sessionId: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  tick: z.number().int().nonnegative(),
  zoneId: z.string(),
});

export type SnapshotEntitySchema = z.infer<typeof snapshotEntitySchema>;

export const snapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  timestamp: z.number().finite().nonnegative(),
  entities: z.array(snapshotEntitySchema),
});

export type SnapshotSchema = z.infer<typeof snapshotSchema>;

export const transferSchema = z.object({
  targetZone: z.string().refine((v): v is ZoneId => ["wallstreet", "cryptocorner", "lounge"].includes(v), {
    message: "invalid targetZone",
  }),
  spawn: z.object({ x: z.number().finite(), y: z.number().finite() }),
  sessionId: z.string(),
});

export type TransferSchema = z.infer<typeof transferSchema>;

export type ValidatedMovementInput = MovementInputSchema;
