/**
 * BaseZoneRoom - Colyseus room base class for all WallStreetVerse zones.
 *
 * Server-authoritative fixed-tick simulation:
 *   - Clients send timestamped movement inputs (never raw coordinates).
 *   - Each room simulates at 20Hz (50ms), validating speed limits and resolving
 *     collisions against static geometry + map bounds.
 *   - Authoritative snapshots are broadcast every tick.
 *   - Portal intersections trigger Redis-backed zone transfer tokens.
 *
 * Colyseus 0.5 note: there is exactly one `onMessage(client, data)` hook per
 * room, so every message is framed as an envelope `{ type, payload }` both
 * directions. The client never interprets coordinates as authoritative.
 */

import { Room, Client } from "colyseus";
import {
  EntityState,
  Snapshot,
  createEntityState,
  emptySnapshot,
  MessageType,
  MAP_BOUNDS,
  StaticObstacle,
  TICK_INTERVAL_MS,
  type ZoneId,
  type Vec2,
} from "@wallstreet/shared";
import { FixedTickLoop } from "../../simulation/fixed-tick-loop.js";
import { InputQueue } from "../../simulation/input-queue.js";
import { integrate } from "../../simulation/physics.js";
import { resolvePlayerCollision } from "../../simulation/collision-resolver.js";
import { issueTransferToken } from "../transfer/transfer-token.js";

const PLAYER_RADIUS = 14;

interface RoomOptions {
  zoneId: ZoneId;
  name: string;
  spawn: Vec2;
  obstacles: StaticObstacle[];
  portals: ReadonlyArray<{
    id: string;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    targetZone: ZoneId;
    spawn: Vec2;
  }>;
}

interface ServerEnvelope {
  type: string;
  payload: unknown;
}

const envelope = (type: string, payload: unknown): ServerEnvelope => ({ type, payload });

