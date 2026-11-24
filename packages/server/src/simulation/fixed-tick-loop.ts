/**
 * Deterministic fixed-tick simulation loop.
 *
 * Runs the simulation callback at a fixed interval (20Hz / 50ms) using an
 * accumulator so the tick rate is stable regardless of wall-clock jitter.
 * The loop is owned by a single Colyseus room, making simulation
 * deterministic per room.
 */

export class FixedTickLoop {
  private readonly tickIntervalMs: number;
  private readonly tick: () => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(tick: () => void, tickIntervalMs: number = 50) {
    this.tick = tick;
    this.tickIntervalMs = tickIntervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(this.tick, this.tickIntervalMs);
    // eslint-disable-next-line no-bitwise
    if (this.timer && typeof this.timer.unref === "function") this.timer.unref();
  }

  stop(): void {
    if (!this.running || !this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
