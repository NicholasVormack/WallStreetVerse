/**
 * Client-side zone definitions.
 *
 * These mirror the collision geometry declared by the server rooms
 * (`packages/server/src/colyseus/rooms/*-room.ts`). The server remains the only
 * authority in online play; the client uses this copy for two things:
 *
 *   1. drawing the floor, obstacles and portals, which the Phase 1 renderer
 *      never did (it drew players on an empty canvas), and
 *   2. running the offline demo simulation in `local-server.ts`.
 *
 * If a room changes, this file has to change with it. That is a known
 * duplication: geometry lives in two languages, and the alternatives (serving
 * zone configs over HTTP, or generating this file at build time) are Phase 2.
 */

import { aabb } from "@wallstreet/shared";
import type { AABB, StaticObstacle, Vec2, ZoneId } from "@wallstreet/shared";

export interface ZonePortal {
  readonly id: string;
  readonly bounds: AABB;
  readonly targetZone: ZoneId;
  readonly spawn: Vec2;
  /** Short caption drawn on the portal. */
  readonly label: string;
}

export interface ZoneTheme {
  /** Floor fill. */
  readonly floor: number;
  /** Grid line colour. */
  readonly grid: number;
  /** Accent used for portals, headings and the zone banner. */
  readonly accent: number;
  /** Which slice of the market this zone displays. */
  readonly market: "equity" | "crypto" | "all";
  readonly tagline: string;
}

export interface ZoneDefinition {
  readonly zoneId: ZoneId;
  readonly name: string;
  readonly spawn: Vec2;
  readonly obstacles: readonly StaticObstacle[];
  readonly portals: readonly ZonePortal[];
  /** Wander targets for demo bots, kept in open floor space. */
  readonly waypoints: readonly Vec2[];
  readonly theme: ZoneTheme;
}

const WALLSTREET: ZoneDefinition = {
  zoneId: "wallstreet",
  name: "Wall Street Trading Floor",
  spawn: { x: 960, y: 540 },
  obstacles: [
    // Ticker pillars
    aabb(300, 200, 340, 320),
    aabb(1580, 200, 1620, 320),
    aabb(300, 760, 340, 880),
    aabb(1580, 760, 1620, 880),
    aabb(900, 100, 1020, 140), // central ticker gantry
    // Trading booths
    aabb(500, 400, 700, 520),
    aabb(740, 400, 940, 520),
    aabb(500, 600, 700, 720),
    aabb(740, 600, 940, 720),
    aabb(1100, 400, 1300, 520),
    aabb(1340, 400, 1540, 520),
    aabb(1100, 600, 1300, 720),
    aabb(1340, 600, 1540, 720),
  ],
  portals: [
    {
      id: "wallstreet->lounge",
      bounds: aabb(900, 1030, 1020, 1080),
      targetZone: "lounge",
      spawn: { x: 400, y: 540 },
      label: "The Lounge",
    },
    {
      id: "wallstreet->cryptocorner",
      bounds: aabb(0, 500, 40, 660),
      targetZone: "cryptocorner",
      spawn: { x: 1800, y: 540 },
      label: "Crypto Corner",
    },
  ],
  waypoints: [
    { x: 960, y: 540 },
    { x: 960, y: 860 },
    { x: 420, y: 600 },
    { x: 1480, y: 820 },
    { x: 960, y: 280 },
  ],
  theme: {
    floor: 0x0b1118,
    grid: 0x16202b,
    accent: 0x4cc9f0,
    market: "equity",
    tagline: "Phase 1 · authoritative movement · equities feed",
  },
};

const CRYPTOCORNER: ZoneDefinition = {
  zoneId: "cryptocorner",
  name: "Crypto Corner",
  spawn: { x: 100, y: 580 },
  obstacles: [
    // Dense rig pillars
    aabb(120, 120, 180, 200),
    aabb(220, 120, 280, 200),
    aabb(120, 300, 180, 380),
    aabb(220, 300, 280, 380),
    aabb(120, 500, 180, 580),
    aabb(220, 500, 280, 580),
    aabb(120, 700, 180, 780),
    aabb(220, 700, 280, 780),
    aabb(120, 900, 180, 960),
    aabb(220, 900, 280, 960),
    // Price-display kiosks
    aabb(400, 150, 520, 210),
    aabb(640, 150, 760, 210),
    aabb(400, 390, 520, 450),
    aabb(640, 390, 760, 450),
    aabb(400, 630, 520, 690),
    aabb(640, 630, 760, 690),
    aabb(400, 870, 520, 930),
    aabb(640, 870, 760, 930),
  ],
  portals: [
    {
      id: "cryptocorner->wallstreet",
      bounds: aabb(940, 500, 980, 660),
      targetZone: "wallstreet",
      spawn: { x: 40, y: 580 },
      label: "Wall Street",
    },
    {
      id: "cryptocorner->lounge",
      bounds: aabb(440, 980, 600, 1080),
      targetZone: "lounge",
      spawn: { x: 1000, y: 40 },
      label: "The Lounge",
    },
  ],
  waypoints: [
    { x: 100, y: 580 },
    { x: 860, y: 540 },
    { x: 860, y: 300 },
    { x: 860, y: 800 },
  ],
  theme: {
    floor: 0x0d0f16,
    grid: 0x1d1a2b,
    accent: 0xf72585,
    market: "crypto",
    tagline: "Phase 1 · mining rigs · crypto feed",
  },
};

const LOUNGE: ZoneDefinition = {
  zoneId: "lounge",
  name: "The Lounge",
  spawn: { x: 400, y: 540 },
  obstacles: [
    // Bar counter (long horizontal)
    aabb(100, 440, 700, 480),
    // Booths
    aabb(850, 200, 1050, 320),
    aabb(850, 360, 1050, 480),
    aabb(850, 600, 1050, 720),
    aabb(850, 760, 1050, 880),
    aabb(1100, 200, 1300, 320),
    aabb(1100, 760, 1300, 880),
    // Lounge pillars
    aabb(1400, 440, 1460, 520),
    aabb(1400, 560, 1460, 640),
  ],
  portals: [
    {
      id: "lounge->wallstreet",
      bounds: aabb(880, 1030, 1000, 1080),
      targetZone: "wallstreet",
      spawn: { x: 960, y: 1000 },
      label: "Wall Street",
    },
    {
      id: "lounge->cryptocorner",
      bounds: aabb(0, 440, 40, 600),
      targetZone: "cryptocorner",
      spawn: { x: 960, y: 980 },
      label: "Crypto Corner",
    },
  ],
  waypoints: [
    { x: 400, y: 540 },
    { x: 1600, y: 540 },
    { x: 1600, y: 900 },
    { x: 300, y: 900 },
  ],
  theme: {
    floor: 0x0e1110,
    grid: 0x1b2420,
    accent: 0x8ac926,
    market: "all",
    tagline: "Phase 1 · social floor · mixed feed",
  },
};

export const ZONES: Record<ZoneId, ZoneDefinition> = {
  wallstreet: WALLSTREET,
  cryptocorner: CRYPTOCORNER,
  lounge: LOUNGE,
};

export const zoneOf = (zoneId: ZoneId): ZoneDefinition => ZONES[zoneId];
