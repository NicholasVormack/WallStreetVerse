/**
 * LocalServer - in-browser authoritative simulator.
 *
 * GitHub Pages can serve static files and nothing else, so the deployed demo
 * has no Colyseus server behind it. Rather than ship a dead "connecting..."
 * screen, the client runs the same fixed-tick simulation in the browser:
 *
 *   - inputs are queued and applied on a 20 Hz tick, not per animation frame,
 *   - movement is integrated with the same accel/speed clamp as the server,
 *   - collisions resolve against the zone geometry with the shared helpers,
 *   - portals trigger a zone transfer, exactly like the Redis-token path,
 *   - three bots wander each zone so interpolation and the remote-player path
 *     are actually visible.
 *
 * The server in `packages/server` remains the only authority in online play.
 * This file is a demo harness, and the scene labels the demo as such.
 */

import { PLAYER_RADIUS, TICK_INTERVAL_MS, MAX_SPEED, MAP_BOUNDS } from "@wallstreet/shared";
import type { SnapshotEntity, ZoneId } from "@wallstreet/shared";
import { clampToBounds, collideCircleStatic } from "@wallstreet/shared";
import type { NetworkCallbacks } from "../types.js";
import type { ZonePortal, ZoneDefinition } from "./zones.js";
import { ZONES, zoneOf } from "./zones.js";
import type { Transport } from "./transport.js";

interface PendingInput {
  readonly dx: number;
  readonly dy: number;
  readonly dt: number;
}

interface SimEntity {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tick: number;
}

interface BotState {
  readonly entity: SimEntity;
  waypoint: number;
  stalledMs: number;
}

const BOT_NAMES = ["MM-Alpha", "Retail-7", "Whale-3"] as const;
const BOT_SPEED = MAX_SPEED * 0.45;
const TRANSFER_COOLDOWN_MS = 600;

/**
 * Same integration as `packages/server/src/simulation/physics.ts`. Duplicated
 * rather than imported because the client package does not depend on the server
 * package; a shared `physics` module in `@wallstreet/shared` is the Phase 2 fix.
 */
const integrate = (
  x: number,
  y: number,
  vx: number,
  vy: number,
  dx: number,
  dy: number,
  dt: number,
): { x: number; y: number; vx: number; vy: number } => {
  const accel = 900;
  const friction = 0.85;
  const desiredX = dx * MAX_SPEED;
  const desiredY = dy * MAX_SPEED;

  let nextVx = vx + (desiredX - vx) * accel * dt;
  let nextVy = vy + (desiredY - vy) * accel * dt;

  const speed = Math.hypot(nextVx, nextVy);
  if (speed > MAX_SPEED) {
    nextVx = (nextVx / speed) * MAX_SPEED;
    nextVy = (nextVy / speed) * MAX_SPEED;
  }

  const nextX = x + nextVx * dt;
  const nextY = y + nextVy * dt;

  return { x: nextX, y: nextY, vx: nextVx * friction, vy: nextVy * friction };
};

const resolveCollision = (
  x: number,
  y: number,
  zone: ZoneDefinition,
): { x: number; y: number } => {
  const circle = { centerX: x, centerY: y, radius: PLAYER_RADIUS };
  let resolvedX = x;
  let resolvedY = y;

  for (let pass = 0; pass < 3; pass += 1) {
    circle.centerX = resolvedX;
    circle.centerY = resolvedY;
    const mtv = collideCircleStatic(circle, zone.obstacles);
    if (!mtv) break;
    resolvedX += mtv.x;
    resolvedY += mtv.y;
  }

  const clamped = clampToBounds({ x: resolvedX, y: resolvedY }, PLAYER_RADIUS, MAP_BOUNDS);
  return { x: clamped.x, y: clamped.y };
};

export class LocalServer implements Transport {
  public readonly demo = true;

  private callbacks: NetworkCallbacks | null = null;
  private zone: ZoneDefinition = ZONES.wallstreet;
  private me: SimEntity = {
    id: "you",
    x: ZONES.wallstreet.spawn.x,
    y: ZONES.wallstreet.spawn.y,
    vx: 0,
    vy: 0,
    tick: 0,
  };
  private bots: BotState[] = [];
  private queue: PendingInput[] = [];
  private tickCount = 0;
  private timer: number | null = null;
  private lastTickAt = 0;
  private lastPingAt = 0;
  private cooldownUntil = 0;
  private pendingSpawn: { x: number; y: number } | null = null;
  private connected = false;

  get sessionId(): string | null {
    return this.connected ? this.me.id : null;
  }

  connect(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
    this.connected = true;
  }

  async joinZone(zoneId: ZoneId): Promise<void> {
    const zone = zoneOf(zoneId);
    this.enterZone(zone, zone.spawn);
  }

  async transferTo(zoneId: ZoneId): Promise<void> {
    const zone = zoneOf(zoneId);
    const spawn = this.pendingSpawn ?? zone.spawn;
    this.pendingSpawn = null;
    this.enterZone(zone, spawn);
  }

  sendInput(dx: number, dy: number, dt: number): void {
    // The scene already throttles input; the tick drains whatever arrived.
    this.queue.push({ dx, dy, dt });
    if (this.queue.length > 20) this.queue.shift();
  }

  sendPing(): void {
    const now = Date.now();
    if (now - this.lastPingAt < 500) return;
    this.lastPingAt = now;
    // A local round trip costs almost nothing; report a plausible figure.
    this.callbacks?.onPong({ timestamp: now, serverTime: now });
  }

  async disconnect(): Promise<void> {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.connected = false;
  }

