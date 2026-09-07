import Phaser from 'phaser';
import { flatY } from './groundPlane';
import { WUKONG_ART_SCALE, WUKONG_FX, WUKONG_TEXTURE } from '../animations/wukongAnimations';
import type { Vector2Like } from '../types';

/**
 * How much of the staff-tip offset survives on the Y axis.
 *
 * Screen Y is depth in this view, so a step "forward" covers less of it than
 * the same step sideways. At full value, aiming up put the muzzle far above his
 * head with the beam starting out of nothing. Halved, the beam head stays on
 * him whichever way he turns.
 */
const MUZZLE_FORESHORTEN = 0.5;

/**
 * How long the bolt stands at full brightness once it lands, and how long it
 * then takes to go out. The four frames that build it run 308ms between them,
 * so anything much shorter than this reads as a flicker at the end of the
 * technique rather than as its arrival.
 */
const LANCE_HOLD_MS = 260;
const LANCE_FADE_MS = 420;

/**
 * Spawns what is left of Tôn Ngộ Không's effects once the art carries its own.
 *
 * This module is deliberately a fraction of the size of {@link NhuYenEffects}
 * and {@link HuyetLangEffects}, and the reason is worth stating: his techniques
 * were drawn as whole rows in which the qi gathers, climbs the staff and breaks.
 * The dragon and the flame are *frames of the cast animation*, not sprites
 * composed on top of it. An earlier build cut those cells out and re-spawned
 * them at runtime, which put a seam in the one place the art has none — the
 * effect popped into existence a beat after the pose that was already drawing
 * it.
 *
 * Two are still spawned, and both for a reason the others do not share: they
 * have to appear where the character is not. Cửu U Nộ Diễm's pillar erupts at
 * the far end of the lane, and Hàng Ma Chân Lôi's bolt flies down it.
 *
 * So nothing here re-draws a technique. What is left is the small change around
 * the edges: a burst on each target a hit connects with, the scorch it leaves,
 * sparks, and the afterimages of the cloud dash.
 */
/**
 * World units to texture units.
 *
 * Every sprite here comes out of the same atlas as the character, which is
 * baked larger than the world (WUKONG_ART_SCALE). Callers pass sizes in world
 * terms — `qiBurst(x, y, 0.45)` means "a burst about half a body wide" — so
 * each one is divided on the way in. Forgetting it does not error, it just
 * makes every effect half again too big.
 */
const art = (scale: number): number => scale / WUKONG_ART_SCALE;

export class WukongEffects {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * A burst of qi where a hit lands. Used by every one of his attacks and
   * techniques, because the technique itself is already on screen — this is
   * only the confirmation that it caught someone.
   */
  qiBurst(x: number, y: number, scale = 0.45): void {
    const sprite = this.scene.add
      .sprite(x, y, WUKONG_TEXTURE, WUKONG_FX.burst)
      .setDepth(y + 250)
      .setScale(art(scale) * 0.6)
      .setAlpha(0.9);

    this.scene.tweens.add({
      targets: sprite,
      scale,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.destroy(),
    });
    this.embers(x, y, 5);
  }

  /** Burnt ground under a strike: the impact art, flattened and faded out. */
  scorch(x: number, y: number, scale = 1): void {
    const mark = this.scene.add
      .sprite(x, y, WUKONG_TEXTURE, WUKONG_FX.burst)
      .setDepth(y + 18)
      .setScale(art(scale) * 0.5, flatY(art(scale) * 0.5) * 0.5)
      .setAlpha(0.6)
      .setTint(0x7a1adf);
    this.scene.tweens.add({
      targets: mark,
      scaleX: art(scale) * 1.1,
      scaleY: flatY(art(scale) * 1.1),
      alpha: 0,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => mark.destroy(),
    });
  }

