/**
 * Client-side prediction with server reconciliation for the local player.
 *
 * - Local inputs are applied immediately (prediction) and sent to the server.
 * - When an authoritative snapshot arrives, the local player is snapped back to
 *   the server position; unacknowledged inputs would be re-applied on top.
 */

import type { SnapshotEntity } from "@wallstreet/shared";

const MAX_SPEED = 240;
const PLAYER_RADIUS = 14;

interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  dt: number;
}

const clampToBounds = (x: number, y: number): { x: number; y: number } => ({
  x: Math.min(Math.max(x, PLAYER_RADIUS), 1920 - PLAYER_RADIUS),
  y: Math.min(Math.max(y, PLAYER_RADIUS), 1080 - PLAYER_RADIUS),
});

export class ClientLoop {
  private x = 960;
  private y = 540;
  private vx = 0;
  private vy = 0;
  private inputs: PendingInput[] = [];

  setPosition(x: number, y: number, vx: number, vy: number): void {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  getVelocity(): { vx: number; vy: number } {
    return { vx: this.vx, vy: this.vy };
  }

  /**
   * Apply a local input intent immediately (prediction) and queue it for
   * reconciliation against future server snapshots.
   */
  applyInput(dx: number, dy: number, dt: number): void {
    const next = this.integrate(this.x, this.y, this.vx, this.vy, dx, dy, dt);
    this.x = next.x;
    this.y = next.y;
    this.vx = next.vx;
    this.vy = next.vy;
    this.inputs.push({ seq: Date.now(), dx, dy, dt });
  }

  /**
   * Reconcile with an authoritative server snapshot for this entity.
   */
  reconcile(entity: SnapshotEntity): void {
    this.x = entity.x;
    this.y = entity.y;
    this.vx = entity.vx;
    this.vy = entity.vy;
  }

  private integrate(
    x: number,
    y: number,
    vx: number,
    vy: number,
    dx: number,
    dy: number,
    dt: number,
  ): { x: number; y: number; vx: number; vy: number } {
    const accel = 900;
    const friction = 0.85;
    const desiredVx = dx * MAX_SPEED;
    const desiredVy = dy * MAX_SPEED;
    let nextVx = vx + (desiredVx - vx) * accel * dt;
    let nextVy = vy + (desiredVy - vy) * accel * dt;
    const speed = Math.hypot(nextVx, nextVy);
    if (speed > MAX_SPEED) {
      nextVx = (nextVx / speed) * MAX_SPEED;
      nextVy = (nextVy / speed) * MAX_SPEED;
    }
    let nextX = x + nextVx * dt;
    let nextY = y + nextVy * dt;
    const clamped = clampToBounds(nextX, nextY);
    nextX = clamped.x;
    nextY = clamped.y;
    return { x: nextX, y: nextY, vx: nextVx * friction, vy: nextVy * friction };
  }
}
