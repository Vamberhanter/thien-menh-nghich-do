import Phaser from 'phaser';
import { paint } from '../env/textures';
import { createFxAnimations, FX_CLIP, FX_TEXTURE, fxDuration } from '../animations/fxAnimations';

/**
 * The damage a heavy technique leaves in the ground.
 *
 * **Why this is drawn rather than borrowed.** Every impact in the game so far
 * has left behind a piece of its own effect art — a crystal burst squashed flat
 * and faded out. That reads as light lying on the grass, not as broken ground,
 * because it *is* light: the frames are glowing energy and no amount of
 * flattening makes them earth. Ground damage has to be dark, and nothing in the
 * atlases is.
 *
 * So it is baked here, once, from the same pixel painter the placeholder
 * scenery uses. Two layers, because that is how a real impact decal reads:
 *
 *   * **the scar** — near-black scorch and cracked earth, no colour of its own.
 *     It is the damage, and it outlives everything else about the technique.
 *   * **the embers** — the same cracks in white, tinted to whichever technique
 *     opened them, fading out several times faster. The cracks glow, then cool
 *     to plain broken ground.
 *
 * Tint is why they are two textures and not one. A tint multiplies, so tinting
 * a near-black scar red produces a near-black scar; only the bright layer can
 * carry the colour of the thing that made it.
 *
 * **Three variants, rotated at random.** One decal stamped repeatedly reads as
 * a sticker the moment a player sees two of them. Three shapes and a free
 * rotation is enough that a volley of them never repeats visibly, and it costs
 * three small textures.
 */

const SCAR_TEXTURE = ['ground-scar-0', 'ground-scar-1', 'ground-scar-2'] as const;
const EMBER_TEXTURE = ['ground-ember-0', 'ground-ember-1', 'ground-ember-2'] as const;

/** Painter units; the painter multiplies by PIXEL, and the sprite scales again. */
const ART_W = 120;
const ART_H = 120;

/** How the scorch is built: a ragged blotch, then cracks walking out of it. */
const BLOTCH_RX = 34;
const BLOTCH_RY = 30;
const BLOTCH_RAGGED = 0.3;
const CRACKS = 7;
const CRACK_STEPS = 26;
const CRACK_STEP = 2.1;
const CRACK_WANDER = 0.55;

/**
 * How long one stays.
 *
 * The scar outlasts the technique by a long way on purpose — the whole point of
 * ground damage is that the world still shows it once the light has gone. The
 * embers are tuned to be out well before it, so what is left is damage rather
 * than a glow that never quite fades.
 */
const SCAR_MS = 9000;
const SCAR_FADE_MS = 2600;
const SCAR_ALPHA = 0.8;
const EMBER_MS = 900;
const EMBER_ALPHA = 0.9;

/**
 * Ceiling on how many are on the ground at once.
 *
 * A rain of twenty swords could ask for twenty of these a second, and a nine
 * second life would leave a carpet. Past the cap the oldest goes early, which
 * is the least noticeable one to lose.
 */
const MAX_SCARS = 26;

/** Under everything that stands on the ground, above the ground itself. */
const DEPTH_BIAS = -6;

/**
 * How high above the decal the dust is allowed to climb, as a share of the
 * scale asked for.
 *
 * The burst art is drawn face-on — a cloud standing up off the floor — while
 * the decal is squashed to lie on it. Those are both right: the hole is flat
 * and the dust above it is not, and squashing the dust would lay the cloud on
 * its side. So the burst keeps its own proportions and only the decal is
 * flattened.
 */
const BURST_RISE = 1;

export interface ScarOptions {
  /** 1 is about 240px across. */
  scale?: number;
  /** Colour of the cracks while they are still hot. */
  ember?: number;
  /** Overrides the default lifetime, in ms. */
  life?: number;
}

/** Extra knobs for the drawn burst, on top of the decal it leaves behind. */
export interface ShatterOptions extends ScarOptions {
  /**
   * Size of the burst, if it should differ from the hole it leaves. A boss
   * slam throws far more rubble than its crater is wide; a mob charge less.
   */
  burst?: number;
  /** Skip the lasting decal — for a hit that shakes the ground without opening it. */
  markGround?: boolean;
}

