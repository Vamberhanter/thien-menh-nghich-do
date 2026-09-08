import Phaser from 'phaser';
import type { Wukong } from '../entities/Wukong';
import type { Vector2Like } from '../types';
import { isGameplayGated } from '../../net/bind';
import { consumePad, padMove } from '../touchPad';
import { autoAim } from './autoAim';

/**
 * Keyboard bindings for Tôn Ngộ Không.
 *
 *   W A S D / arrows   move
 *   Shift (held)       sprint — his sheet has dedicated running rows
 *   J                  Cửu Chuyển Côn Pháp, the four-beat staff chain
 *   K                  Cửu U Nộ Diễm
 *   L                  Hàng Ma Chân Lôi
 *   U                  Phần Thiên Ma Diễm
 *   O                  Ma Nguyệt Trảm
 *   Space              Cân Đẩu Vân
 *
 * U and O are the odd ones out, and they are his because he is the only
 * character with a third and fourth technique. They sit off the J-K-L row on
 * purpose: those are the keys every kit shares, and putting the extras back
 * among them would make the shared row mean something different for one
 * character.
 *
 * The touch pad only exposes three action buttons plus attack, so on touch he
 * plays with Cửu U Nộ Diễm, Hàng Ma Chân Lôi and the cloud dash; the other two
 * are keyboard-only. Doubling them up on an existing button would have made one
 * button mean two things for one character, which is worse than a technique
 * that waits for the pad to grow another slot.
 */
export class WukongController {
  private readonly keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
    sprint: Phaser.Input.Keyboard.Key[];
    attack: Phaser.Input.Keyboard.Key[];
    nova: Phaser.Input.Keyboard.Key[];
    lance: Phaser.Input.Keyboard.Key[];
    wrath: Phaser.Input.Keyboard.Key[];
    dragon: Phaser.Input.Keyboard.Key[];
    dash: Phaser.Input.Keyboard.Key[];
  };

  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Wukong,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('WukongController requires a keyboard plugin');

    const addKeys = (...codes: number[]) => codes.map((code) => keyboard.addKey(code, false));
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys = {
      up: addKeys(K.W, K.UP),
      down: addKeys(K.S, K.DOWN),
      left: addKeys(K.A, K.LEFT),
      right: addKeys(K.D, K.RIGHT),
      sprint: addKeys(K.SHIFT),
      attack: addKeys(K.J),
      nova: addKeys(K.K),
      lance: addKeys(K.L),
      wrath: addKeys(K.U),
      dragon: addKeys(K.O),
      dash: addKeys(K.SPACE),
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.player.move({ x: 0, y: 0 });
  }

  update(time: number, delta: number): void {
    this.player.tick(time, delta);

    // The wide gate, like the other three kits: the lobby overlay, the pause
    // menu, and a focused HUD field all have to stop him. He was written
    // against `isInputGated`, which is only the lobby, so typing a message
    // containing "k" threw Cửu U Nộ Diễm across the room.
    if (!this.enabled || this.player.isDead || isGameplayGated()) {
      if (!this.player.isDead) this.player.setVelocity(0, 0);
      return;
    }

    // Actions are checked before movement so a press wins the frame. That is
    // also why every one of them is handed the heading held right now: `move`
    // has not run yet this frame, so the facing on the sprite is one frame old,
    // and pressing a direction and a skill together used to fire the skill the
    // way he was already looking. Order below sets the priority when two land
    // together: dash first, since it is the escape.
    const steer = this.readSteer();
    // Only the techniques take the assisted heading; `steer` stays raw for the
    // dash, which is a decision about where to go rather than about what to
    // hit. Deferred rather than computed here, because at most one of the
    // branches below runs and the scan is wasted on every frame that fires
    // nothing — which is nearly all of them.
    const aimed = () => autoAim(this.player, steer);
    if (anyJustDown(this.keys.dash) || consumePad('skill2')) {
      this.player.dash(steer);
    } else if (anyJustDown(this.keys.dragon)) {
      this.player.castDragon(aimed());
    } else if (anyJustDown(this.keys.wrath)) {
      this.player.castWrath(aimed());
    } else if (anyJustDown(this.keys.lance) || consumePad('skill1')) {
      this.player.castLance(aimed());
    } else if (anyJustDown(this.keys.nova) || consumePad('skill0')) {
      this.player.castNova(aimed());
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
    this.player.move(
      usingKeys ? keys : { x: pad.x, y: pad.y },
      usingKeys ? anyDown(this.keys.sprint) : pad.sprint,
    );
  }

  /** Heading the dash should take, keyboard first then the touch stick. */
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
