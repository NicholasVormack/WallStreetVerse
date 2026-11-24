/// <reference types="vite/client" />

/**
 * Main Phaser scene.
 *
 * Renders the zone it is in - floor grid, collision geometry, portals - plus:
 *   - the local player (predicted, server-reconciled) in cyan
 *   - remote players interpolated from snapshots in magenta, with name labels
 *   - a simulated market ticker and a per-zone market panel
 *   - F3 debug overlay: wireframes, snapshot trails, telemetry
 *
 * Position authority comes from snapshots via the transport callbacks. The
 * scene is transport-agnostic: `Network` when a server URL is configured,
 * `LocalServer` (the in-browser demo) otherwise.
 */

import Phaser from "phaser";
import { MAX_SPEED, MAP_BOUNDS, PLAYER_RADIUS, TICK_RATE } from "@wallstreet/shared";
import { ClientLoop } from "./client-loop.js";
import { InputManager } from "./input-manager.js";
import { SnapshotBuffer } from "./interpolation.js";
import { LocalServer } from "./local-server.js";
import { Market } from "./market.js";
import { Network } from "./network.js";
import type { Transport } from "./transport.js";
import { ZONES, zoneOf } from "./zones.js";
import type { NetworkCallbacks, SnapshotEntity, ZoneId } from "../types.js";

const LOCAL_COLOR = 0x00ffff;
const REMOTE_COLOR = 0xff00ff;
const DEBUG_COLOR = 0x39ff14;
const PANEL_BG = 0x0a0e14;
const PANEL_BORDER = 0x223040;
const TEXT_DIM = "#7d8597";
const TEXT_MAIN = "#e6edf5";

const TICKER_HEIGHT = 74;
const PANEL_WIDTH = 430;
const MARKET_ROWS = 5;

interface RemotePlayer {
  readonly buffer: SnapshotBuffer;
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
}

interface MarketRow {
  readonly symbol: Phaser.GameObjects.Text;
  readonly price: Phaser.GameObjects.Text;
  readonly change: Phaser.GameObjects.Text;
}

export class MainScene extends Phaser.Scene {
  private transport!: Transport;
  private readonly market = new Market();

  private keyboard!: InputManager;
  private local!: ClientLoop;
  private f3Key!: Phaser.Input.Keyboard.Key;

  private floorLayer!: Phaser.GameObjects.Graphics;
  private portalLabels: Phaser.GameObjects.Text[] = [];
  private playerLayer!: Phaser.GameObjects.Graphics;
  private debugLayer!: Phaser.GameObjects.Graphics;

  private readonly remotes = new Map<string, RemotePlayer>();

  private zoneId: ZoneId = "wallstreet";
  private zoneTitle!: Phaser.GameObjects.Text;
  private zoneTagline!: Phaser.GameObjects.Text;
  private telemetryText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private panelTitle!: Phaser.GameObjects.Text;
  private tickerTexts: Phaser.GameObjects.Text[] = [];
  private marketRows: MarketRow[] = [];

  private debugEnabled = false;
  private snapshotCount = 0;
  private displayedTickRate = 0;
  private rtt = 0;
  private lastPingAt = 0;
  private lastMarketDraw = 0;

  constructor() {
    super({ key: "MainScene" });
  }

  async create(): Promise<void> {
    const configuredUrl = import.meta.env.VITE_WS_URL as string | undefined;
    this.transport = configuredUrl ? new Network(configuredUrl) : new LocalServer();

    this.floorLayer = this.add.graphics().setDepth(0);
    this.playerLayer = this.add.graphics().setDepth(10);
    this.debugLayer = this.add.graphics().setDepth(20);

    this.buildHud();
    this.drawZone(this.zoneId);

    this.keyboard = new InputManager(this);
    this.local = new ClientLoop();
    this.f3Key = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F3);

    this.transport.connect(this.callbacks());

    this.time.addEvent({
      delay: 1000,
      callback: this.updateTelemetry,
      callbackScope: this,
      loop: true,
    });