/** A tiny deterministic generator, so the baked shapes are the same every run. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export class GroundScars {
  private readonly live: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < SCAR_TEXTURE.length; i++) bake(scene, i);
    // Here rather than in the boot scene: this class is the only thing that
    // plays the clip, and baking its own decals and registering its own
    // animation in one place is what stops one arriving without the other.
    createFxAnimations(scene);
  }

  /**
   * Break the ground at a point.
   *
   * `y` is the ground point, and the decal is centred on it rather than hung
   * from a pivot: it lies flat on the floor, so it has no feet and no up.
   */
  mark(x: number, y: number, options: ScarOptions = {}): void {
    const scale = options.scale ?? 1;
    const life = options.life ?? SCAR_MS;
    const variant = Phaser.Math.RND.between(0, SCAR_TEXTURE.length - 1);
    const angle = Phaser.Math.RND.realInRange(0, Math.PI * 2);

    const scar = this.scene.add
      .image(x, y, SCAR_TEXTURE[variant])
      .setDepth(y + DEPTH_BIAS)
      .setRotation(angle)
      // Squashed vertically because it is lying on the floor of a world seen
      // from above and in front, the same reason every shadow here is an
      // ellipse rather than a circle.
      .setScale(scale, scale * 0.6)
      .setAlpha(0);
    this.track(scar);

    this.scene.tweens.add({ targets: scar, alpha: SCAR_ALPHA, duration: 120 });
    this.scene.tweens.add({
      targets: scar,
      alpha: 0,
      delay: Math.max(0, life - SCAR_FADE_MS),
      duration: SCAR_FADE_MS,
      onComplete: () => this.retire(scar),
    });

    if (options.ember === undefined) return;
    const ember = this.scene.add
      .image(x, y, EMBER_TEXTURE[variant])
      .setDepth(y + DEPTH_BIAS + 1)
      .setRotation(angle)
      .setScale(scale, scale * 0.6)
      .setAlpha(EMBER_ALPHA)
      .setTint(options.ember)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.track(ember);
    this.scene.tweens.add({
      targets: ember,
      alpha: 0,
      duration: EMBER_MS,
      ease: 'Quad.easeIn',
      onComplete: () => this.retire(ember),
    });
  }

  /**
   * Break the ground *and show it breaking*.
   *
   * `mark` alone was always half the story: the decal is what the world keeps,
   * but nothing drew the moment it happened, so a crater appeared out of an
   * unrelated flash of light. This plays the drawn twenty frames of it —
   * cracking, rubble thrown, dust boiling up and settling — and leaves the
   * decal underneath, so what is left when the dust clears is the hole.
   *
   * The two are one call rather than two because every caller wants both, and
   * a caller that remembered one and forgot the other is exactly the seam this
   * is here to close.
   */
  shatter(x: number, y: number, options: ShatterOptions = {}): void {
    const scale = options.scale ?? 1;

    // Underneath first, so the rubble is thrown over its own hole rather than
    // the hole being stamped on top of the dust.
    if (options.markGround !== false) this.mark(x, y, options);

    const burst = this.scene.add
      .sprite(x, y, FX_TEXTURE, FX_CLIP.groundBreak.frame)
      // Above the decal and above whatever is standing on the ground here: it
      // is airborne rubble, and it hides the feet of what threw it.
      .setDepth(y + 240)
      .setScale((options.burst ?? scale), (options.burst ?? scale) * BURST_RISE);

    burst.play(FX_CLIP.groundBreak.anim);
    // Destroyed on a timer rather than on ANIMATION_COMPLETE: a tween or a
    // scene teardown can eat the event, and a stranded burst holding its last
    // frame is a pile of rubble that never clears.
    this.scene.time.delayedCall(fxDuration('ground_break') + 40, () => burst.destroy());
  }

  /** Everything gone — a zone change should not carry last zone's craters over. */
  clear(): void {
    for (const decal of this.live) {
      this.scene.tweens.killTweensOf(decal);
      decal.destroy();
    }
    this.live.length = 0;
  }

  private track(decal: Phaser.GameObjects.Image): void {
    this.live.push(decal);
    while (this.live.length > MAX_SCARS) {
      const oldest = this.live.shift();
      if (!oldest) break;
      this.scene.tweens.killTweensOf(oldest);
      oldest.destroy();
    }
  }

  private retire(decal: Phaser.GameObjects.Image): void {
    const at = this.live.indexOf(decal);
    if (at >= 0) this.live.splice(at, 1);
    decal.destroy();
  }
}

/**
 * Bakes one scar and its matching ember layer.
 *
 * They share a seed, so the bright cracks sit exactly on top of the dark ones —
 * the ember layer is the same drawing lit up, not a second pattern laid over
 * the first.
 */
