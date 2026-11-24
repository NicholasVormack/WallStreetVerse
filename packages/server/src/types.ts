/**
 * Server-specific types bridging Colyseus sessions and the simulation.
 */

import type { EntityState, Snapshot } from "@wallstreet/shared";

export interface RoomContext {
  zoneId: string;
}

export interface SimulatedPlayer extends EntityState {
  inputSeq: number;
  predictedX: number;
  predictedY: number;
}

export type ServerSnapshot = Snapshot;
