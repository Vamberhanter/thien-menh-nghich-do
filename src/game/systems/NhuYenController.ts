import Phaser from 'phaser';
import type { NhuYen } from '../entities/NhuYen';
import type { Vector2Like } from '../types';
import { isGameplayGated } from '../../net/bind';
import { consumePad, padMove } from '../touchPad';

/**
 * Keyboard bindings for Như Yên. Kept in her own controller rather than a
 * shared one: she has four action keys plus a held sprint modifier, and
 * threading all of that through one controller with capability checks reads
 * worse than a small controller per character.
 *
 *   W A S D / arrows   move
 *   Shift (held)       sprint — the sheet has a dedicated side-on running row
 *   J                  Hàn Băng Tam Thức, the three-hit chain
 *   K                  Băng Phách Trảm
 *   L                  Băng Tinh Trận
 *   Space              Sương Ảnh Bộ
 */
export class NhuYenController {
  private readonly keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    sprint: Phaser.Input.Keyboard.Key[];
    attack: Phaser.Input.Keyboard.Key[];
    qiSlash: Phaser.Input.Keyboard.Key[];
    iceArray: Phaser.Input.Keyboard.Key[];
    dash: Phaser.Input.Keyboard.Key[];
    ultimate: Phaser.Input.Keyboard.Key[];
  };

  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: NhuYen,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('NhuYenController requires a keyboard plugin');

    const addKeys = (...codes: number[]) => codes.map((code) => keyboard.addKey(code, false));
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys = {
      up: addKeys(K.W, K.UP),
      down: addKeys(K.S, K.DOWN),
      left: addKeys(K.A, K.LEFT),
      right: addKeys(K.D, K.RIGHT),
      sprint: addKeys(K.SHIFT),
      attack: addKeys(K.J),
      qiSlash: addKeys(K.K),
      iceArray: addKeys(K.L),
      dash: addKeys(K.SPACE),
      ultimate: addKeys(K.U),
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.player.move({ x: 0, y: 0 });
  }

  /** Call from the scene's `update`. */
  update(time: number, delta: number): void {
    this.player.tick(time, delta);

    if (!this.enabled || this.player.isDead || isGameplayGated()) {
      if (!this.player.isDead) this.player.setVelocity(0, 0);
      return;
    }

    // Actions are checked before movement so a press wins the frame. That is
    // also why every one of them is handed the heading held right now: `move`
    // has not run yet this frame, so the facing on the sprite is one frame old,
    // and pressing a direction and a skill together used to fire the skill the
    // way the character was already looking. Order below sets the priority when
    // two land together: dash first, since it is the escape.
    const steer = this.readSteer();
    if (anyJustDown(this.keys.ultimate) || consumePad('skill3')) {
      this.player.castUltimate(steer);
    } else if (anyJustDown(this.keys.dash) || consumePad('skill2')) {
      this.player.dash(steer);
    } else if (anyJustDown(this.keys.iceArray) || consumePad('skill1')) {
      this.player.castIceArray(steer);
    } else if (anyJustDown(this.keys.qiSlash) || consumePad('skill0')) {
      this.player.castQiSlash(steer);
    } else if (anyJustDown(this.keys.attack) || consumePad('attack')) {
      this.player.attack(steer);
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    const keys = this.readKeys();
    const usingKeys = keys.x !== 0 || keys.y !== 0;
    const pad = padMove();
    this.player.move(usingKeys ? keys : { x: pad.x, y: pad.y }, usingKeys ? anyDown(this.keys.sprint) : pad.sprint);
  }

  /** Heading held right now: keyboard first, then the touch stick. */
  private readSteer(): Vector2Like {
    const keys = this.readKeys();
    if (keys.x !== 0 || keys.y !== 0) return keys;
    const pad = padMove();
    return { x: pad.x, y: pad.y };
  }

  private readKeys(): Vector2Like {
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
