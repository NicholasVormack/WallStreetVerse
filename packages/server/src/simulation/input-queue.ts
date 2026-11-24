/**
 * Per-client timestamped movement input queue.
 *
 * The server is authoritative: it applies inputs in sequence order during each
 * fixed tick and tracks the last acknowledged sequence for client reconciliation.
 */

import type { MovementInput } from "@wallstreet/shared";

interface QueuedInput {
  readonly input: MovementInput;
  readonly serverReceiveTick: number;
}

export class InputQueue {
  private readonly queue: QueuedInput[] = [];
  private lastSeq = -1;

  enqueue(input: MovementInput, serverReceiveTick: number): void {
    // Drop stale or duplicate inputs.
    if (input.seq <= this.lastSeq) return;
    this.queue.push({ input, serverReceiveTick });
  }

  /**
   * Drain and return all inputs up to and including `currentSeq`, advancing the
   * acknowledged sequence watermark. Call once per fixed tick per client.
   */
  drainUpTo(currentSeq: number): MovementInput[] {
    const drained: MovementInput[] = [];
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (!next) break;
      if (next.input.seq > currentSeq) break;
      drained.push(this.queue.shift()!.input);
      this.lastSeq = next.input.seq;
    }
    return drained;
  }

  get size(): number {
    return this.queue.length;
  }

  get lastAckedSeq(): number {
    return this.lastSeq;
  }
}
