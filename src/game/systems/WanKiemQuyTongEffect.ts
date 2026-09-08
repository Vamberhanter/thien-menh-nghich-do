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
 * one drawing stretched, scaled, mirrored and faded differently per instance
 * reads as many swords, and it costs one texture. Each one drops a small copy
 * of 07 where it lands, which is what keeps the ground busy for as long as the
 * rain lasts.
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
  rain: { at: 0.38, for: 0.54 },
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
 * `MAX_SWORDS` is how many are ever *made*, and the spawn rate is worked back
 * from how long one is in the air, so the pool is the budget rather than a hope.
 * At intensity 1 the interval floor of 18ms puts about 23 in the air at once,
 * inside the 20–40 the effect was asked for; a 41st is never allocated however
 * hard it rains.
 */
const MAX_SWORDS = 40;
const SWORDS_AT_ONE = 26;
const RAIN_FALL_MIN = 300;
const RAIN_FALL_MAX = 520;
/**
 * Half the width of the curtain.
 *
 * With the show centred 260px ahead of her, 175 leaves the near edge 85px clear
 * of where she stands. At 210 against a 210 focus the two exactly met and a
 * blade came down on her head every cast.
 */
const RAIN_SPREAD = 175;
const RAIN_DEPTH_SPREAD = 90;
/** Rain swords run from two-thirds her height to a little over one — many, not huge. */
const RAIN_SCALE_MIN = 0.16;
const RAIN_SCALE_MAX = 0.36;

/**
 * What keeps the rain from reading as a slideshow of one drawing.
 *
 * The swords come straight down, so the variety a tilt used to give has to come
 * from somewhere else. Two things do it, and both are things a falling sword
 * actually does rather than decoration:
 *
 *   * **Stretch.** Drawn `RAIN_STRETCH` times its height while it is moving and
 *     squeezed back to true as it arrives. That is the motion blur of something
 *     falling fast, and it is what makes the landing land — the shape settles on
 *     the frame it stops.
 *   * **A splash.** Every sword puts a small burst where it hits, out of the
 *     impact frame. Without it the blades vanish into the grass and the ground
 *     never answers; with it something is going off somewhere the whole time the
 *     rain lasts, which is what makes it feel continuous rather than dry.
 *
 * Beyond those, each one differs in where it falls, how big it is, how fast, how
 * bright, and which way round it is drawn.
 */
const RAIN_STRETCH = 1.7;
const MAX_SPLASHES = 24;
const SPLASH_FROM = 0.5;
const SPLASH_TO = 1.15;
const SPLASH_MS = 220;

/**
 * The beat the giant sword hangs at the top before it drops.
 *
 * Even timing is the enemy of weight. Something enormous does not begin falling
 * the moment it appears — it arrives, it is *seen*, and then it comes down. A
 * quarter of the descent window spent hanging costs nothing and is the
 * difference between a sword falling and a sword being dropped.
 */
const GIANT_HANG = 0.28;

/**
 * What the impact leaves on the ground.
 *
 * Two things, and neither is a new drawing. The ring is the final-burst frame
 * squashed flat and thrown outward — its two energy rings, seen from above,
 * are a shockwave running along the floor. The scar is the impact frame
 * squashed flatter still and left to fade slowly: the mark, which is the part
 * that makes the blow have happened rather than merely have been shown.
 *
 * Before this, an ultimate landed, flashed, and the world forgot it inside half
 * a second.
 */
const RING_FLATTEN = 0.2;
const RING_FROM = 0.45;
const RING_TO = 1.9;
const RING_MS = 420;
const SCAR_FLATTEN = 0.11;
const SCAR_SCALE = 1.15;
const SCAR_ALPHA = 0.5;
const SCAR_MS = 2400;

const DEFAULT_DURATION = 2600;

/** Above the ground plane, the way every other effect in the scene is depthed. */
const DEPTH_LIFT = 260;

