/// <reference types="vite/client" />

/**
 * Network transport over a browser WebSocket.
 *
 * The client is a dumb terminal: it sends timestamped input intents to the
 * server and dispatches authoritative snapshots / transfer tokens to the caller
 * via callbacks. It never interprets coordinates as authoritative.
 *
 * Wire protocol mirrors the server (msgpack arrays):
 *   client -> [JOIN_ROOM, zoneId, { token }]
 *   server -> [JOIN_ROOM, sessionId]
 *   client -> [ROOM_DATA, { type, payload }]
 *   server -> [ROOM_DATA, roomId, { type, payload }]
 *
 * This previously imported `ws`, a Node-only package, which meant the client
 * bundle could never run in a browser. It now uses the platform WebSocket.
 */

import { pack, unpack } from "@colyseus/msgpackr";
import type { MovementInput, ZoneId } from "@wallstreet/shared";
import type { NetworkCallbacks } from "../types.js";
import type { Transport } from "./transport.js";

const PROTOCOL = { JOIN_ROOM: 10, ROOM_DATA: 13, LEAVE_ROOM: 12, ERROR: 11 } as const;

export class Network implements Transport {
  public readonly demo = false;

  private socket: WebSocket | null = null;
  private callbacks: NetworkCallbacks | null = null;
  private inputSeq = 0;
  private lastInputTime = 0;
  private sessionIdValue: string | null = null;
  private lastPingTime = 0;

  constructor(private readonly url: string) {}

  get sessionId(): string | null {
    return this.sessionIdValue;
  }

  connect(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
  }

  async joinZone(zoneId: ZoneId, token?: string): Promise<void> {
    await this.disconnect();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.url);
      socket.binaryType = "arraybuffer";

      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      socket.addEventListener("open", () => {
        socket.send(pack([PROTOCOL.JOIN_ROOM, zoneId, { token }]));
      });

      socket.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as ArrayBuffer;
        let message: unknown[];
        try {
          message = unpack(new Uint8Array(data)) as unknown[];
        } catch {
          return;
        }

        const code = message[0] as number;

        if (code === PROTOCOL.JOIN_ROOM) {
          this.sessionIdValue = (message[1] as string) ?? null;
          this.socket = socket;
          this.callbacks?.onJoin(this.sessionIdValue ?? "");
          finish();
          return;
        }

        if (code === PROTOCOL.ROOM_DATA) {
          const envelope = message[2] as { type?: string; payload?: unknown } | undefined;
          if (!envelope || typeof envelope.type !== "string") return;
          switch (envelope.type) {
            case "snapshot":
              this.callbacks?.onSnapshot((envelope.payload as any) ?? []); // eslint-disable-line @typescript-eslint/no-explicit-any
              break;
            case "transfer":
              this.callbacks?.onTransfer(envelope.payload as any); // eslint-disable-line @typescript-eslint/no-explicit-any
              break;
            case "pong":
              this.callbacks?.onPong(envelope.payload as any); // eslint-disable-line @typescript-eslint/no-explicit-any
              break;
            case "error":
              this.callbacks?.onError(envelope.payload as any); // eslint-disable-line @typescript-eslint/no-explicit-any
              break;
            default:
              break;
          }
          return;
        }

        if (code === PROTOCOL.LEAVE_ROOM || code === PROTOCOL.ERROR) {
          this.callbacks?.onLeave(this.sessionIdValue ?? "");
        }
      });

      socket.addEventListener("error", () => {
        finish(new Error(`WebSocket error connecting to ${this.url}`));
      });

      socket.addEventListener("close", () => {
        finish(new Error("WebSocket closed before join completed"));
      });
    });
  }

  sendInput(dx: number, dy: number, dt: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - this.lastInputTime < 40) return;
    this.lastInputTime = now;
    this.inputSeq += 1;

    const input: MovementInput = { seq: this.inputSeq, dx, dy, dt, timestamp: now };
    this.socket.send(pack([PROTOCOL.ROOM_DATA, { type: "input", payload: { input } }]));
  }

  sendPing(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - this.lastPingTime < 500) return;
    this.lastPingTime = now;
    this.socket.send(pack([PROTOCOL.ROOM_DATA, { type: "ping", payload: { timestamp: now } }]));
  }

  async transferTo(targetZone: ZoneId, token: string): Promise<void> {
    await this.joinZone(targetZone, token);
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // The socket was already closing; nothing to do.
      }
      this.socket = null;
    }
    this.sessionIdValue = null;
  }
}
