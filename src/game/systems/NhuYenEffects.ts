import Phaser from 'phaser';
import { NHU_YEN_FX, NHU_YEN_TEXTURE } from '../animations/nhuYenAnimations';
import { aimAngle } from '../types';
import type { Vector2Like } from '../types';

/**
 * Spawns Như Yên's ice effects. All of the art is cut from her own sheets, so
 * every effect here is a real frame the artist drew rather than a tint or a
 * particle blob:
 *
 *   crescent  the free-standing qi arc from the attack sheet — Băng Phách Trảm
 *   eruption  the two-frame ice pillar from the skill sheet — Băng Tinh Trận
 *   shards    the loose ice shards from the attack sheet — frost / freeze marks
 *
 * Kept out of the scene so the scene stays about the world and the rules.
 */

export interface ProjectileOptions {
  /** Spawn point on the ground plane. */
  x: number;
  y: number;
  /**
   * Unit vector to fly along. The art is drawn pointing right and is simply
   * rotated to match, so any heading works — not just the four drawn facings.
   */
  aim: Vector2Like;
  /** How far it travels before fading, in px. */
  range: number;
  /** Travel time in ms. */
  duration: number;
  /** How far above the ground plane it is drawn — chest height for a crescent. */
  lift: number;
  /**
   * Called every step with the projectile's position back on the **ground
   * plane**, so callers compare it against ground positions and never have to
   * undo `lift` themselves.
   */
  onStep?: (x: number, y: number) => void;
}

export class NhuYenEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Băng Phách Trảm's crescent. It flies along the facing, growing as it goes,
   * and reports its position every frame so the scene can damage what it passes
   * over instead of resolving the whole path up front.
   */
  qiCrescent(options: ProjectileOptions): void {
    const vector = options.aim;
    const sprite = this.scene.add
      .sprite(options.x, options.y - options.lift, NHU_YEN_TEXTURE, NHU_YEN_FX.crescent)
      .setAngle(aimAngle(vector))
      .setDepth(options.y + 240)
      .setScale(0.7)
      .setAlpha(0.95);

    this.scene.tweens.add({
      targets: sprite,
      x: options.x + vector.x * options.range,
      y: options.y - options.lift + vector.y * options.range,
      scale: 1.25,
      alpha: 0.15,
      duration: options.duration,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        const groundY = sprite.y + options.lift;
        sprite.setDepth(groundY + 240);
        options.onStep?.(sprite.x, groundY);
      },
      onComplete: () => sprite.destroy(),
    });
  }

  /**
   * Băng Tinh Trận's eruption, dropped on a ground point. The frame is anchored
   * at the base of its ring, so `y` is where the ice breaks the ground.
   */
  iceEruption(x: number, y: number, scale = 1, shake = 0.006): void {
    const sprite = this.scene.add
      .sprite(x, y, NHU_YEN_TEXTURE, 'fx_eruption_0')
      .setDepth(y + 260)
      .setScale(scale * 0.7)
      .setAlpha(0);

    // a quick bloom in, so the pillar reads as bursting out of the ground
    this.scene.tweens.add({
      targets: sprite,
      alpha: 1,
      scale,
      duration: 110,
      ease: 'Back.easeOut',
    });
    sprite.play(NHU_YEN_FX.eruptionAnim);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 160,
        onComplete: () => sprite.destroy(),
      });
    });

    if (shake > 0) this.scene.cameras.main.shake(180, shake);
  }

  /** A small burst of the sheet's ice shards — one Frost stack landing. */
  frostBurst(x: number, y: number, scale = 0.45): void {
    const sprite = this.scene.add
      .sprite(x, y, NHU_YEN_TEXTURE, NHU_YEN_FX.shards)
      .setDepth(y + 250)
      .setScale(scale * 0.6)
      .setAlpha(0.9);

    this.scene.tweens.add({
      targets: sprite,
      scale,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
  }

  /** The louder version, for the moment a target actually freezes. */
  freezeBurst(x: number, y: number): void {
    this.frostBurst(x, y, 1.05);
    const ring = this.scene.add
      .sprite(x, y, NHU_YEN_TEXTURE, NHU_YEN_FX.shards)
      .setDepth(y + 251)
      .setScale(0.3)
      .setAngle(180)
      .setAlpha(0.85);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.2,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Sương Ảnh Bộ's trail. Each afterimage is a snapshot of whatever frame the
   * sprite was on, so the trail always matches the pose she dashed in.
   */
  shadowTrail(source: Phaser.GameObjects.Sprite, count: number, spacingMs: number): void {
    for (let i = 0; i < count; i++) {
      this.scene.time.delayedCall(i * spacingMs, () => {
        if (!source.active) return;
        const ghost = this.scene.add
          .sprite(source.x, source.y, source.texture.key, source.frame.name)
          .setOrigin(source.originX, source.originY)
          .setFlipX(source.flipX)
          .setDepth(source.y - 1)
          .setAlpha(0.5)
          .setTint(0x8fd4ff);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 260,
          onComplete: () => ghost.destroy(),
        });
      });
    }
  }
}
