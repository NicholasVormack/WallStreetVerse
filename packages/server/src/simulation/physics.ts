/**
 * Server-side movement physics: speed clamping and semi-implicit Euler
 * integration. Runs purely on the server; client coordinates are never trusted.
 */

import type { Vec2 } from "@wallstreet/shared";
import { MAX_SPEED } from "@wallstreet/shared";

/**
 * Integrate position from velocity over dt (seconds), clamping speed to
 * MAX_SPEED. Returns the new position and clamped velocity.
 */
export const integrate = (pos: Vec2, vel: Vec2, inputDir: Vec2, dt: number, speed: number = MAX_SPEED): { pos: Vec2; vel: Vec2 } => {
  const accel = 900; // pixels per second^2
  const friction = 0.85;

  const desired = { x: inputDir.x * speed, y: inputDir.y * speed };
  const vx = vel.x + (desired.x - vel.x) * accel * dt;
  const vy = vel.y + (desired.y - vel.y) * accel * dt;

  const velLength = Math.hypot(vx, vy);
  let clampedVx = vx;
  let clampedVy = vy;
  if (velLength > speed) {
    clampedVx = (vx / velLength) * speed;
    clampedVy = (vy / velLength) * speed;
  }

  const nextX = pos.x + clampedVx * dt;
  const nextY = pos.y + clampedVy * dt;

  return {
    pos: { x: nextX, y: nextY },
    vel: { x: clampedVx * friction, y: clampedVy * friction },
  };
};