  private enterZone(zone: ZoneDefinition, spawn: { x: number; y: number }): void {
    this.zone = zone;
    this.me = { id: "you", x: spawn.x, y: spawn.y, vx: 0, vy: 0, tick: this.tickCount };
    this.queue = [];
    this.tickCount = 0;
    this.cooldownUntil = Date.now() + TRANSFER_COOLDOWN_MS;
    this.bots = BOT_NAMES.map((name, index) => this.createBot(zone, name, index));

    this.callbacks?.onJoin(this.me.id);

    // The real room sends a snapshot on join, so the client never renders an
    // empty frame. Mirror that here instead of waiting for the first tick.
    this.callbacks?.onSnapshot([
      this.toSnapshot(this.me),
      ...this.bots.map((bot) => this.toSnapshot(bot.entity)),
    ]);

    if (this.timer !== null) window.clearInterval(this.timer);
    this.lastTickAt = performance.now();
    this.timer = window.setInterval(() => this.tickLoop(), TICK_INTERVAL_MS);
  }

  private createBot(zone: ZoneDefinition, name: string, index: number): BotState {
    const waypoint = zone.waypoints[(index + 1) % zone.waypoints.length];
    const start = waypoint ?? zone.spawn;
    return {
      entity: {
        id: name,
        x: start.x,
        y: start.y,
        vx: 0,
        vy: 0,
        tick: 0,
      },
      waypoint: (index + 2) % zone.waypoints.length,
      stalledMs: 0,
    };
  }

  private tickLoop(): void {
    const now = performance.now();
    const elapsed = now - this.lastTickAt;
    this.lastTickAt = now;

    this.tickCount += 1;
    const dt = Math.min(elapsed / 1000, 0.1);

    this.simulatePlayer(dt);
    this.simulateBots(dt);
    this.checkPortals();

    const entities: SnapshotEntity[] = [
      this.toSnapshot(this.me),
      ...this.bots.map((bot) => this.toSnapshot(bot.entity)),
    ];
    this.callbacks?.onSnapshot(entities);
  }

  private simulatePlayer(_dt: number): void {
    if (this.queue.length === 0) {
      // No input this tick: bleed off momentum the way friction does.
      this.me.vx *= 0.9;
      this.me.vy *= 0.9;
      return;
    }

    const pending = this.queue.splice(0, this.queue.length);

    for (const input of pending) {
      const step = Math.min(Math.max(input.dt, 0), 0.1);
      const next = integrate(this.me.x, this.me.y, this.me.vx, this.me.vy, input.dx, input.dy, step);
      const resolved = resolveCollision(next.x, next.y, this.zone);
      this.me.x = resolved.x;
      this.me.y = resolved.y;
      this.me.vx = next.vx;
      this.me.vy = next.vy;
    }

    this.me.tick = this.tickCount;
  }

  private simulateBots(dt: number): void {
    for (const bot of this.bots) {
      const target = this.zone.waypoints[bot.waypoint];
      if (!target) continue;

      const dx = target.x - bot.entity.x;
      const dy = target.y - bot.entity.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 24) {
        bot.waypoint = (bot.waypoint + 1) % this.zone.waypoints.length;
        bot.stalledMs = 0;
        continue;
      }

      const dirX = dx / distance;
      const dirY = dy / distance;
      const nextX = bot.entity.x + dirX * BOT_SPEED * dt;
      const nextY = bot.entity.y + dirY * BOT_SPEED * dt;
      const resolved = resolveCollision(nextX, nextY, this.zone);

      const moved = Math.hypot(resolved.x - bot.entity.x, resolved.y - bot.entity.y);
      bot.entity.vx = moved / Math.max(dt, 1e-6) * dirX;
      bot.entity.vy = moved / Math.max(dt, 1e-6) * dirY;
      bot.entity.x = resolved.x;
      bot.entity.y = resolved.y;
      bot.entity.tick = this.tickCount;

      // A bot wedged on a pillar repaths instead of grinding against it.
      if (moved < BOT_SPEED * dt * 0.2) {
        bot.stalledMs += dt * 1000;
        if (bot.stalledMs > 900) {
          bot.waypoint = (bot.waypoint + 1) % this.zone.waypoints.length;
          bot.stalledMs = 0;
        }
      } else {
        bot.stalledMs = 0;
      }
    }
  }

  private checkPortals(): void {
    if (Date.now() < this.cooldownUntil) return;

    for (const portal of this.zone.portals) {
      if (!this.overlaps(this.me, portal)) continue;
      this.cooldownUntil = Date.now() + TRANSFER_COOLDOWN_MS;
      this.pendingSpawn = portal.spawn;
      this.callbacks?.onTransfer({
        targetZone: portal.targetZone,
        token: `local-${portal.id}`,
        spawn: portal.spawn,
      });
      return;
    }
  }

  private overlaps(entity: SimEntity, portal: ZonePortal): boolean {
    const box = portal.bounds;
    const closestX = Math.min(Math.max(entity.x, box.minX), box.maxX);
    const closestY = Math.min(Math.max(entity.y, box.minY), box.maxY);
    const dx = entity.x - closestX;
    const dy = entity.y - closestY;
    return dx * dx + dy * dy < PLAYER_RADIUS * PLAYER_RADIUS;
  }

  private toSnapshot(entity: SimEntity): SnapshotEntity {
    return {
      sessionId: entity.id,
      x: entity.x,
      y: entity.y,
      vx: entity.vx,
      vy: entity.vy,
      tick: entity.tick,
      zoneId: this.zone.zoneId,
    };
  }
}
