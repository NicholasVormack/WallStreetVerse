/**
 * Snapshot interpolation for remote players.
 *
 * Keeps a small buffer of authoritative snapshots per remote entity and lerps
 * between the two snapshots bracketing the target render time, so remote
 * movement stays smooth under jitter.
 */

import type { SnapshotEntity } from "@wallstreet/shared";

interface SnapshotEntry {
  tick: number;
  time: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class SnapshotBuffer {
  private readonly buffer: SnapshotEntry[] = [];
  private readonly maxSize = 60;

  add(snapshot: SnapshotEntity): void {
    this.buffer.push({
      tick: snapshot.tick,
      time: snapshot.tick,
      x: snapshot.x,
      y: snapshot.y,
      vx: snapshot.vx,
      vy: snapshot.vy,
    });
    if (this.buffer.length > this.maxSize) this.buffer.shift();
  }

  /**
   * Interpolated position at `renderTime` (ms). Target render time is
   * (now - interpolationDelay) to smooth out late packets.
   */
  interpolate(renderTime: number): { x: number; y: number } | null {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) {
      const e = this.buffer[0]!;
      return { x: e.x, y: e.y };
    }

    // Find the two snapshots bracketing renderTime.
    let i = 0;
    while (i < this.buffer.length - 1 && this.buffer[i + 1]!.time <= renderTime) i++;

    const a = this.buffer[i]!;
    const b = this.buffer[i + 1]!;
    if (!b) return { x: a.x, y: a.y };

    const span = b.time - a.time;
    const t = span === 0 ? 0 : (renderTime - a.time) / span;
    const clamped = Math.min(Math.max(t, 0), 1);
    return {
      x: a.x + (b.x - a.x) * clamped,
      y: a.y + (b.y - a.y) * clamped,
    };
  }

  getLatest(): SnapshotEntry | null {
    const last = this.buffer[this.buffer.length - 1];
    return last ? last : null;
  }
}
