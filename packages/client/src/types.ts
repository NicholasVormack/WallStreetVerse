/**
 * Client-side types. The client is a dumb terminal: it interpolates server
 * snapshots and sends input intents. It never authoritatively moves anything.
 */

import type { SnapshotEntity, ZoneId } from "@wallstreet/shared";

export type { SnapshotEntity, ZoneId };
export type { MessageType } from "@wallstreet/shared";

export interface RemotePlayer {
  sessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  lastSnapshotTime: number;
  zoneId: ZoneId;
}

export interface NetworkCallbacks {
  onSnapshot: (entities: SnapshotEntity[]) => void;
  onTransfer: (payload: { targetZone: ZoneId; token: string; spawn: { x: number; y: number } }) => void;
  onPong: (payload: { timestamp: number; serverTime: number }) => void;
  onError: (payload: { code: string; message: string }) => void;
  onJoin: (sessionId: string) => void;
  onLeave: (sessionId: string) => void;
}