export class WanKiemQuyTongEffect {
  /** Spares to hand back out, per texture: the swords and their splashes. */
  private readonly pool = new Map<string, Phaser.GameObjects.Image[]>();
  /** How many of each have ever been made — the allocation cap, not a live count. */
  private readonly made = new Map<string, number>();
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
   * When the charge begins and how long it has to run before the burst takes
   * it, in ms after `play`.
   *
   * The scene hangs its gathering light and its camera push on this. Same
   * reason as `impactDelay`: this is the only place that knows the shape of the
   * technique, and `setDuration` moves all of it at once.
   */
  chargeDelay(): number {
    return STAGE.charge.at * this.duration;
  }

  chargeSpan(): number {
    return (STAGE.explosion.at + STAGE.explosion.for * 0.4 - STAGE.charge.at) * this.duration;
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
    for (const bucket of this.pool.values()) for (const spare of bucket) spare.destroy();
    this.pool.clear();
    this.made.clear();
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

  /**
   * One rain sword: straight down, and something left behind where it lands.
   *
   * Vertical, with no tilt and no spin. A sword falling point-first at speed
   * does not turn, and the earlier version's drift made a divine rain look like
   * blown litter. The variety comes from everything else — where, how big, how
   * fast, how bright, which way round — plus the stretch and the splash.
   */
  private dropSword(x: number, y: number): void {
    const rnd = Phaser.Math.RND;
    const landX = x + rnd.realInRange(-RAIN_SPREAD, RAIN_SPREAD) * this.intensity;
    const landY = y + rnd.realInRange(-RAIN_DEPTH_SPREAD, RAIN_DEPTH_SPREAD);
    const sword = this.acquire(WanKiemTexture.SwordRain, MAX_SWORDS);
    if (!sword) return;

    const scale = rnd.realInRange(RAIN_SCALE_MIN, RAIN_SCALE_MAX) * this.intensity;
    const fall = rnd.realInRange(RAIN_FALL_MIN, RAIN_FALL_MAX);

    sword
      .setPosition(landX, landY - RAIN_DROP * rnd.realInRange(0.8, 1.3))
      .setRotation(0)
      // The blade's sweep trail is drawn to one side, so half of them mirrored
      // is a second silhouette for free.
      .setFlipX(rnd.frac() < 0.5)
      .setScale(scale, scale * RAIN_STRETCH)
      .setAlpha(0)
      .setDepth(landY + DEPTH_LIFT)
      .setVisible(true);

    this.scene.tweens.add({
      targets: sword,
      alpha: rnd.realInRange(0.6, 1),
      duration: fall * 0.2,
    });
    // Back to true by the time it arrives: the stretch is speed, and losing it
    // is the sword stopping.
    this.scene.tweens.add({
      targets: sword,
      scaleY: scale,
      duration: fall,
      ease: 'Quad.easeIn',
    });
    this.scene.tweens.add({
      targets: sword,
      y: landY,
      duration: fall,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.splash(landX, landY, scale);
        this.scene.tweens.add({
          targets: sword,
          alpha: 0,
          scaleY: scale * 0.7,
          duration: 130,
          ease: 'Quad.easeIn',
          onComplete: () => this.release(sword),
        });
      },
    });
  }

  /**
   * The small burst one rain sword leaves where it lands.
   *
   * The impact frame at a fraction of its size, sized off the sword that made
   * it so a big one hits harder than a small one. Capped separately from the
   * swords and pooled the same way: at the rate the rain lands, this is the
   * busiest thing on screen.
   */
  private splash(x: number, y: number, scale: number): void {
    const burst = this.acquire(WanKiemTexture.GiantImpact, MAX_SPLASHES);
    if (!burst) return;
    burst
      .setPosition(x, y)
      .setRotation(0)
      .setScale(scale * SPLASH_FROM)
      .setAlpha(0.9)
      .setDepth(y + DEPTH_LIFT - 1)
      .setVisible(true);
    this.scene.tweens.add({
      targets: burst,
      scale: scale * SPLASH_TO,
      alpha: 0,
      duration: SPLASH_MS,
      ease: 'Quad.easeOut',
      onComplete: () => this.release(burst),
    });
  }

