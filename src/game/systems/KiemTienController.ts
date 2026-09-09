import Phaser from 'phaser';
import type { KiemTien } from '../entities/KiemTien';
import { isGameplayGated } from '../../net/bind';
import { KIT_INPUT, kitBindings, type Binding } from '../input/bindings';
import { InputMap } from '../input/InputMap';
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
  private readonly input: InputMap;
  /** Slot *i* is the i-th name in the kit’s skill list — see `bindings.ts`. */
  private readonly slots: readonly Binding[];
  private readonly attackKey: Binding;

  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    private readonly player: KiemTien,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('KiemTienController requires a keyboard plugin');

    const kit = KIT_INPUT['kiemtien'];
    this.input = new InputMap(keyboard, kitBindings('kiemtien'));
    this.slots = kit.slots;
    this.attackKey = kit.attack;
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
      this.player.castBlood(aimed());
    } else if (this.input.pressed(this.slots[2])) {
      this.player.castRain(aimed());
    } else if (this.input.pressed(this.slots[1])) {
      this.player.castLance(aimed());
    } else if (this.input.pressed(this.slots[0])) {
      this.player.castCut(aimed());
    } else if (this.input.pressed(this.attackKey)) {
      this.player.attack(aimed());
    }

    if (this.player.isBusy) {
      this.player.move({ x: 0, y: 0 });
      return;
    }

    this.player.move(this.input.axis());
  }

  /** Heading an action should take, keyboard first then the touch stick. */

  destroy(): void {
    this.input.destroy();
  }
}

