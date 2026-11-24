/**
 * Server-side collision resolution.
 *
 * Resolves a player circle against map bounds and static obstacles using the
 * shared CollisionGrid. Returns the resolved position after sliding along
 * collision surfaces (MTV resolution).
 */

import type { Circle, StaticObstacle, Vec2 } from "@wallstreet/shared";
import { collideCircleStatic, clampToBounds } from "@wallstreet/shared";
import { PLAYER_RADIUS } from "@wallstreet/shared";

export interface CollisionResult {
  pos: Vec2;
  collided: boolean;
}

export const resolvePlayerCollision = (
  pos: Vec2,
  obstacles: readonly StaticObstacle[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): CollisionResult => {
  const circle: Circle = { centerX: pos.x, centerY: pos.y, radius: PLAYER_RADIUS };

  // Resolve against static obstacles (simple iteration; one pass is sufficient
  // for the sparse geometry in Phase 1).
  let resolved = { ...pos };
  let collided = false;
  for (let i = 0; i < 3; i++) {
    circle.centerX = resolved.x;
    circle.centerY = resolved.y;
    const mtv = collideCircleStatic(circle, obstacles);
    if (!mtv) break;
    resolved.x += mtv.x;
    resolved.y += mtv.y;
    collided = true;
  }

  // Clamp to map bounds last.
  resolved = clampToBounds(resolved, PLAYER_RADIUS, bounds);

  return { pos: resolved, collided };
};
