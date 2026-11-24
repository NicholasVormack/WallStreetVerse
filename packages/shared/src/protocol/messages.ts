/**
 * Network message types exchanged between client and server.
 * Client -> Server messages are validated with zod on arrival.
 */

export const MessageType = {
  // Client -> Server
  INPUT: "input",
  PING: "ping",
  JOIN_REQUEST: "join-request",
  // Server -> Client
  SNAPSHOT: "snapshot",
  PONG: "pong",
  TRANSFER: "transfer",
  ERROR: "error",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export interface ServerError {
  code: string;
  message: string;
  tick?: number;
}
