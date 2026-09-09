import Phaser from 'phaser';
import type { Wukong } from '../entities/Wukong';
import { isGameplayGated } from '../../net/bind';
import { KIT_INPUT, kitBindings, type Binding } from '../input/bindings';
import { InputMap } from '../input/InputMap';
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
  private readonly input: InputMap;
  /** Slot *i* is the i-th name in the kit’s skill list — see `bindings.ts`. */
  private readonly slots: readonly Binding[];
  private readonly attackKey: Binding;

  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    private readonly player: Wukong,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('WukongController requires a keyboard plugin');

    const kit = KIT_INPUT['wukong'];
    this.input = new InputMap(keyboard, kitBindings('wukong'));
    this.slots = kit.slots;
    this.attackKey = kit.attack;
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
    const steer = this.input.axis();
    // Only the techniques take the assisted heading; `steer` stays raw for the
    // dash, which is a decision about where to go rather than about what to
    // hit. Deferred rather than computed here, because at most one of the
    // branches below runs and the scan is wasted on every frame that fires
    // nothing — which is nearly all of them.
    const aimed = () => autoAim(this.player, steer);
    if (this.input.pressed(this.slots[4])) {
      this.player.dash(steer);
    } else if (this.input.pressed(this.slots[3])) {
      this.player.castDragon(aimed());
    } else if (this.input.pressed(this.slots[2])) {
      this.player.castWrath(aimed());
    } else if (this.input.pressed(this.slots[1])) {
      this.player.castLance(aimed());
    } else if (this.input.pressed(this.slots[0])) {
      this.player.castNova(aimed());
    } else if (this.input.pressed(this.attackKey)) {
      this.player.attack(aimed());
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    this.player.move(this.input.axis(), this.input.sprinting());
  }

  /** Heading the dash should take, keyboard first then the touch stick. */

  destroy(): void {
    this.input.destroy();
  }
}

