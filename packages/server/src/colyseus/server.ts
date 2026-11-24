/**
 * Colyseus room runtime (standalone WebSocket server).
 *
 * Colyseus 0.5's `Server` couples room creation to an HTTP matchmaking flow
 * that this project does not use. Instead we instantiate the zone `Room`
 * classes directly and run a small, explicit WebSocket router:
 *
 *   client -> [JOIN_ROOM, zoneId, options]   server assigns a sessionId and
 *                                           enrols the client in the room
 *   client -> [ROOM_DATA, payload]           server routes to the client's room
 *   server  -> [ROOM_DATA, roomId, envelope] broadcast to every room client
 *
 * Messages are msgpack-encoded, matching the colyseus wire format.
 */

import { WebSocketServer } from "uws";
import type { WebSocket as Socket } from "uws";
import { generateId } from "colyseus";
import { pack, unpack } from "@colyseus/msgpackr";
import { WallStreetRoom } from "./rooms/wall-street-room.js";
import { CryptoCornerRoom } from "./rooms/crypto-corner-room.js";
import { LoungeRoom } from "./rooms/lounge-room.js";
import { WS_PORT } from "@wallstreet/shared";
import type { BaseZoneRoom } from "./rooms/base-zone-room.js";
import type { Client } from "colyseus";

const PROTOCOL = { JOIN_ROOM: 10, ROOM_DATA: 13, LEAVE_ROOM: 12, ERROR: 11 };

interface WireClient {
  sessionId: string;
  id: string;
  send: (data: Buffer, options?: { binary?: boolean }, ack?: () => void) => void;
  upgradeReq: { url: string };
  close: () => void;
  readyState: number;
}

const rooms = new Map<string, BaseZoneRoom>();
const clientRooms = new Map<Socket, { room: BaseZoneRoom; sessionId: string }>();

function encode(message: unknown[]): Buffer {
  return Buffer.from(pack(message));
}

function decode(buffer: Buffer): unknown[] {
  return unpack(buffer) as unknown[];
}

function makeWireClient(ws: Socket, sessionId: string): WireClient {
  return {
    sessionId,
    id: sessionId,
    send: (data: Buffer, _options?: { binary?: boolean }, ack?: () => void) => {
      ws.send(data);
      ack?.();
    },
    upgradeReq: { url: "/" },
    close: () => ws.close(),
    readyState: 1,
  };
}

export const createColyseusServer = () => {
  const registerRoom = (room: BaseZoneRoom) => {
    room.roomId = generateId();
    room.roomName = room.zoneId;
    room.onInit();
    rooms.set(room.zoneId, room);
  };

  registerRoom(new WallStreetRoom());
  registerRoom(new CryptoCornerRoom());
  registerRoom(new LoungeRoom());

  const wss = new WebSocketServer({ port: WS_PORT, host: "0.0.0.0" });

  wss.on("connection", (ws: Socket) => {
    ws.on("message", (raw: Buffer) => {
      let msg: unknown[];
      try {
        msg = decode(raw);
      } catch {
        return;
      }
      const code = msg[0] as number;

      if (code === PROTOCOL.JOIN_ROOM) {
        const [, zoneId, options] = msg as [number, string, unknown];
        const room = rooms.get(zoneId);
        if (!room) {
          ws.send(encode([PROTOCOL.ERROR, zoneId, "no handler for zone"]));
          return;
        }

        const sessionId = generateId();
        const client = makeWireClient(ws, sessionId);

        clientRooms.set(ws, { room, sessionId });
        room.clients.push(client as unknown as Client);
        void room.onJoin(client as unknown as Client, options);
        ws.send(encode([PROTOCOL.JOIN_ROOM, sessionId]));
        return;
      }

      const entry = clientRooms.get(ws);
      if (!entry) return;

      if (code === PROTOCOL.ROOM_DATA) {
        const fakeClient: Client = {
          sessionId: entry.sessionId,
          id: entry.sessionId,
          send: () => {},
          upgradeReq: { url: "/" },
          close: () => ws.close(),
          readyState: 1,
          on: () => undefined,
          removeAllListeners: () => undefined,
          binaryType: "",
          bufferedAmount: 0,
          extensions: "",
          protocol: "",
          url: "",
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
          terminate: () => ws.close(),
          ping: () => undefined,
          pong: () => undefined,
          stream: undefined as any,
        } as unknown as Client;
        entry.room.onMessage(fakeClient, msg[1]);
      }
    });

    ws.on("close", () => {
      const entry = clientRooms.get(ws);
      if (!entry) return;
      entry.room.removeClient(
        { sessionId: entry.sessionId, id: entry.sessionId, send: () => {}, upgradeReq: { url: "/" } } as unknown as Client,
      );
      clientRooms.delete(ws);
    });
  });

  wss.on("listening", () => {
    console.log(`[colyseus] listening on ws://0.0.0.0:${WS_PORT}`);
    for (const [zoneId] of rooms) {
      console.log(`[colyseus] room registered: ${zoneId}`);
    }
  });

  return { wss, rooms };
};
