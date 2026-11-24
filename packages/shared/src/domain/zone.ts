/**
 * Zone and portal definitions.
 *
 * Portals are axis-aligned bounding boxes. When a player's collision circle
 * intersects a portal on the server, a zone transfer is initiated through a
 * Redis-backed transfer token (never trusted from the client).
 */

import type { AABB, Vec2 } from "../domain/collision.js";
import type { ZoneId } from "../constants.js";

export interface Portal {
  readonly id: string;
  readonly bounds: AABB;
  /** Zone the portal leads to. */
  readonly targetZone: ZoneId;
  /** Optional spawn position within the target zone. */
  readonly spawn: Vec2;
}

export interface ZoneConfig {
  readonly zoneId: ZoneId;
  /** Display name for debug overlays. */
  readonly name: string;
  /** Static collision geometry (pillars, booths, bars, walls). */
  readonly obstacles: Array<{ type: "aabb"; box: AABB } | { type: "circle"; circle: { centerX: number; centerY: number; radius: number } }>;
  readonly portals: readonly Portal[];
  readonly spawn: Vec2;
}

export const portal = (id: string, bounds: AABB, targetZone: ZoneId, spawn: Vec2): Portal => ({
  id,
  bounds,
  targetZone,
  spawn,
});
