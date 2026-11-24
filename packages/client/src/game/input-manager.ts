/**
 * Keyboard input -> normalized movement intent.
 * W/A/S/D and arrow keys. Direction is normalized so diagonals don't speed up.
 */

import Phaser from "phaser";

export class InputManager {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error("Phaser keyboard plugin is unavailable");
    }
    this.keys = {
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    };
  }

  getDirection(): { x: number; y: number } {
    let dx = 0;
    let dy = 0;
    if (this.keys.w?.isDown || this.keys.up?.isDown) dy -= 1;
    if (this.keys.s?.isDown || this.keys.down?.isDown) dy += 1;
    if (this.keys.a?.isDown || this.keys.left?.isDown) dx -= 1;
    if (this.keys.d?.isDown || this.keys.right?.isDown) dx += 1;

    const length = Math.hypot(dx, dy);
    return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
  }

  isPressed(key: string): boolean {
    const keyObj = this.keys[key];
    return keyObj ? keyObj.isDown : false;
  }
}
