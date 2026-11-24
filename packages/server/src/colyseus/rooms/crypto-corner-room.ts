/**
 * CryptoCornerRoom - High-density floor layout.
 *
 * Collision geometry: dense cluster of mining-rig pillars and price-display
 * kiosks. Portals back to Wall Street and the Lounge.
 */

import { BaseZoneRoom } from "./base-zone-room.js";
import { type Vec2, type ZoneId } from "@wallstreet/shared";
import { aabb } from "@wallstreet/shared";

const ZONE_ID = "cryptocorner" as ZoneId;
const SPAWN: Vec2 = { x: 100, y: 580 };

const OBSTACLES = [
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
];

const PORTALS = [
  {
    id: "cryptocorner->wallstreet",
    bounds: aabb(940, 500, 980, 660),
    targetZone: "wallstreet" as ZoneId,
    spawn: { x: 40, y: 580 },
  },
  {
    id: "cryptocorner->lounge",
    bounds: aabb(440, 980, 600, 1080),
    targetZone: "lounge" as ZoneId,
    spawn: { x: 1000, y: 40 },
  },
];

export class CryptoCornerRoom extends BaseZoneRoom {
  constructor() {
    super({
      zoneId: ZONE_ID,
      name: "Crypto Corner",
      spawn: SPAWN,
      obstacles: OBSTACLES,
      portals: PORTALS,
    });
  }
}
