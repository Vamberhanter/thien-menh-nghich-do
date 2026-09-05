import Phaser from 'phaser';
import type { LinYuan } from '../entities/LinYuan';
import type { Vector2Like } from '../types';
import { isInputGated } from '../../net/bind';
import { consumePad, padMove } from '../touchPad';

export interface ControllerKeys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  attack: Phaser.Input.Keyboard.Key[];
  skill: Phaser.Input.Keyboard.Key[];
}

/**
 * Translates keyboard input into character actions. All input, facing and
 * state-gating logic lives here — scenes only call `update`.
 */
export class CharacterController {
  private readonly keys: ControllerKeys;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: LinYuan,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('CharacterController requires a keyboard plugin');

    const addKeys = (...codes: number[]) =>
      codes.map((code) => keyboard.addKey(code, false));
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys = {
      up: addKeys(K.W, K.UP),
      down: addKeys(K.S, K.DOWN),
      left: addKeys(K.A, K.LEFT),
      right: addKeys(K.D, K.RIGHT),
      attack: addKeys(K.J),
      skill: addKeys(K.K),
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.player.move({ x: 0, y: 0 });
  }

  /** Call from the scene's `update`. */
  update(time: number, delta: number): void {
    this.player.tick(time, delta);

    if (!this.enabled || this.player.isDead || isInputGated()) {
      this.player.setVelocity(0, 0);
      return;
    }

    // Action inputs are checked first: they win over movement this frame.
    if (anyJustDown(this.keys.attack) || consumePad('attack')) {
      this.player.attack();
    } else if (anyJustDown(this.keys.skill) || consumePad('skill0')) {
      this.player.castSkill();
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    this.player.move(this.readAxis());
  }

  private readAxis(): Vector2Like {
    let x = 0;
    let y = 0;
    if (anyDown(this.keys.left)) x -= 1;
    if (anyDown(this.keys.right)) x += 1;
    if (anyDown(this.keys.up)) y -= 1;
    if (anyDown(this.keys.down)) y += 1;
    if (x !== 0 || y !== 0) return { x, y };
    const pad = padMove();
    return { x: pad.x, y: pad.y };
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
