/**
 * WallStreetRoom - Large trading floor layout.
 *
 * Collision geometry: ticker pillars and trading booths scattered across the
 * floor. Portals to the Lounge and Crypto Corner.
 */

import { BaseZoneRoom } from "./base-zone-room.js";
import { type Vec2, type ZoneId } from "@wallstreet/shared";
import { aabb } from "@wallstreet/shared";

const ZONE_ID = "wallstreet" as ZoneId;
const SPAWN: Vec2 = { x: 960, y: 540 };

const OBSTACLES = [
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
];

const PORTALS = [
  {
    id: "wallstreet->lounge",
    bounds: aabb(900, 1030, 1020, 1080),
    targetZone: "lounge" as ZoneId,
    spawn: { x: 400, y: 540 },
  },
  {
    id: "wallstreet->cryptocorner",
    bounds: aabb(0, 500, 40, 660),
    targetZone: "cryptocorner" as ZoneId,
    spawn: { x: 1800, y: 540 },
  },
];

export class WallStreetRoom extends BaseZoneRoom {
  constructor() {
    super({
      zoneId: ZONE_ID,
      name: "Wall Street Trading Floor",
      spawn: SPAWN,
      obstacles: OBSTACLES,
      portals: PORTALS,
    });
  }
}
