import Phaser from 'phaser';
import { gameAssetUrl } from '../../net/assets';

/**
 * Vạn Kiếm Quy Tông, played as one continuous ultimate from the eight VFX
 * frames on `kiemtien-skill3.3.png`.
 *
 * The eight are cut out by `tools/build-wankiem-vfx.mjs` and loaded as loose
 * images rather than going into her atlas: they are not poses, they have no
 * feet, and the atlas sizes one box per sheet — a 384x542 effect dropped in
 * with her 216x222 walk would grow every walk frame to match.
 *
 * **What the art actually is, and what that means here.** All eight are the
 * same motif: one upright blade with a different energy wrap around it. There
 * is no drawn explosion, no drawn ground impact and no drawn rain — those are
 * the roles the frames were named for, not what they depict. So the stages of
 * the technique are built out of *motion*: the same swords scaled, spun, faded
 * and moved. What each frame contributes is its wrap:
 *
 *   01 summon         bare blade, faintest glow  — it arrives
 *   02 convergence    a spiral drawing inward    — it gathers
 *   03 charge         tight and bright, no wrap  — it holds
 *   04 explosion      the heaviest spiral        — it lets go
 *   05 sword rain     a blade with a sweep trail — the falling swords
 *   06 giant sword    long, clean, sharp point   — the descent
 *   07 giant impact   a blade inside an upflare  — the landing
 *   08 final burst    a blade inside two rings   — the shockwave
 *
 * The rain reuses 05 for every sword rather than asking for a sheet of them:
 * one drawing spun, scaled and faded differently per instance reads as many
 * swords, and it costs one texture.
 *
 * Damage is not this class's business. The scene resolves the hit; this only
 * draws. That keeps the timing of the two independent, which matters because
 * `setDuration` can stretch the whole show without changing what it does.
 */

/**
 * Texture keys, and the files behind them.
 *
 * The paths carry the `assets/` prefix that `gameAssetUrl` strips straight back
 * off, because the production build's `stripSourceSheets` deletes any image the
 * bundle does not name and it looks for `assets/...` spellings. Written without
 * the prefix these eight loaded fine in dev and were deleted from every
 * production build. Same URL either way — see `gameAssetUrl`.
 */
export const WanKiemTexture = {
  Summon: 'wkqt-01-summon',
  Convergence: 'wkqt-02-convergence',
  Charge: 'wkqt-03-charge',
  Explosion: 'wkqt-04-explosion',
  SwordRain: 'wkqt-05-sword-rain',
  GiantSword: 'wkqt-06-giant-sword',
  GiantImpact: 'wkqt-07-giant-impact',
  FinalBurst: 'wkqt-08-final-burst',
} as const;

