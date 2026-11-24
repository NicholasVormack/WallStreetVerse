# Architecture

WallStreetVerse Phase 1 is a monorepo with three runtime packages and one shim.
This document explains the moving parts and, more usefully, why each choice was
made.

```
packages/shared     domain types, constants, collision math, zod wire schemas
packages/server     Colyseus rooms, fixed-tick simulation, Fastify, Postgres, Redis
packages/client     Phaser scene, prediction, interpolation, transport
packages/uws-shim   `ws`-backed stand-in for unmaintained `uws`
```

## The tick

The server simulates every room at **20 Hz** (`TICK_INTERVAL_MS = 50`). Each tick:

1. Drain every connected client's `InputQueue`, in arrival order.
2. For each input, integrate the player with the same movement model the client
   predicts with: 900 px/s² acceleration toward the input direction, clamped to
   `MAX_SPEED = 240`, then multiplied by 0.85 friction.
3. Resolve the resulting circle against static geometry and map bounds.
4. Check portal overlap; if a player intersects one, issue a transfer token.
5. Broadcast one snapshot containing every entity in the room.

Inputs are drained per tick rather than per network message, which bounds the
simulation cost per frame no matter how fast a client sends. `InputQueue` also
caps backlog, so a paused tab cannot replay ten seconds of held movement when it
resumes.

## Why the client cannot cheat

The client sends `{ seq, dx, dy, dt, timestamp }` — a *direction* and a claimed
frame duration, never a position. `movementInputSchema` (zod) rejects `dx`/`dy`
outside `[-1, 1]` and `dt` above 1 second. The server clamps speed internally, so
even a crafted input cannot produce more than `MAX_SPEED`. Position is a pure
function of accepted inputs, which is what makes reconciliation possible at all.

## Prediction and reconciliation

`ClientLoop` applies each input locally the moment it happens, so movement feels
immediate at any latency. When an authoritative snapshot arrives for the local
entity, `reconcile()` snaps the predicted position to the server's.

Phase 1 reconciles by **snapping**, not by replaying unacknowledged inputs on top
of the corrected position. Snapping is simpler and honest at LAN-ish latency;
replay-from-sequence is the correct production approach and `lastAckedSeq`
already travels in the protocol to support it. This is the first thing to upgrade
when latency becomes real.

## Interpolation

`SnapshotBuffer` keeps the last 60 snapshots per remote entity. The renderer asks
for the position at `now - 100 ms` and lerps between the two snapshots that
bracket that time. Rendering deliberately behind live means a late packet has a
snapshot to interpolate *to*, instead of the entity freezing and then jumping.

Each buffer entry is keyed by `tick`, so interpolation is independent of wall
clock drift between client and server.

## Zone transfers

Portals are AABBs, not triggers inside the client:

1. The room detects that a player circle intersects a portal AABB.
2. The room calls `issueTransferToken()` — a random token stored in Redis with
   the target zone, spawn point, originating entity state, and a 30-second TTL.
3. The client receives `{ targetZone, token, spawn }` and reconnects to the target
   room with that token.
4. The target room calls `consumeTransferToken()`, which deletes the key as it
   reads it. Tokens are single-use, expire, and are validated against the room
   being joined.

The client never names its own spawn point. A forged join without a token lands
at the room's default spawn.

## Wire protocol

Raw WebSocket frames carrying msgpack arrays, mirroring Colyseus 0.5's own
framing:

```
client → [10, zoneId, { token? }]                  join
server → [10, sessionId]                           joined
client → [13, { type, payload }]                   room data
server → [13, roomId, { type, payload }]           room data
```

Inside the envelope, `type` is one of `input`, `ping`, `snapshot`, `pong`,
`transfer`, `error`. Colyseus 0.5 exposes exactly one `onMessage` hook per room,
so everything is funnelled through a typed envelope rather than one handler per
message type.

## The transports

`Transport` (`packages/client/src/game/transport.ts`) is the seam that makes the
GitHub Pages demo possible:

| | `Network` | `LocalServer` |
| --- | --- | --- |
| Who simulates | Colyseus room on a server | the browser tab |
| Tick | server `setInterval` | `setInterval` in the page |
| Snapshots | msgpack over WebSocket | direct callback |
| Trustworthy | yes | no — it is a demo |

The scene codes against the interface, so prediction, interpolation, collision
and portal handling are identical in both. See [DEMO.md](DEMO.md) for what the
published demo does and does not prove.

## Infrastructure

`docker-compose.yml` provides Postgres 16 and Redis 7 with health checks.
Postgres holds durable account and (Phase 2) portfolio state; Redis holds
ephemeral transfer tokens. Fastify exposes `/health` and `/auth` alongside the
Colyseus server so one process serves both.

## The uws shim

`colyseus@0.5` imports `uws`, which stopped compiling against modern V8 years
ago. `packages/uws-shim` is published into the workspace as `uws@8.14.1` and
re-exports the `ws` API subset Colyseus actually calls. It is a compatibility
workaround, documented rather than hidden; upgrading Colyseus removes the need
for it.

## Known gaps

- **Zone geometry duplication.** Server rooms and the client's `zones.ts` both
  describe obstacles and portals. Serving a zone manifest from the server (or
  generating the client file at build time) is the correct fix.
- **No automated tests.** Typechecking and manual play are the current bar.
- **No replay reconciliation.** `lastAckedSeq` is carried but not yet used to
  replay inputs; reconcile snaps.
- **Single-process rooms.** Colyseus `presence`/`driver` are default in-memory.
  Multi-node deployment needs a Redis presence driver.
