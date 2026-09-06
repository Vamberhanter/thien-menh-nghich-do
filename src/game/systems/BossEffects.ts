import Phaser from 'phaser';
import { BOSS1_FX, BOSS1_TEXTURE } from '../animations/bossAnimations';
import { aimAngle } from '../types';
import type { Vector2Like } from '../types';

/**
 * Spawns Boss 1's blood effects, all cut from its own sheets:
 *
 *   bolt   the three-frame arrow of blood — Huyết Nhận, a real projectile
 *   burst  the ground explosion where a bolt lands
 *   ring   the dark rune ring under Ma Dực Trận
 *
 * Same split as `NhuYenEffects`: this owns the visuals, the scene owns the
 * rules, and the projectile reports its position each frame so the scene can
 * damage what it actually passes over.
 */
export interface BoltOptions {
  x: number;
  y: number;
  /** Unit vector to fly along; the art is drawn pointing right and rotated. */
  aim: Vector2Like;
  range: number;
  duration: number;
  /** Draw height above the ground plane — chest height for a thrown bolt. */
  lift: number;
  /** Position callback on the **ground plane**, so callers never undo `lift`. */
  onStep?: (x: number, y: number) => void;
  /** Called where the bolt stops, for the impact burst. */
  onLand?: (x: number, y: number) => void;
}

export class BossEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  bolt(options: BoltOptions): void {
    const vector = options.aim;
    const sprite = this.scene.add
      .sprite(options.x, options.y - options.lift, BOSS1_TEXTURE, 'fx_bolt_0')
      .setAngle(aimAngle(vector))
      .setDepth(options.y + 240)
      .setScale(0.85)
      .setAlpha(0.96);
    sprite.play(BOSS1_FX.boltAnim);

    this.scene.tweens.add({
      targets: sprite,
      x: options.x + vector.x * options.range,
      y: options.y - options.lift + vector.y * options.range,
      duration: options.duration,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const groundY = sprite.y + options.lift;
        sprite.setDepth(groundY + 240);
        options.onStep?.(sprite.x, groundY);
      },
      onComplete: () => {
        options.onLand?.(sprite.x, sprite.y + options.lift);
        sprite.destroy();
      },
    });
  }

  /** Ground explosion, anchored on its base so `y` is where it breaks ground. */
  burst(x: number, y: number, scale = 1): void {
    const sprite = this.scene.add
      .sprite(x, y, BOSS1_TEXTURE, 'fx_burst_0')
      .setDepth(y + 250)
      .setScale(scale * 0.8)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: sprite,
      alpha: 1,
      scale,
      duration: 90,
      ease: 'Back.easeOut',
    });
    sprite.play(BOSS1_FX.burstAnim);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 150,
        onComplete: () => sprite.destroy(),
      });
    });
  }

  /** Warning ellipse before nova / heavy slash so the hit is readable. */
  telegraph(x: number, y: number, radius: number, color = 0xff6b5a): void {
    const g = this.scene.add.graphics().setDepth(y - 8);
    g.lineStyle(3, color, 0.85);
    g.strokeEllipse(x, y, radius * 2, radius * 1.35);
    g.fillStyle(color, 0.12);
    g.fillEllipse(x, y, radius * 2, radius * 1.35);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  /**
   * Ma Dực Trận's ring. `radius` is the damage radius, and the art is scaled to
   * match it, so what the player sees is what the skill actually covers.
   */
  novaRing(x: number, y: number, radius: number): void {
    const sprite = this.scene.add
      .sprite(x, y, BOSS1_TEXTURE, 'fx_ring_0')
      .setDepth(y - 4)
      .setAlpha(0.9);
    // the drawn ring is about 200px across at scale 1
    const scale = (radius * 2) / 200;
    sprite.setScale(scale * 0.35, scale * 0.28);
    sprite.play(BOSS1_FX.ringAnim);

    this.scene.tweens.add({
      targets: sprite,
      scaleX: scale,
      scaleY: scale * 0.8,
      alpha: 0,
      duration: 620,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
    this.scene.cameras.main.shake(220, 0.008);
  }

  /** Free-standing crescent, used where a swing lands out of frame. */
  crescent(x: number, y: number, aim: Vector2Like, lift = 40): void {
    const sprite = this.scene.add
      .sprite(x, y - lift, BOSS1_TEXTURE, BOSS1_FX.crescent)
      .setAngle(aimAngle(aim))
      .setDepth(y + 240)
      .setScale(0.6)
      .setAlpha(0.95);

    this.scene.tweens.add({
      targets: sprite,
      scale: 0.95,
      alpha: 0,
      duration: 240,
      onComplete: () => sprite.destroy(),
    });
  }
}
