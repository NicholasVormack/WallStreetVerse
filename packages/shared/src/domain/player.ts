/**
 * Server-authoritative player/entity state.
 */

import type { ZoneId } from "../constants.js";

export interface EntityState {
  readonly sessionId: string;
  readonly zoneId: ZoneId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Last server tick this entity was simulated. */
  tick: number;
  /** Last input sequence the server has applied for this entity. */
  lastAckedSeq: number;
}

export const createEntityState = (sessionId: string, zoneId: ZoneId, x: number, y: number): EntityState => ({
  sessionId,
  zoneId,
  x,
  y,
  vx: 0,
  vy: 0,
  tick: 0,
  lastAckedSeq: -1,
});

export interface SnapshotEntity {
  sessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tick: number;
  zoneId: ZoneId;
}

export interface Snapshot {
  tick: number;
  timestamp: number;
  entities: SnapshotEntity[];
}

export const emptySnapshot = (tick: number, timestamp: number): Snapshot => ({
  tick,
  timestamp,
  entities: [],
});