function bake(scene: Phaser.Scene, variant: number): void {
  const seed = 0x5eed + variant * 977;

  paint(scene, SCAR_TEXTURE[variant], ART_W, ART_H, (px) => {
    const random = rng(seed);
    // Scorched earth, not black. The first pass painted the burn near-black and
    // the cracks near-black on top of it, so the splits vanished into the patch
    // and all that was left was a dark smudge. The burn is a translucent brown
    // the grass shows through, and the cracks are the darkest thing here.
    blotch(px, random, 'rgba(38,27,20,0.62)');
    grit(px, rng(seed + 2));
    cracks(px, rng(seed + 1), (x, y, w) => px(x, y, w, w, 'rgba(7,5,5,0.95)'));
  });

  paint(scene, EMBER_TEXTURE[variant], ART_W, ART_H, (px) => {
    // No blotch: scorched earth does not glow, only the split in it does.
    cracks(px, rng(seed + 1), (x, y, w) => px(x, y, w, w, 'rgba(255,255,255,0.9)'));
  });
}

type Px = (x: number, y: number, w: number, h: number, color: string) => void;

/**
 * Dust and turned-up earth around the rim.
 *
 * Lighter than the ground rather than darker, because an impact throws pale
 * soil out of a hole as well as burning what is left in it — and because a
 * decal made only of darker things reads as a shadow.
 */
function grit(px: Px, random: () => number): void {
  const cx = ART_W / 2;
  const cy = ART_H / 2;
  for (let i = 0; i < 90; i++) {
    const angle = random() * Math.PI * 2;
    const reach = 0.75 + random() * 0.55;
    const x = Math.round(cx + Math.cos(angle) * BLOTCH_RX * reach);
    const y = Math.round(cy + Math.sin(angle) * BLOTCH_RY * reach);
    if (x < 0 || y < 0 || x >= ART_W || y >= ART_H) continue;
    px(x, y, 1, 1, 'rgba(104,92,74,0.34)');
  }
}

/** The burned patch: an ellipse whose edge is chewed rather than smooth. */
function blotch(px: Px, random: () => number, colour: string): void {
  const cx = ART_W / 2;
  const cy = ART_H / 2;
  for (let y = 0; y < ART_H; y++) {
    for (let x = 0; x < ART_W; x++) {
      const dx = (x - cx) / BLOTCH_RX;
      const dy = (y - cy) / BLOTCH_RY;
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      // Thinning towards the rim, and ragged: a hard ellipse reads as a decal,
      // a rim that breaks up reads as a burn.
      if (d > 1 - BLOTCH_RAGGED && random() < (d - (1 - BLOTCH_RAGGED)) / BLOTCH_RAGGED) continue;
      px(x, y, 1, 1, colour);
    }
  }
}

/** Splits walking out of the centre, thinning as they go. */
function cracks(_px: Px, random: () => number, stamp: (x: number, y: number, w: number) => void): void {
  const cx = ART_W / 2;
  const cy = ART_H / 2;
  for (let i = 0; i < CRACKS; i++) {
    // Spread around the circle rather than placed freely, so no scar comes out
    // with every crack bunched on one side.
    let angle = (i / CRACKS) * Math.PI * 2 + random() * 0.7;
    let x = cx;
    let y = cy;
    const length = CRACK_STEPS * (0.55 + random() * 0.45);
    for (let step = 0; step < length; step++) {
      angle += (random() - 0.5) * CRACK_WANDER;
      x += Math.cos(angle) * CRACK_STEP;
      y += Math.sin(angle) * CRACK_STEP;
      if (x < 1 || y < 1 || x > ART_W - 2 || y > ART_H - 2) break;
      const width = step < length * 0.35 ? 2 : 1;
      stamp(Math.round(x), Math.round(y), width);
      // A crack forks rather than curving forever; one short branch per split.
      if (width === 2 && random() < 0.12) {
        let bx = x;
        let by = y;
        let ba = angle + (random() < 0.5 ? -0.9 : 0.9);
        for (let b = 0; b < 6; b++) {
          bx += Math.cos(ba) * CRACK_STEP;
          by += Math.sin(ba) * CRACK_STEP;
          if (bx < 1 || by < 1 || bx > ART_W - 2 || by > ART_H - 2) break;
          stamp(Math.round(bx), Math.round(by), 1);
        }
      }
    }
  }
}
