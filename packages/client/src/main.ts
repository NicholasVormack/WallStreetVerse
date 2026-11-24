/**
 * Browser entry point.
 *
 * The Phase 1 tree referenced this file from index.html but never contained it,
 * so the client could not build at all. Creating the Scene object here and
 * letting Phaser boot it is deliberately the only thing this file does; every
 * other decision lives in `game/scene.ts`.
 */

import Phaser from "phaser";
import { MainScene } from "./game/scene.js";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 1920,
  height: 1080,
  backgroundColor: "#070a10",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scene: [MainScene],
  banner: false,
};

const hideBootOverlay = (): void => {
  // Removed outright rather than faded: the canvas underneath is already
  // painted, so a fade only risks showing the overlay over a live game.
  document.getElementById("boot")?.remove();
};

/**
 * Keep the canvase fitted to its container.
 *
 * Phaser's ScaleManager measures the parent once at boot. In an embedded or
 * resized panel that initial measurement can be stale, which leaves a 1920x1080
 * canvas centred and cropped. Observing the parent re-runs the FIT calculation
 * whenever the available space actually changes.
 */
let resizeObserver: ResizeObserver | undefined;

const fitToParent = (game: Phaser.Game): void => {
  const parent = document.getElementById("app");
  if (!parent || typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver(() => game.scale.refresh());
  resizeObserver.observe(parent);
};

const start = (): void => {
  const game = new Phaser.Game(config);
  // Expose the instance for debugging from the console without a global shim.
  (window as unknown as { game?: Phaser.Game }).game = game;
  fitToParent(game);
  game.events.once(Phaser.Core.Events.READY, hideBootOverlay);
  // Belt and braces: never leave the overlay covering a running game.
  window.setTimeout(hideBootOverlay, 2500);
};

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