/**
 * Colyseus `Room` is generic over schema state. WallStreetVerse Phase 1 manages
 * its own plain-typed state and broadcasts JSON-snapshot envelopes, so we
 * parameterize over `any` and keep the domain strictly typed at our boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class BaseZoneRoom extends Room<any> {
  public readonly zoneId: ZoneId;
  protected readonly name: string;
  protected readonly spawn: Vec2;
  protected readonly obstacles: StaticObstacle[];
  protected readonly portals: ReadonlyArray<RoomOptions["portals"][number]>;

  protected readonly entities = new Map<string, EntityState>();
  protected readonly inputQueues = new Map<string, InputQueue>();
  protected readonly sessions = new Map<string, Client>();
  protected readonly loop = new FixedTickLoop(() => this.tick(), TICK_INTERVAL_MS);

  private simulationTick = 0;

  constructor(options: RoomOptions) {
    super();
    this.zoneId = options.zoneId;
    this.name = options.name;
    this.spawn = options.spawn;
    this.obstacles = options.obstacles;
    this.portals = options.portals;
  }

  onInit(): void {
    this.loop.start();

    // Colyseus 0.5's Room starts a default 20fps state-patch interval that
    // broadcasts `this.state` (null here). WallStreetVerse manages its own
    // authoritative snapshots via the fixed-tick loop, so disable it.
    const roomAsAny = this as unknown as { _patchInterval?: ReturnType<typeof setInterval> };
    if (roomAsAny._patchInterval) {
      clearInterval(roomAsAny._patchInterval);
      roomAsAny._patchInterval = undefined;
    }

    console.log(`[room:${this.zoneId}] created (roomId=${this.roomId})`);
  }

  async onJoin(client: Client, options?: unknown): Promise<void> {
    const sessionId = client.sessionId;
    const joinOptions = (options as { token?: string; zoneId?: string } | undefined) ?? {};

    let entity: EntityState;
    if (joinOptions.token) {
      const restored = await this.validateTransferToken(joinOptions.token, client);
      entity = restored ?? createEntityState(sessionId, this.zoneId, this.spawn.x, this.spawn.y);
    } else {
      entity = createEntityState(sessionId, this.zoneId, this.spawn.x, this.spawn.y);
    }

    this.entities.set(sessionId, entity);
    this.inputQueues.set(sessionId, new InputQueue());
    this.sessions.set(sessionId, client);

    this.send(client, envelope(MessageType.SNAPSHOT, this.buildSnapshot()));
    console.log(`[room:${this.zoneId}] join sessionId=${sessionId} (${this.entities.size} players)`);
  }

  onLeave(client: Client): void {
    const sessionId = client.sessionId;
    this.sessions.delete(sessionId);
    this.entities.delete(sessionId);
    this.inputQueues.delete(sessionId);
    console.log(`[room:${this.zoneId}] leave sessionId=${sessionId} (${this.entities.size} players)`);
  }

  /** Remove a client from the room's client list and notify onLeave. */
  removeClient(client: Client): void {
    const idx = this.clients.indexOf(client);
    if (idx >= 0) {
      this.clients.splice(idx, 1);
    }
    this.onLeave(client);
  }

  onDispose(): void {
    this.loop.stop();
    console.log(`[room:${this.zoneId}] disposed`);
  }

  /* ------------------------------------------------------------------ */
  /* Single message hook - colyseus 0.5 dispatches everything here      */
  /* ------------------------------------------------------------------ */

  onMessage(client: Client, data: unknown): void {
    const raw = data as { type?: string; payload?: unknown } | null | undefined;
    if (!raw || typeof raw.type !== "string") {
      this.send(client, envelope(MessageType.ERROR, { code: "MALFORMED_MESSAGE", message: "Expected { type, payload } envelope" }));
      return;
    }

    switch (raw.type) {
      case MessageType.INPUT:
        this.handleInput(client, raw.payload);
        break;
      case MessageType.PING:
        this.handlePing(client, raw.payload);
        break;
      default:
        this.send(client, envelope(MessageType.ERROR, { code: "UNKNOWN_MESSAGE", message: `Unknown message type ${raw.type}` }));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Input handling                                                     */
  /* ------------------------------------------------------------------ */

  private handleInput(client: Client, payload: unknown): void {
    const sessionId = client.sessionId;
    const queue = this.inputQueues.get(sessionId);
    if (!queue) return;

    const raw = payload as { input?: unknown } | undefined;
    const rawInput = raw?.input;
    if (!rawInput || typeof rawInput !== "object") return;

    const input = {
      seq: typeof (rawInput as { seq?: unknown }).seq === "number" ? (rawInput as { seq: number }).seq : 0,
      dx: typeof (rawInput as { dx?: unknown }).dx === "number" ? (rawInput as { dx: number }).dx : 0,
      dy: typeof (rawInput as { dy?: unknown }).dy === "number" ? (rawInput as { dy: number }).dy : 0,
      dt: typeof (rawInput as { dt?: unknown }).dt === "number" ? (rawInput as { dt: number }).dt : 0,
      timestamp:
        typeof (rawInput as { timestamp?: unknown }).timestamp === "number"
          ? (rawInput as { timestamp: number }).timestamp
          : Date.now(),
    };

    queue.enqueue(input, Date.now());
  }

  /* ------------------------------------------------------------------ */
  /* Fixed tick                                                         */
  /* ------------------------------------------------------------------ */

  private tick(): void {
    this.simulationTick += 1;

    for (const [sessionId, entity] of this.entities) {
      const queue = this.inputQueues.get(sessionId);
      if (!queue) continue;

      const inputs = queue.drainUpTo(Infinity);
      let inputDir = { x: 0, y: 0 };

      for (const input of inputs) {
        inputDir = { x: input.dx, y: input.dy };
        const next = integrate({ x: entity.x, y: entity.y }, { x: entity.vx, y: entity.vy }, inputDir, input.dt);
        const resolved = resolvePlayerCollision(next.pos, this.obstacles, MAP_BOUNDS);
        entity.x = resolved.pos.x;
        entity.y = resolved.pos.y;
        entity.vx = next.vel.x;
        entity.vy = next.vel.y;
        entity.tick = this.simulationTick;
      }

      if (inputs.length > 0) {
        entity.lastAckedSeq = inputs[inputs.length - 1]!.seq;
      }

      const portalHit = this.checkPortals(entity);
      if (portalHit) {
        const client = this.sessions.get(sessionId);
        if (client) {
          this.handlePortalTransfer(client, sessionId, entity, portalHit);
        }
      }
    }

    this.broadcastSnapshot();
  }

  /* ------------------------------------------------------------------ */
  /* Portals & zone transfer                                            */
  /* ------------------------------------------------------------------ */

  private checkPortals(entity: EntityState): { id: string; targetZone: ZoneId; spawn: Vec2 } | null {
    const circle = { centerX: entity.x, centerY: entity.y, radius: PLAYER_RADIUS };
    for (const portal of this.portals) {
      const box = portal.bounds;
      const closestX = Math.min(Math.max(circle.centerX, box.minX), box.maxX);
      const closestY = Math.min(Math.max(circle.centerY, box.minY), box.maxY);
      const dx = circle.centerX - closestX;
      const dy = circle.centerY - closestY;
      if (dx * dx + dy * dy < circle.radius * circle.radius) {
        return { id: portal.id, targetZone: portal.targetZone, spawn: portal.spawn };
      }
    }
    return null;
  }

  private async handlePortalTransfer(
    client: Client,
    sessionId: string,
    entity: EntityState,
    portal: { id: string; targetZone: ZoneId; spawn: Vec2 },
  ): Promise<void> {
    try {
      const token = await issueTransferToken({
        targetZone: portal.targetZone,
        sessionId,
        spawn: portal.spawn,
        entityState: entity,
        issuedAt: Date.now(),
      });
      this.send(client, envelope(MessageType.TRANSFER, {
        targetZone: portal.targetZone,
        token,
        spawn: portal.spawn,
      }));
      console.log(
        `[room:${this.zoneId}] portal transfer sessionId=${sessionId} -> ${portal.targetZone} token=${token.slice(0, 8)}...`,
      );
    } catch (err) {
      console.error(`[room:${this.zoneId}] transfer token issuance failed`, err);
      this.send(client, envelope(MessageType.ERROR, {
        code: "TRANSFER_FAILED",
        message: "Could not issue zone transfer token",
      }));
    }
  }

  private async validateTransferToken(token: string, client: Client): Promise<EntityState | null> {
    const { consumeTransferToken } = await import("../transfer/transfer-token.js");
    const payload = await consumeTransferToken(token);
    if (!payload) {
      this.send(client, envelope(MessageType.ERROR, {
        code: "INVALID_TOKEN",
        message: "Transfer token invalid or expired",
      }));
      return null;
    }
    if (payload.targetZone !== this.zoneId) {
      this.send(client, envelope(MessageType.ERROR, {
        code: "TOKEN_ZONE_MISMATCH",
        message: "Transfer token targets a different zone",
      }));
      return null;
    }
    // Respawn at the target zone's designated portal spawn, carrying over the
    // session state (acknowledged input seq, tick) but resetting velocity.
    return {
      ...payload.entityState,
      sessionId: client.sessionId,
      zoneId: this.zoneId,
      x: payload.spawn.x,
      y: payload.spawn.y,
      vx: 0,
      vy: 0,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Snapshots                                                          */
  /* ------------------------------------------------------------------ */

  protected buildSnapshot(): Snapshot {
    const entities: Snapshot["entities"] = [];

    for (const entity of this.entities.values()) {
      entities.push({
        sessionId: entity.sessionId,
        x: entity.x,
        y: entity.y,
        vx: entity.vx,
        vy: entity.vy,
        tick: entity.tick,
        zoneId: entity.zoneId,
      });
    }

    return { ...emptySnapshot(this.simulationTick, Date.now()), entities };
  }

  private broadcastSnapshot(): void {
    this.broadcast(envelope(MessageType.SNAPSHOT, this.buildSnapshot()));
  }

  private handlePing(client: Client, payload: unknown): void {
    const raw = payload as { timestamp?: unknown } | undefined;
    const timestamp = raw && typeof raw.timestamp === "number" ? raw.timestamp : Date.now();
    this.send(client, envelope(MessageType.PONG, { timestamp, serverTime: Date.now() }));
  }
}
