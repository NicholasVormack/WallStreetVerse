/**
 * LoungeRoom - Social floor layout.
 *
 * Collision geometry: bar counter along one wall and booth seating zones.
 * Portals back to Wall Street and Crypto Corner.
 */

import { BaseZoneRoom } from "./base-zone-room.js";
import { type Vec2, type ZoneId } from "@wallstreet/shared";
import { aabb } from "@wallstreet/shared";

const ZONE_ID = "lounge" as ZoneId;
const SPAWN: Vec2 = { x: 400, y: 540 };

const OBSTACLES = [
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
];

const PORTALS = [
  {
    id: "lounge->wallstreet",
    bounds: aabb(880, 1030, 1000, 1080),
    targetZone: "wallstreet" as ZoneId,
    spawn: { x: 960, y: 1000 },
  },
  {
    id: "lounge->cryptocorner",
    bounds: aabb(0, 440, 40, 600),
    targetZone: "cryptocorner" as ZoneId,
    spawn: { x: 960, y: 980 },
  },
];

export class LoungeRoom extends BaseZoneRoom {
  constructor() {
    super({
      zoneId: ZONE_ID,
      name: "The Lounge",
      spawn: SPAWN,
      obstacles: OBSTACLES,
      portals: PORTALS,
    });
  }
}