  /**
   * One lotus of the run that carries Cửu U Nộ Diễm out to its eruption.
   *
   * The technique does not throw its flame through the air — it runs *under*
   * the ground and comes up, so what marks its path is a line of these opening
   * one after another. Scorch marks used to stand in for them, which said
   * "something burned here" rather than "it is still coming".
   *
   * Each one springs open from nothing and sinks away: the flower is the whole
   * animation, so it is a single frame given a scale to grow through rather
   * than a clip. Baked on `ground`, so `y` is the floor it opens out of.
   */
  novaBloom(x: number, y: number, scale = 1): void {
    const lotus = this.scene.add
      .sprite(x, y, WUKONG_TEXTURE, WUKONG_FX.novaBloom)
      .setDepth(y + 30)
      .setScale(art(scale) * 0.3, flatY(art(scale) * 0.3))
      .setAlpha(0.65);

    this.scene.tweens.add({
      targets: lotus,
      scaleX: art(scale),
      // flat, not even: it is a flower opening on the floor, and at an even
      // scale it stood up like a poster propped in the grass
      scaleY: flatY(art(scale)),
      alpha: 1,
      duration: 130,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: lotus,
          scaleY: flatY(art(scale)) * 0.55,
          alpha: 0,
          duration: 260,
          ease: 'Quad.easeIn',
          onComplete: () => lotus.destroy(),
        });
      },
    });
    this.embers(x, y, 3);
  }

  /**
   * Cửu U Nộ Diễm's flame, planted where it arrives.
   *
   * The four cast rows draw him throwing this, but never the flame itself at a
   * distance — a cell of his own animation can only appear on top of him. So it
   * is baked out as `fx_nova` and spawned here, at the far end of the lane.
   *
   * It is an animation, not a stamp: five beats of the lotus opening, spreading
   * and breaking upward. The growth used to be faked with a tween on a single
   * frame, which is exactly the seam the drawn version does not have. The frame
   * carries its own pivot on the flame's base, so `y` is the floor it opens from
   * and there is no `setOrigin` here to override it.
   */
  novaFlame(x: number, y: number, scale = 1): void {
    const flame = this.scene.add
      .sprite(x, y, WUKONG_TEXTURE, WUKONG_FX.novaFlame.frame)
      .setDepth(y + 260)
      .setScale(art(scale));

    flame.play(WUKONG_FX.novaFlame.anim);
    flame.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({
        targets: flame,
        alpha: 0,
        duration: 220,
        ease: 'Quad.easeIn',
        onComplete: () => flame.destroy(),
      });
    });
    this.embers(x, y, 8);
  }

  /**
   * Hàng Ma Chân Lôi's bolt, thrown from the beam head on the end of his staff.
   *
   * Same reason as the pillar: the four cells that draw it have no body in them,
   * so played inside the cast they would blank him out and put the beam wherever
   * the sheet grid happened to leave it. On its own sprite, hung off the
   * `muzzle` end of the art, the bolt grows out of the orb he has been charging.
   *
   * `x, y` are his feet and `aim` is the unit heading of the cast.
   */
  lanceBolt(x: number, y: number, aim: Vector2Like, scale = 1): void {
    const forward = WUKONG_FX.lanceMuzzle.x * scale;
    const lift = WUKONG_FX.lanceMuzzle.y * scale;
    const bolt = this.scene.add
      .sprite(
        x + aim.x * forward,
        y + lift + aim.y * forward * MUZZLE_FORESHORTEN,
        WUKONG_TEXTURE,
        WUKONG_FX.lanceBolt.frame,
      )
      .setDepth(y + 255)
      .setScale(art(scale))
      // Rotated, not mirrored. The art is one streak drawn along +x from the
      // muzzle, so turning it to the aim is what lets the technique strike in
      // eight directions rather than only the two the artist drew. Aiming left
      // is a half-turn, which on a beam symmetric about its axis is the same
      // picture a mirror would have given.
      .setRotation(Math.atan2(aim.y, aim.x));

    // The frames carry their own pivot, so no setOrigin: the rotation swings
    // about the muzzle and the bolt still leaves from the staff.
    bolt.play(WUKONG_FX.lanceBolt.anim);
    bolt.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.time.delayedCall(LANCE_HOLD_MS, () => {
        this.scene.tweens.add({
          targets: bolt,
          alpha: 0,
          duration: LANCE_FADE_MS,
          ease: 'Quad.easeIn',
          onComplete: () => bolt.destroy(),
        });
      });
    });
    this.embers(bolt.x, bolt.y, 6);
  }

  /** Camera kick for the techniques that break the ground. */
  shake(intensity: number, duration = 190): void {
    this.scene.cameras.main.shake(duration, intensity);
  }

  /**
   * Cân Đẩu Vân's trail. Each afterimage is a snapshot of whatever frame the
   * sprite was on, tinted to the violet qi in his cloak, with sparks dropping
   * behind so the dash reads as a cloud tearing away rather than as a blur.
   */
  shadowTrail(source: Phaser.GameObjects.Sprite, count: number, spacingMs: number): void {
    for (let i = 0; i < count; i++) {
      this.scene.time.delayedCall(i * spacingMs, () => {
        if (!source.active) return;
        const ghost = this.scene.add
          .sprite(source.x, source.y, source.texture.key, source.frame.name)
          .setOrigin(source.originX, source.originY)
          // and the scale: the source is drawn down from a larger atlas, so a
          // ghost left at 1 would be half again bigger than the man casting it
          .setScale(source.scaleX, source.scaleY)
          .setFlipX(source.flipX)
          .setDepth(source.y - 1)
          .setAlpha(0.5)
          .setTint(0x9a4aff);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 280,
          onComplete: () => ghost.destroy(),
        });
        this.embers(source.x, source.y, 3);
      });
    }
  }

  /** Sparks thrown off anything burning. Plain rectangles: 2-3px on screen. */
  private embers(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const size = i % 3 === 0 ? 3 : 2;
      const spark = this.scene.add
        .rectangle(x, y, size, size, i % 2 === 0 ? 0xffa0f0 : 0x7a2aff)
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
