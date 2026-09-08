import Phaser from 'phaser';
import type { KiemTien } from '../entities/KiemTien';
import type { Vector2Like } from '../types';
import { isGameplayGated } from '../../net/bind';
import { consumePad, padMove } from '../touchPad';
import { autoAim } from './autoAim';

/**
 * Keyboard bindings for Kiếm Tiên.
 *
 *   W A S D / arrows   move
 *   J                  Thanh Vân Kiếm Pháp, the single cut
 *   K                  Thanh Phong Trảm
 *   L                  Lạc Ảnh Kiếm Quang
 *   U                  Vạn Kiếm Quy Tông
 *   O                  Huyết Kiếm Sát
 *   Space              Ngự Kiếm Hành
 *
 * The same row as everyone else, with U and O carrying the two extra
 * techniques the way they do for Tôn Ngộ Không — she is the other kit with
 * four of them, and putting them anywhere else would make the shared J-K-L row
 * mean something different for one character.
 *
 * No sprint key: her sheet has no running stride, so there would be nothing to
 * show for it.
 *
 * The touch pad exposes three action buttons plus attack, so on touch she plays
 * with Thanh Phong Trảm, Lạc Ảnh Kiếm Quang and the flight; the two ultimates
 * are keyboard-only until the pad grows another slot. Doubling them onto an
 * existing button would make one button mean two things for one character,
 * which is worse than a technique that waits.
 */
export class KiemTienController {
  private readonly keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    attack: Phaser.Input.Keyboard.Key[];
    cut: Phaser.Input.Keyboard.Key[];
    lance: Phaser.Input.Keyboard.Key[];
    rain: Phaser.Input.Keyboard.Key[];
    blood: Phaser.Input.Keyboard.Key[];
    ride: Phaser.Input.Keyboard.Key[];
  };

  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: KiemTien,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('KiemTienController requires a keyboard plugin');

    const addKeys = (...codes: number[]) => codes.map((code) => keyboard.addKey(code, false));
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys = {
      up: addKeys(K.W, K.UP),
      down: addKeys(K.S, K.DOWN),
      left: addKeys(K.A, K.LEFT),
      right: addKeys(K.D, K.RIGHT),
      attack: addKeys(K.J),
      cut: addKeys(K.K),
      lance: addKeys(K.L),
      rain: addKeys(K.U),
      blood: addKeys(K.O),
      ride: addKeys(K.SPACE),
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.player.move({ x: 0, y: 0 });
  }

  update(time: number, delta: number): void {
    this.player.tick(time, delta);

    if (!this.enabled || this.player.isDead || isGameplayGated()) {
      if (!this.player.isDead) this.player.setVelocity(0, 0);
      return;
    }

    // Actions are checked before movement so a press wins the frame. That is
    // also why each is handed the heading held right now: `move` has not run
    // yet, so the facing on the sprite is one frame old, and pressing a
    // direction and a technique together used to fire it the way she was
    // already looking. The order below is the priority when two land in the
    // same frame: the flight first, since it is the escape.
    const steer = this.readSteer();
    // Only the techniques take the assisted heading; `steer` stays raw for the
    // dash, which is a decision about where to go rather than about what to
    // hit. Deferred rather than computed here, because at most one of the
    // branches below runs and the scan is wasted on every frame that fires
    // nothing — which is nearly all of them.
    const aimed = () => autoAim(this.player, steer);
    if (anyJustDown(this.keys.ride) || consumePad('skill2')) {
      this.player.dash(steer);
    } else if (anyJustDown(this.keys.blood)) {
      this.player.castBlood(aimed());
    } else if (anyJustDown(this.keys.rain)) {
      this.player.castRain(aimed());
    } else if (anyJustDown(this.keys.lance) || consumePad('skill1')) {
      this.player.castLance(aimed());
    } else if (anyJustDown(this.keys.cut) || consumePad('skill0')) {
      this.player.castCut(aimed());
    } else if (anyJustDown(this.keys.attack) || consumePad('attack')) {
      this.player.attack(aimed());
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    const keys = this.readKeys();
    const usingKeys = keys.x !== 0 || keys.y !== 0;
    const pad = padMove();
    this.player.move(usingKeys ? keys : { x: pad.x, y: pad.y });
  }

  /** Heading an action should take, keyboard first then the touch stick. */
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
