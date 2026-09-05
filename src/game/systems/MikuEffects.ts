import Phaser from 'phaser';
import { MIKU_FX, MIKU_TEXTURE } from '../animations/mikuAnimations';
import { aimAngle } from '../types';
import type { Vector2Like } from '../types';

/**
 * Spawns Miku's starlight effects. Like Như Yên's, every effect here is a
 * real frame off her own strips rather than a tint or a particle blob:
 *
 *   crescent  the free-standing star arc — Tinh Mang Trảm
 *   star      the two-frame star eruption — Tinh Không Trận
 */

export interface ProjectileOptions {
  /** Spawn point on the ground plane. */
  x: number;
  y: number;
  /** Unit vector to fly along; the art is drawn pointing right and rotated. */
  aim: Vector2Like;
  /** How far it travels before fading, in px. */
  range: number;
  /** Travel time in ms. */
  duration: number;
  /** How far above the ground plane it is drawn — chest height for a crescent. */
  lift: number;
  /** Called every step with the position back on the ground plane. */
  onStep?: (x: number, y: number) => void;
}

/** Three star trails, fanned a few degrees off the aim. */
const FAN = [
  { spread: -0.24, scale: 0.62, delay: 0 },
  { spread: 0, scale: 0.74, delay: 36 },
  { spread: 0.24, scale: 0.62, delay: 16 },
] as const;

export class MikuEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  /** Tinh Mang Trảm. Three crescents growing as they fly. */
  starCrescent(options: ProjectileOptions): void {
    const heading = Math.atan2(options.aim.y, options.aim.x);

    this.glitter(options.x, options.y, 0.6);
    this.sparks(options.x, options.y, 8);

    for (const head of FAN) {
      const aim = {
        x: Math.cos(heading + head.spread),
        y: Math.sin(heading + head.spread),
      };
      const tracked = head.spread === 0;
      this.scene.time.delayedCall(head.delay, () =>
        this.flyCrescent(
          { ...options, aim, onStep: tracked ? options.onStep : undefined },
          head.scale,
        ),
      );
    }
  }

  /** One Tinh Không Trận pillar, dropped on a ground point. */
  starPillar(x: number, y: number, scale = 1, shake = 0.006): void {
    this.glitter(x, y, scale * 0.7);
    const sprite = this.scene.add
      .sprite(x, y, MIKU_TEXTURE, MIKU_FX.star)
      .setDepth(y + 260)
      .setScale(scale * 0.7)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: sprite,
      alpha: 1,
      scale,
      duration: 110,
      ease: 'Back.easeOut',
    });
    sprite.play(MIKU_FX.eruptionAnim);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.sparks(x, y - 14 * scale, 7);
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 170,
        onComplete: () => sprite.destroy(),
      });
    });

    if (shake > 0) this.scene.cameras.main.shake(180, shake);
  }

  /** A small burst of starlight — one glitter stack landing. */
  starBurst(x: number, y: number, scale = 0.45): void {
    const sprite = this.scene.add
      .sprite(x, y, MIKU_TEXTURE, MIKU_FX.crescent)
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
    this.sparks(x, y, 5);
  }

  /** The louder version, for the moment a pillar actually lands on someone. */
  starNova(x: number, y: number): void {
    this.starBurst(x, y, 1.05);
    const ring = this.scene.add
      .sprite(x, y, MIKU_TEXTURE, MIKU_FX.star)
      .setDepth(y + 251)
      .setScale(0.35, 0.16)
      .setAlpha(0.85)
      .setTint(0xc9a0ff);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.5,
      scaleY: 0.5,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
  }

  /** Ảo Ảnh Bộ's trail — afterimages tinted violet with sparks dropping behind. */
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
          .setTint(0xb48cff);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 260,
          onComplete: () => ghost.destroy(),
        });
        this.sparks(source.x, source.y, 3);
      });
    }
  }

  /* ------------------------------------------------------------- internals */

  private flyCrescent(options: ProjectileOptions, scale: number): void {
    const vector = options.aim;
    const sprite = this.scene.add
      .sprite(options.x, options.y - options.lift, MIKU_TEXTURE, MIKU_FX.crescent)
      .setAngle(aimAngle(vector))
      .setDepth(options.y + 240)
      .setScale(scale)
      .setAlpha(0.95);

    const trail = this.scene.time.addEvent({
      delay: 40,
      repeat: Math.floor(options.duration / 40),
      callback: () => this.sparks(sprite.x, sprite.y + options.lift * 0.3, 2),
    });

    this.scene.tweens.add({
      targets: sprite,
      x: options.x + vector.x * options.range,
      y: options.y - options.lift + vector.y * options.range,
      scale: scale * 1.8,
      alpha: 0.15,
      duration: options.duration,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        const groundY = sprite.y + options.lift;
        sprite.setDepth(groundY + 240);
        options.onStep?.(sprite.x, groundY);
      },
      onComplete: () => {
        trail.remove(false);
        this.sparks(sprite.x, sprite.y + options.lift, 6);
        sprite.destroy();
      },
    });
  }

  /** Glittered ground under a strike: the star art, flattened and faded out. */
  private glitter(x: number, y: number, scale: number): void {
    const mark = this.scene.add
      .sprite(x, y, MIKU_TEXTURE, MIKU_FX.star)
      .setDepth(y + 18)
      .setScale(scale * 0.5, scale * 0.14)
      .setAlpha(0.6)
      .setTint(0x9b6bff);
    this.scene.tweens.add({
      targets: mark,
      scaleX: scale * 1.1,
      scaleY: scale * 0.3,
      alpha: 0,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => mark.destroy(),
    });
  }

  /** Sparks thrown off anything bright. Plain rectangles: they are 2-3px on screen. */
  private sparks(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const size = i % 3 === 0 ? 3 : 2;
      const spark = this.scene.add
        .rectangle(x, y, size, size, i % 2 === 0 ? 0xfff0ff : 0xb48cff)
        .setDepth(y + 252)
        .setAlpha(0.95);
      this.scene.tweens.add({
        targets: spark,
        x: x + Phaser.Math.Between(-20, 20),
        y: y - Phaser.Math.Between(8, 38),
        alpha: 0,
        duration: 240 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }
}
