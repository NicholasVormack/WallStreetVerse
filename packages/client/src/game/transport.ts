/**
 * The transport contract the scene codes against.
 *
 * Two implementations exist:
 *
 *   Network      - real WebSocket client for a running Colyseus server.
 *   LocalServer  - in-browser authoritative simulator used by the GitHub Pages
 *                  demo, so the game is playable with no backend at all.
 *
 * Both speak the same input/snapshot vocabulary, which is the point: the scene
 * cannot tell which one it has, so the demo exercises the same prediction and
 * interpolation code as online play.
 */

import type { ZoneId } from "@wallstreet/shared";
import type { NetworkCallbacks } from "../types.js";

export interface Transport {
  /** True when this transport is the in-browser demo simulator. */
  readonly demo: boolean;

  readonly sessionId: string | null;

  connect(callbacks: NetworkCallbacks): void;

  joinZone(zoneId: ZoneId, token?: string): Promise<void>;

  sendInput(dx: number, dy: number, dt: number): void;

  sendPing(): void;

  transferTo(zoneId: ZoneId, token: string): Promise<void>;

  disconnect(): Promise<void>;
}
