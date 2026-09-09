import Phaser from 'phaser';
import type { NhuYen } from '../entities/NhuYen';
import { isGameplayGated } from '../../net/bind';
import { KIT_INPUT, kitBindings, type Binding } from '../input/bindings';
import { InputMap } from '../input/InputMap';
import { autoAim } from './autoAim';

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
  private readonly input: InputMap;
  /** Slot *i* is the i-th name in the kit’s skill list — see `bindings.ts`. */
  private readonly slots: readonly Binding[];
  private readonly attackKey: Binding;

  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    private readonly player: NhuYen,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('NhuYenController requires a keyboard plugin');

    const kit = KIT_INPUT['nhuyen'];
    this.input = new InputMap(keyboard, kitBindings('nhuyen'));
    this.slots = kit.slots;
    this.attackKey = kit.attack;
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
    const steer = this.input.axis();
    // Only the techniques take the assisted heading; `steer` stays raw for the
    // dash, which is a decision about where to go rather than about what to
    // hit. Deferred rather than computed here, because at most one of the
    // branches below runs and the scan is wasted on every frame that fires
    // nothing — which is nearly all of them.
    const aimed = () => autoAim(this.player, steer);
    if (this.input.pressed(this.slots[3])) {
      this.player.castUltimate(aimed());
    } else if (this.input.pressed(this.slots[2])) {
      this.player.dash(steer);
    } else if (this.input.pressed(this.slots[1])) {
      this.player.castIceArray(aimed());
    } else if (this.input.pressed(this.slots[0])) {
      this.player.castQiSlash(aimed());
    } else if (this.input.pressed(this.attackKey)) {
      this.player.attack(aimed());
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    this.player.move(this.input.axis(), this.input.sprinting());
  }

  /** Heading held right now: keyboard first, then the touch stick. */

  destroy(): void {
    this.input.destroy();
  }
}

