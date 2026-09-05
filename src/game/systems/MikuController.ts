import Phaser from 'phaser';
import type { Miku } from '../entities/Miku';
import type { Vector2Like } from '../types';
import { isInputGated } from '../../net/bind';
import { consumePad, padMove } from '../touchPad';

/**
 * Keyboard bindings for Miku.
 *
 *   W A S D / arrows   move
 *   J                  Tinh Ca Tam Liên, the three-hit chain
 *   K                  Tinh Mang Trảm
 *   L                  Tinh Không Trận
 *   Space              Ảo Ảnh Bộ
 */
export class MikuController {
  private readonly keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    attack: Phaser.Input.Keyboard.Key[];
    starSlash: Phaser.Input.Keyboard.Key[];
    starArray: Phaser.Input.Keyboard.Key[];
    dash: Phaser.Input.Keyboard.Key[];
  };

  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Miku,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('MikuController requires a keyboard plugin');

    const addKeys = (...codes: number[]) => codes.map((code) => keyboard.addKey(code, false));
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys = {
      up: addKeys(K.W, K.UP),
      down: addKeys(K.S, K.DOWN),
      left: addKeys(K.A, K.LEFT),
      right: addKeys(K.D, K.RIGHT),
      attack: addKeys(K.J),
      starSlash: addKeys(K.K),
      starArray: addKeys(K.L),
      dash: addKeys(K.SPACE),
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.player.move({ x: 0, y: 0 });
  }

  update(time: number, delta: number): void {
    this.player.tick(time, delta);

    if (!this.enabled || this.player.isDead || isInputGated()) {
      if (!this.player.isDead) this.player.setVelocity(0, 0);
      return;
    }

    if (anyJustDown(this.keys.dash) || consumePad('skill2')) {
      this.player.dash(this.readSteer());
    } else if (anyJustDown(this.keys.starArray) || consumePad('skill1')) {
      this.player.castStarArray();
    } else if (anyJustDown(this.keys.starSlash) || consumePad('skill0')) {
      this.player.castStarSlash();
    } else if (anyJustDown(this.keys.attack) || consumePad('attack')) {
      this.player.attack();
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    this.player.move(this.readSteer());
  }

  private readSteer(): Vector2Like {
    const keys = this.readAxis();
    if (keys.x !== 0 || keys.y !== 0) return keys;
    const pad = padMove();
    return { x: pad.x, y: pad.y };
  }

  private readAxis(): Vector2Like {
    let x = 0;
    let y = 0;
    if (anyDown(this.keys.left)) x -= 1;
    if (anyDown(this.keys.right)) x += 1;
    if (anyDown(this.keys.up)) y -= 1;
    if (anyDown(this.keys.down)) y += 1;
    return { x, y };
  }

  destroy(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    for (const group of Object.values(this.keys)) {
      for (const key of group) keyboard.removeKey(key, true);
    }
  }
}

const anyDown = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((key) => key.isDown);

const anyJustDown = (keys: Phaser.Input.Keyboard.Key[]) =>
  keys.some((key) => Phaser.Input.Keyboard.JustDown(key));