  /** The descent: one blade out of the sky onto the point, arriving through the rain. */
  private giantSword(x: number, y: number, window: { at: number; length: number }): void {
    this.after(window.at, () => {
      const sprite = this.image(WanKiemTexture.GiantSword, x, y - GIANT_DROP)
        .setScale(GIANT_SCALE * this.intensity)
        .setAlpha(0);
      this.stageSprites.add(sprite);

      const hang = window.length * GIANT_HANG;
      const drop = window.length - hang;

      this.scene.tweens.add({ targets: sprite, alpha: 1, duration: hang * 0.7 });
      this.scene.tweens.add({
        targets: sprite,
        y,
        delay: hang,
        duration: drop,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.ring(x, y);
          this.scar(x, y);
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

  /**
   * The shockwave running out along the floor.
   *
   * The final-burst frame squashed flat: its two energy rings, seen from above
   * rather than side on, are exactly this. Behind everything else at the point,
   * because it is on the ground and the blade is standing in it.
   */
  private ring(x: number, y: number): void {
    const size = GIANT_SCALE * this.intensity;
    const ring = this.image(WanKiemTexture.FinalBurst, x, y)
      .setScale(size * RING_FROM, size * RING_FROM * RING_FLATTEN)
      .setAlpha(0.85)
      .setDepth(y + DEPTH_LIFT - 3);
    this.stageSprites.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: size * RING_TO,
      scaleY: size * RING_TO * RING_FLATTEN,
      alpha: 0,
      duration: RING_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.stageSprites.delete(ring);
        ring.destroy();
      },
    });
  }

  /**
   * The mark left where it went in.
   *
   * Fades over more than two seconds, which is far longer than anything else
   * here and is the whole point: every other part of the technique is gone
   * within half a second of landing, and a blow the world forgets that fast did
   * not land at all. It sits under the ring and stays after it.
   */
  private scar(x: number, y: number): void {
    const size = GIANT_SCALE * this.intensity * SCAR_SCALE;
    const mark = this.image(WanKiemTexture.GiantImpact, x, y)
      .setScale(size, size * SCAR_FLATTEN)
      .setAlpha(0)
      .setDepth(y + DEPTH_LIFT - 4);
    this.stageSprites.add(mark);
    this.scene.tweens.add({ targets: mark, alpha: SCAR_ALPHA, duration: 90 });
    this.scene.tweens.add({
      targets: mark,
      alpha: 0,
      delay: 90,
      duration: SCAR_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.stageSprites.delete(mark);
        mark.destroy();
      },
    });
  }

  private image(key: string, x: number, y: number): Phaser.GameObjects.Image {
    const origin = ORIGIN[key] ?? { x: 0.5, y: 0.95 };
    return this.scene.add
      .image(x, y, key)
      .setOrigin(origin.x, origin.y)
      .setDepth(y + DEPTH_LIFT);
  }

  /**
   * A spare of this texture, or a new one while the pool is still filling.
   *
   * `cap` bounds how many are ever *made*, not how many are out: once the pool
   * has filled it hands the same objects round for the rest of the session.
   * Returning null when the cap is reached drops a sword rather than growing —
   * at the rate this rains, one runaway would be hundreds.
   */
  private acquire(key: string, cap: number): Phaser.GameObjects.Image | null {
    const spare = this.pool.get(key)?.pop();
    if (spare) {
      this.live.add(spare);
      return spare;
    }
    const made = this.made.get(key) ?? 0;
    if (made >= cap) return null;
    const origin = ORIGIN[key] ?? { x: 0.5, y: 0.95 };
    const image = this.scene.add.image(0, 0, key).setOrigin(origin.x, origin.y);
    this.made.set(key, made + 1);
    this.live.add(image);
    return image;
  }

  /** Back to its own bucket — the texture it carries says which. */
  private release(image: Phaser.GameObjects.Image): void {
    this.live.delete(image);
    image.setVisible(false).setAlpha(0).setFlipX(false);
    const key = image.texture.key;
    const bucket = this.pool.get(key);
    if (bucket) bucket.push(image);
    else this.pool.set(key, [image]);
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
