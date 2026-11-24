/**
 * Timestamped client movement input.
 *
 * The client never sends raw (x, y) coordinates. It sends an input intent
 * vector per tick, which the server validates and applies authoritatively.
 */

export interface MovementInput {
  /** Monotonically increasing input sequence number per client session. */
  readonly seq: number;
  /** Normalized x component of the intended movement direction (-1..1). */
  readonly dx: number;
  /** Normalized y component of the intended movement direction (-1..1). */
  readonly dy: number;
  /** Delta time in seconds since the previous input. */
  readonly dt: number;
  /** Client monotonic timestamp (ms) when the input was generated. */
  readonly timestamp: number;
}

export interface InputIntent {
  readonly type: "movement";
  readonly input: MovementInput;
}

export const isMovementInput = (value: unknown): value is MovementInput => {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.seq === "number" &&
    typeof obj.dx === "number" &&
    typeof obj.dy === "number" &&
    typeof obj.dt === "number" &&
    typeof obj.timestamp === "number"
  );
};

export const clampInputVector = (input: MovementInput): MovementInput => {
  const length = Math.hypot(input.dx, input.dy);
  if (length > 1) {
    return { ...input, dx: input.dx / length, dy: input.dy / length };
  }
  return input;
};