    try {
      await this.transport.joinZone(this.zoneId);
    } catch (error) {
      this.statusText.setText(`Connection failed: ${String(error)}`);
    }
  }

  private callbacks(): NetworkCallbacks {
    return {
      onSnapshot: (entities) => this.handleSnapshot(entities),
      onTransfer: (payload) => this.handleTransfer(payload.targetZone, payload.token),
      onPong: (payload) => {
        this.rtt = Date.now() - payload.timestamp;
      },
      onError: (payload) => {
        this.statusText.setText(`[${payload.code}] ${payload.message}`);
      },
      onJoin: () => {
        this.statusText.setText(this.transport.demo ? "LOCAL DEMO" : "CONNECTED");
      },
      onLeave: (sessionId) => this.removeRemote(sessionId),
    };
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                */
  /* ------------------------------------------------------------------ */

  private buildHud(): void {
    this.zoneTitle = this.add
      .text(40, 32, "", { fontFamily: "monospace", fontSize: "30px", color: "#ffffff" })
      .setDepth(100);
    this.zoneTagline = this.add
      .text(40, 72, "", { fontFamily: "monospace", fontSize: "15px", color: TEXT_DIM })
      .setDepth(100);
    this.telemetryText = this.add
      .text(40, 104, "", { fontFamily: "monospace", fontSize: "15px", color: TEXT_DIM })
      .setDepth(100);
    this.add
      .text(
        40,
        MAP_BOUNDS.maxY - TICKER_HEIGHT - 42,
        "WASD / arrows to move   ·   F3 debug overlay   ·   walk into a glowing portal to change zone",
        { fontFamily: "monospace", fontSize: "14px", color: TEXT_DIM },
      )
      .setDepth(100);
    this.statusText = this.add
      .text(MAP_BOUNDS.maxX - 40, 36, "", { fontFamily: "monospace", fontSize: "14px", color: "#4cc9f0" })
      .setOrigin(1, 0)
      .setDepth(100);

    this.buildMarketPanel();
    this.buildTicker();
  }

  private buildMarketPanel(): void {
    const x = MAP_BOUNDS.maxX - PANEL_WIDTH - 40;
    const y = 120;
    const height = 96 + MARKET_ROWS * 34;

    const panel = this.add.graphics().setDepth(90);
    panel.fillStyle(PANEL_BG, 0.92);
    panel.fillRoundedRect(x, y, PANEL_WIDTH, height, 10);
    panel.lineStyle(1, PANEL_BORDER, 1);
    panel.strokeRoundedRect(x, y, PANEL_WIDTH, height, 10);

    this.panelTitle = this.add
      .text(x + 20, y + 18, "", { fontFamily: "monospace", fontSize: "14px", color: "#4cc9f0" })
      .setDepth(95);
    this.add
      .text(x + 20, y + 40, "simulated data · updates 4×/s", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: TEXT_DIM,
      })
      .setDepth(95);

    for (let index = 0; index < MARKET_ROWS; index += 1) {
      const rowY = y + 70 + index * 34;
      this.marketRows.push({
        symbol: this.add
          .text(x + 20, rowY, "", { fontFamily: "monospace", fontSize: "15px", color: TEXT_MAIN })
          .setDepth(95),
        price: this.add
          .text(x + 250, rowY, "", { fontFamily: "monospace", fontSize: "15px", color: TEXT_MAIN })
          .setOrigin(1, 0)
          .setDepth(95),
        change: this.add
          .text(x + PANEL_WIDTH - 20, rowY, "", {
            fontFamily: "monospace",
            fontSize: "15px",
            color: TEXT_MAIN,
          })
          .setOrigin(1, 0)
          .setDepth(95),
      });
    }
  }

  private buildTicker(): void {
    const y = MAP_BOUNDS.maxY - TICKER_HEIGHT;
    const strip = this.add.graphics().setDepth(90);
    strip.fillStyle(PANEL_BG, 0.96);
    strip.fillRect(0, y, MAP_BOUNDS.maxX, TICKER_HEIGHT);
    strip.lineStyle(1, PANEL_BORDER, 1);
    strip.lineBetween(0, y, MAP_BOUNDS.maxX, y);

    const slots = this.market.all.length;
    const slotWidth = MAP_BOUNDS.maxX / slots;
    for (let index = 0; index < slots; index += 1) {
      this.tickerTexts.push(
        this.add
          .text(slotWidth * index + slotWidth / 2, y + TICKER_HEIGHT / 2, "", {
            fontFamily: "monospace",
            fontSize: "14px",
            color: TEXT_MAIN,
          })
          .setOrigin(0.5)
          .setDepth(95),
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Zone rendering                                                     */
  /* ------------------------------------------------------------------ */

  private drawZone(zoneId: ZoneId): void {
    const zone = zoneOf(zoneId);
    this.zoneId = zoneId;

    this.floorLayer.clear();
    this.floorLayer.fillStyle(zone.theme.floor, 1);
    this.floorLayer.fillRect(0, 0, MAP_BOUNDS.maxX, MAP_BOUNDS.maxY);

    // Grid.
    this.floorLayer.lineStyle(1, zone.theme.grid, 0.85);
    for (let x = 0; x <= MAP_BOUNDS.maxX; x += 60) {
      this.floorLayer.lineBetween(x, 0, x, MAP_BOUNDS.maxY);
    }
    for (let y = 0; y <= MAP_BOUNDS.maxY; y += 60) {
      this.floorLayer.lineBetween(0, y, MAP_BOUNDS.maxX, y);
    }

    // Obstacles.
    this.floorLayer.fillStyle(0x1b2733, 1);
    this.floorLayer.lineStyle(1.5, zone.theme.accent, 0.32);
    for (const obstacle of zone.obstacles) {
      if ("radius" in obstacle) {
        this.floorLayer.fillCircle(obstacle.centerX, obstacle.centerY, obstacle.radius);
        this.floorLayer.strokeCircle(obstacle.centerX, obstacle.centerY, obstacle.radius);
        continue;
      }
      const width = obstacle.maxX - obstacle.minX;
      const height = obstacle.maxY - obstacle.minY;
      this.floorLayer.fillRect(obstacle.minX, obstacle.minY, width, height);
      this.floorLayer.strokeRect(obstacle.minX, obstacle.minY, width, height);
    }

    // Portals.
    for (const label of this.portalLabels) label.destroy();
    this.portalLabels = [];

    for (const portal of zone.portals) {
      const { minX, minY, maxX, maxY } = portal.bounds;
      const width = maxX - minX;
      const height = maxY - minY;
      this.floorLayer.fillStyle(zone.theme.accent, 0.24);
      this.floorLayer.fillRoundedRect(minX, minY, width, height, 6);
      this.floorLayer.lineStyle(2, zone.theme.accent, 0.95);
      this.floorLayer.strokeRoundedRect(minX, minY, width, height, 6);

      // Portals on the map edge would centre their label off-screen.
      const labelX = Math.min(Math.max(minX + width / 2, 110), MAP_BOUNDS.maxX - 110);
      const labelY = Math.min(Math.max(minY + height / 2, 40), MAP_BOUNDS.maxY - 40);
      const label = this.add
        .text(labelX, labelY, `\u21aa ${portal.label}`, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#dbe7f3",
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(5);
      this.portalLabels.push(label);
    }

    this.zoneTitle.setText(zone.name);
    this.zoneTitle.setColor(`#${zone.theme.accent.toString(16).padStart(6, "0")}`);
    this.zoneTagline.setText(zone.theme.tagline);
    this.panelTitle.setText(
      zone.theme.market === "equity"
        ? "EQUITIES"
        : zone.theme.market === "crypto"
          ? "DIGITAL ASSETS"
          : "MIXED MARKET",
    );
  }

  /* ------------------------------------------------------------------ */
  /* Frame loop                                                         */
  /* ------------------------------------------------------------------ */

  public override update(time: number, delta: number): void {
    this.market.update(delta);

    const direction = this.keyboard.getDirection();
    const dt = delta / 1000;
    const moving = direction.x !== 0 || direction.y !== 0;

    if (moving) {
      this.local.applyInput(direction.x, direction.y, dt);
      this.transport.sendInput(direction.x, direction.y, dt);
    }

    if (time - this.lastPingAt > 1000) {
      this.transport.sendPing();
      this.lastPingAt = time;
    }

    if (Phaser.Input.Keyboard.JustDown(this.f3Key)) {
      this.debugEnabled = !this.debugEnabled;
    }

    this.renderPlayers(time);

    if (time - this.lastMarketDraw > 240) {
      this.lastMarketDraw = time;
      this.renderMarket();
    }
  }

  private renderPlayers(time: number): void {
    this.playerLayer.clear();

    const position = this.local.getPosition();
    const velocity = this.local.getVelocity();

    this.playerLayer.fillStyle(LOCAL_COLOR, 0.55);
    this.playerLayer.fillCircle(position.x, position.y, PLAYER_RADIUS);
    this.playerLayer.lineStyle(2, LOCAL_COLOR, 1);
    this.playerLayer.strokeCircle(position.x, position.y, PLAYER_RADIUS);
    this.playerLayer.lineBetween(
      position.x,
      position.y,
      position.x + (velocity.vx / MAX_SPEED) * 46,
      position.y + (velocity.vy / MAX_SPEED) * 46,
    );

    // Render remotes 100ms in the past so a late packet still has a bracket.
    const renderTime = time - 100;
    for (const remote of this.remotes.values()) {
      const interpolated = remote.buffer.interpolate(renderTime);
      if (!interpolated) continue;
      remote.gfx.clear();
      remote.gfx.fillStyle(REMOTE_COLOR, 0.45);
      remote.gfx.fillCircle(interpolated.x, interpolated.y, PLAYER_RADIUS);
      remote.gfx.lineStyle(2, REMOTE_COLOR, 1);
      remote.gfx.strokeCircle(interpolated.x, interpolated.y, PLAYER_RADIUS);
      remote.label.setPosition(interpolated.x, interpolated.y - PLAYER_RADIUS - 16);
    }

    if (!this.debugEnabled) {
      this.debugLayer.clear();
      this.telemetryText.setText(
        `fps ${Math.round(this.game.loop.actualFps)}   tick ${TICK_RATE}/s   rtt ${this.rtt}ms   peers ${this.remotes.size}`,
      );
      return;
    }

    this.debugLayer.clear();
    this.debugLayer.lineStyle(1, DEBUG_COLOR, 0.75);
    this.debugLayer.strokeRect(
      position.x - PLAYER_RADIUS,
      position.y - PLAYER_RADIUS,
      PLAYER_RADIUS * 2,
      PLAYER_RADIUS * 2,
    );
    for (const remote of this.remotes.values()) {
      const latest = remote.buffer.getLatest();
      if (!latest) continue;
      this.debugLayer.lineStyle(1, DEBUG_COLOR, 0.45);
      this.debugLayer.strokeCircle(latest.x, latest.y, PLAYER_RADIUS);
      this.debugLayer.lineBetween(latest.x, latest.y, position.x, position.y);
    }
    this.telemetryText.setText(
      `fps ${Math.round(this.game.loop.actualFps)}   tick ${TICK_RATE}/s   observed ${this.displayedTickRate}/s   rtt ${this.rtt}ms   peers ${this.remotes.size}   DEBUG`,
    );
  }

  private renderMarket(): void {
    const zone = zoneOf(this.zoneId);
    const quotes = this.market.byKind(zone.theme.market).slice(0, MARKET_ROWS);

    for (let index = 0; index < this.marketRows.length; index += 1) {
      const row = this.marketRows[index];
      if (!row) continue;
      const quote = quotes[index];
      if (!quote) {
        row.symbol.setText("");
        row.price.setText("");
        row.change.setText("");
        continue;
      }
      row.symbol.setText(`${quote.symbol}  ${quote.name}`);
      row.price.setText(`$${Market.formatPrice(quote)}`);
      row.change.setText(Market.formatChange(quote));
      const color = `#${Market.changeColor(quote).toString(16).padStart(6, "0")}`;
      row.change.setColor(color);
      row.price.setColor(color);
    }

    const ticker = this.market.all;
    for (let index = 0; index < this.tickerTexts.length; index += 1) {
      const text = this.tickerTexts[index];
      const quote = ticker[index];
      if (!text || !quote) continue;
      text.setText(`${quote.symbol} $${Market.formatPrice(quote)} ${Market.formatChange(quote)}`);
      text.setColor(`#${Market.changeColor(quote).toString(16).padStart(6, "0")}`);
    }
  }

  private updateTelemetry(): void {
    this.displayedTickRate = this.snapshotCount;
    this.snapshotCount = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Transport callbacks                                                */
  /* ------------------------------------------------------------------ */

  private handleSnapshot(entities: SnapshotEntity[]): void {
    const sessionId = this.transport.sessionId;
    this.snapshotCount += 1;

    for (const entity of entities) {
      if (entity.sessionId === sessionId) {
        this.local.reconcile(entity);
        continue;
      }
      let remote = this.remotes.get(entity.sessionId);
      if (!remote) {
        remote = this.createRemote(entity.sessionId);
        this.remotes.set(entity.sessionId, remote);
      }
      remote.buffer.add(entity);
    }

    const present = new Set(entities.map((entity) => entity.sessionId));
    for (const remoteId of [...this.remotes.keys()]) {
      if (!present.has(remoteId)) this.removeRemote(remoteId);
    }
  }

  private createRemote(sessionId: string): RemotePlayer {
    return {
      buffer: new SnapshotBuffer(),
      gfx: this.add.graphics().setDepth(12),
      label: this.add
        .text(0, 0, sessionId, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#ff9df5",
        })
        .setOrigin(0.5)
        .setDepth(13),
    };
  }

  private removeRemote(sessionId: string): void {
    const remote = this.remotes.get(sessionId);
    if (!remote) return;
    remote.gfx.destroy();
    remote.label.destroy();
    this.remotes.delete(sessionId);
  }

  private handleTransfer(targetZone: ZoneId, token: string): void {
    this.drawZone(targetZone);
    this.statusText.setText(`Transferring to ${zoneOf(targetZone).name}...`);
    void this.transport.transferTo(targetZone, token);
  }
}

/** Exported for tests and tooling that needs the zone list. */
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];