export const WAN_KIEM_TEXTURES = [
  { key: WanKiemTexture.Summon, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/01_summon.png') },
  { key: WanKiemTexture.Convergence, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/02_convergence.png') },
  { key: WanKiemTexture.Charge, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/03_charge.png') },
  { key: WanKiemTexture.Explosion, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/04_explosion.png') },
  { key: WanKiemTexture.SwordRain, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/05_sword_rain.png') },
  { key: WanKiemTexture.GiantSword, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/06_giant_sword.png') },
  { key: WanKiemTexture.GiantImpact, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/07_giant_impact.png') },
  { key: WanKiemTexture.FinalBurst, url: gameAssetUrl('assets/vfx/wan-kiem-quy-tong/08_final_burst.png') },
] as const;

/**
 * Each frame's own point-and-axis, so all eight stand on the same spot.
 *
 * Measured, not chosen: the blades sit between 38% and 60% across their cells
 * and their points between 94% and 97% down, so one shared origin would slide
 * the sword sideways by up to 40px between stages. `tools/build-wankiem-vfx.mjs`
 * prints this table — re-run it if a cell is redrawn.
 */
const ORIGIN: Record<string, { x: number; y: number }> = {
  [WanKiemTexture.Summon]: { x: 0.569, y: 0.973 },
  [WanKiemTexture.Convergence]: { x: 0.487, y: 0.972 },
  [WanKiemTexture.Charge]: { x: 0.414, y: 0.949 },
  [WanKiemTexture.Explosion]: { x: 0.382, y: 0.952 },
  [WanKiemTexture.SwordRain]: { x: 0.601, y: 0.935 },
  [WanKiemTexture.GiantSword]: { x: 0.482, y: 0.936 },
  [WanKiemTexture.GiantImpact]: { x: 0.425, y: 0.954 },
  [WanKiemTexture.FinalBurst]: { x: 0.430, y: 0.952 },
};

/**
 * Stage windows as fractions of the whole, so `setDuration` stretches the
 * technique rather than truncating it.
 *
 * They overlap on purpose — a stage starts before the one before it has faded,
 * which is what makes eight beats read as one move instead of a slideshow. The
 * giant sword starts its descent while the rain is still falling so it arrives
 * *through* the rain rather than after it.
 */
const STAGE = {
  summon: { at: 0.0, for: 0.15 },
  convergence: { at: 0.1, for: 0.18 },
  charge: { at: 0.24, for: 0.14 },
  explosion: { at: 0.34, for: 0.16 },
  rain: { at: 0.42, for: 0.4 },
  giantSword: { at: 0.62, for: 0.19 },
  giantImpact: { at: 0.8, for: 0.1 },
  finalBurst: { at: 0.86, for: 0.14 },
} as const;

/**
 * How big, against her.
 *
 * The frames are around 500px of blade; her walk frame is 222, and the world
 * draws that at about 139px. So 0.85 stands the summoned sword a bit over three
 * times her height and 1.45 makes the descending one five — which is what an
 * ultimate has to be. The first pass at a third of this read as a dagger.
 */
const STAGE_SCALE = 0.85;
const GIANT_SCALE = 1.45;

/**
 * How far above the ground point the giant sword and the rain start.
 *
 * The giant's drop is short because the frame is tall: its origin is the point,
 * so at 1.45 the hilt is already 725px above that. Dropped from 560 it spent
 * most of its fall entirely off the top of the screen and appeared only in the
 * last moment; from 380 it is in frame for the whole descent.
 */
const GIANT_DROP = 380;
const RAIN_DROP = 420;

/**
 * The rain, in numbers.
 *
 * `MAX_SWORDS` is the ceiling on live instances and the size the pool settles
 * at; the spawn rate is worked back from it so the pool is the budget rather
 * than a hope. At intensity 1 that is 26 in the air at once, inside the 20–40
 * the effect was asked for, and it never allocates a 27th.
 */
const MAX_SWORDS = 40;
const SWORDS_AT_ONE = 26;
const RAIN_FALL_MIN = 380;
const RAIN_FALL_MAX = 720;
const RAIN_SPREAD = 210;
const RAIN_DEPTH_SPREAD = 90;
/** Rain swords run from two-thirds her height to a little over one — many, not huge. */
const RAIN_SCALE_MIN = 0.16;
const RAIN_SCALE_MAX = 0.36;
const RAIN_TILT = 0.34;
const RAIN_SPIN = 0.5;

const DEFAULT_DURATION = 2600;

/** Above the ground plane, the way every other effect in the scene is depthed. */
const DEPTH_LIFT = 260;

export class WanKiemQuyTongEffect {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly live = new Set<Phaser.GameObjects.Image>();
  private readonly stageSprites = new Set<Phaser.GameObjects.Image>();
  private readonly timers = new Set<Phaser.Time.TimerEvent>();
  private intensity = 1;
  private duration = DEFAULT_DURATION;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * How big and how many, as a multiplier on the default.
   *
   * Clamped rather than trusted: the sword count comes off this, and a caller
   * passing 10 would ask for 260 sprites. Below 0.2 the rain thins to nothing
   * and the stages are invisible, so that is the floor.
   */
  setIntensity(value: number): void {
    this.intensity = Phaser.Math.Clamp(value, 0.2, 2);
  }

  /** Total length in ms. Every stage is a fraction of it, so they all stretch together. */
  setDuration(value: number): void {
    this.duration = Phaser.Math.Clamp(value, 600, 12000);
  }

  /**
   * When the giant sword lands, in ms after `play`.
   *
   * The scene's flash, shake and hit-stop have to go off on that frame, and
   * this is the only place that knows when it is — `setDuration` moves it.
   */
  impactDelay(): number {
    return STAGE.giantImpact.at * this.duration;
  }

  /**
   * Run the whole technique with its point on (x, y).
   *
   * `y` is the ground, not the middle of the picture: every frame is placed on
   * its own measured point (see ORIGIN), so the blades stand where they are put.
   */
  play(x: number, y: number): void {
    if (!this.scene.textures.exists(WanKiemTexture.Summon)) return;
    const ms = (stage: { at: number; for: number }) => ({
      at: stage.at * this.duration,
      length: stage.for * this.duration,
    });

    this.stage(WanKiemTexture.Summon, x, y, ms(STAGE.summon), {
      from: { scale: STAGE_SCALE * 0.55, alpha: 0 },
      to: { scale: STAGE_SCALE, alpha: 1 },
      ease: 'Back.easeOut',
    });
    this.stage(WanKiemTexture.Convergence, x, y, ms(STAGE.convergence), {
      from: { scale: STAGE_SCALE * 1.25, alpha: 0 },
      to: { scale: STAGE_SCALE, alpha: 1 },
      // Drawing in: it comes from wider than it ends, and turns as it closes.
      spin: -0.5,
    });
    this.stage(WanKiemTexture.Charge, x, y, ms(STAGE.charge), {
      from: { scale: STAGE_SCALE * 0.94, alpha: 0 },
      to: { scale: STAGE_SCALE * 1.06, alpha: 1 },
      ease: 'Quad.easeIn',
    });
    this.stage(WanKiemTexture.Explosion, x, y, ms(STAGE.explosion), {
      from: { scale: STAGE_SCALE * 0.8, alpha: 0 },
      to: { scale: STAGE_SCALE * 1.5 * this.intensity, alpha: 1 },
      ease: 'Expo.easeOut',
      spin: 0.7,
    });

    this.rain(x, y, ms(STAGE.rain));
    this.giantSword(x, y, ms(STAGE.giantSword));

    this.stage(WanKiemTexture.GiantImpact, x, y, ms(STAGE.giantImpact), {
      from: { scale: GIANT_SCALE * 0.5, alpha: 0 },
      to: { scale: GIANT_SCALE * 1.15 * this.intensity, alpha: 1 },
      ease: 'Expo.easeOut',
    });
    this.stage(WanKiemTexture.FinalBurst, x, y, ms(STAGE.finalBurst), {
      from: { scale: GIANT_SCALE * 0.7, alpha: 0 },
      to: { scale: GIANT_SCALE * 1.6 * this.intensity, alpha: 1 },
      ease: 'Expo.easeOut',
      spin: 0.35,
    });
  }

  /**
   * Cut it short: nothing further spawns and everything on screen goes away.
   *
   * Pooled swords go back to the pool rather than being destroyed — a stop is
   * usually a recast or a scene change, and either way the next `play` wants
   * them.
   */
  stop(): void {
    for (const timer of this.timers) timer.remove(false);
    this.timers.clear();
    for (const sword of this.live) {
      this.scene.tweens.killTweensOf(sword);
      this.release(sword);
    }
    this.live.clear();
    for (const sprite of this.stageSprites) {
      this.scene.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
    this.stageSprites.clear();
  }

  /** Everything gone, pool included. For a scene teardown. */
  destroy(): void {
    this.stop();
    for (const sword of this.pool) sword.destroy();
    this.pool.length = 0;
  }

  /**
   * One of the six single-image stages: fade up while growing, hold, fade out.
   *
   * The hold is what is left of the window after the two fades, so a stage
   * given a long window sits on screen rather than growing more slowly.
   */
  private stage(
    key: string,
    x: number,
    y: number,
    window: { at: number; length: number },
    look: {
      from: { scale: number; alpha: number };
      to: { scale: number; alpha: number };
      ease?: string;
      spin?: number;
    },
  ): void {
    this.after(window.at, () => {
      const sprite = this.image(key, x, y).setScale(look.from.scale).setAlpha(look.from.alpha);
      this.stageSprites.add(sprite);

      const rise = Math.min(window.length * 0.45, 260);
      const fall = Math.min(window.length * 0.4, 320);
      this.scene.tweens.add({
        targets: sprite,
        scale: look.to.scale,
        alpha: look.to.alpha,
        duration: rise,
        ease: look.ease ?? 'Quad.easeOut',
      });
      if (look.spin) {
        this.scene.tweens.add({
          targets: sprite,
          rotation: look.spin,
          duration: window.length,
          ease: 'Sine.easeOut',
        });
      }
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        scale: look.to.scale * 1.08,
        delay: window.length - fall,
        duration: fall,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.stageSprites.delete(sprite);
          sprite.destroy();
        },
      });
    });
  }

  /**
   * The rain: swords out of the sky for the length of the window.
   *
   * One repeating timer rather than one timer per sword, and every sword comes
   * out of the pool. The interval is the window divided by how many will fall,
   * which is derived from the live ceiling and how long each one is in the air,
   * so raising the intensity makes it rain harder without ever exceeding the
   * pool.
   */
  private rain(x: number, y: number, window: { at: number; length: number }): void {
    const ceiling = Math.min(MAX_SWORDS, Math.round(SWORDS_AT_ONE * this.intensity));
    const airtime = (RAIN_FALL_MIN + RAIN_FALL_MAX) / 2;
    // How often one may leave so that no more than `ceiling` are ever in the air.
    const interval = Math.max(18, airtime / ceiling);
    const count = Math.max(1, Math.round(window.length / interval));

    this.after(window.at, () => {
      const timer = this.scene.time.addEvent({
        delay: interval,
        repeat: count - 1,
        callback: () => this.dropSword(x, y),
      });
      this.timers.add(timer);
    });
  }

  /** One rain sword, randomised on every axis it has, returned to the pool when it lands. */
  private dropSword(x: number, y: number): void {
    const rnd = Phaser.Math.RND;
    const landX = x + rnd.realInRange(-RAIN_SPREAD, RAIN_SPREAD) * this.intensity;
    const landY = y + rnd.realInRange(-RAIN_DEPTH_SPREAD, RAIN_DEPTH_SPREAD);
    const sword = this.acquire();
    if (!sword) return;

    const scale = rnd.realInRange(RAIN_SCALE_MIN, RAIN_SCALE_MAX) * this.intensity;
    const tilt = rnd.realInRange(-RAIN_TILT, RAIN_TILT);
    const fall = rnd.realInRange(RAIN_FALL_MIN, RAIN_FALL_MAX);

    sword
      .setPosition(landX, landY - RAIN_DROP * rnd.realInRange(0.75, 1.25))
      .setScale(scale)
      .setRotation(tilt)
      .setAlpha(0)
      .setDepth(landY + DEPTH_LIFT)
      .setVisible(true);

    this.scene.tweens.add({ targets: sword, alpha: rnd.realInRange(0.55, 1), duration: fall * 0.25 });
    // Turning as it falls, so a hundred copies of one drawing do not fall in
    // lockstep. Small — a sword that cartwheels reads as debris, not a blade.
    this.scene.tweens.add({
      targets: sword,
      rotation: tilt + rnd.realInRange(-RAIN_SPIN, RAIN_SPIN),
      duration: fall,
      ease: 'Sine.easeInOut',
    });
    this.scene.tweens.add({
      targets: sword,
      y: landY,
      duration: fall,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.scene.tweens.add({
          targets: sword,
          alpha: 0,
          scaleY: scale * 1.25,
          duration: 160,
          ease: 'Quad.easeIn',
          onComplete: () => this.release(sword),
        });
      },
    });
  }

  /** The descent: one blade out of the sky onto the point, arriving through the rain. */
  private giantSword(x: number, y: number, window: { at: number; length: number }): void {
    this.after(window.at, () => {
      const sprite = this.image(WanKiemTexture.GiantSword, x, y - GIANT_DROP)
        .setScale(GIANT_SCALE * this.intensity)
        .setAlpha(0);
      this.stageSprites.add(sprite);

      this.scene.tweens.add({ targets: sprite, alpha: 1, duration: window.length * 0.25 });
      this.scene.tweens.add({
        targets: sprite,
        y,
        duration: window.length,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.scene.tweens.add({
            targets: sprite,
            alpha: 0,
            delay: 180,
            duration: 260,
            onComplete: () => {
              this.stageSprites.delete(sprite);
              sprite.destroy();
            },
          });
        },
      });
    });
  }

  private image(key: string, x: number, y: number): Phaser.GameObjects.Image {
    const origin = ORIGIN[key] ?? { x: 0.5, y: 0.95 };
    return this.scene.add
      .image(x, y, key)
      .setOrigin(origin.x, origin.y)
      .setDepth(y + DEPTH_LIFT);
  }

  /** A sword off the pool, or a new one while the pool is still filling. */
  private acquire(): Phaser.GameObjects.Image | null {
    const spare = this.pool.pop();
    if (spare) {
      this.live.add(spare);
      return spare;
    }
    if (this.live.size >= MAX_SWORDS) return null;
    const origin = ORIGIN[WanKiemTexture.SwordRain];
    const sword = this.scene.add.image(0, 0, WanKiemTexture.SwordRain).setOrigin(origin.x, origin.y);
    this.live.add(sword);
    return sword;
  }

  private release(sword: Phaser.GameObjects.Image): void {
    this.live.delete(sword);
    sword.setVisible(false).setAlpha(0);
    this.pool.push(sword);
  }

  /** A one-shot timer that `stop` can cancel. */
  private after(delay: number, run: () => void): void {
    if (delay <= 0) {
      run();
      return;
    }
    const timer = this.scene.time.delayedCall(delay, () => {
      this.timers.delete(timer);
      run();
    });
    this.timers.add(timer);
  }
}
