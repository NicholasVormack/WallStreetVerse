/**
 * Shared constants for WallStreetVerse Phase 1.
 * These values are authoritative: server and client must agree on them.
 */

export const TICK_RATE = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 50ms

export const MAX_SPEED = 240; // pixels per second
export const PLAYER_RADIUS = 14;
export const PLAYER_DIAMETER = PLAYER_RADIUS * 2;

export const MAP_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1920,
  maxY: 1080,
} as const;

export const COLLISION_GRID_CELL = 64;

export const PORTAL_TTL_SECONDS = 30;
export const SNAPSHOT_BROADCAST_EVERY_TICKS = 1;

export const ZONE_IDS = ["wallstreet", "cryptocorner", "lounge"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export const WS_PORT = 2567;
export const HTTP_PORT = 3001;

export const isZoneId = (value: unknown): value is ZoneId =>
  (ZONE_IDS as readonly string[]).includes(value as string);
