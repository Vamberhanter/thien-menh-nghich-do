import Phaser from 'phaser';

/**
 * The mark a sprite leaves on the floor it is standing on.
 *
 * This is the cheapest depth cue in a top-down game and the one that does the
 * most work. Without it a sprite is a picture laid over the ground; with it the
 * picture is attached to a point on the ground, and everything else — height,
 * thickness, one thing being in front of another — has something to be measured
 * against. It matters twice over for anything that can leave the floor, because
 * in this view nothing else distinguishes "higher up" from "further north": the
 * gap between a sprite and its own shadow *is* the height.
 *
 * Two ellipses rather than one, because a real shadow does two things at once as
 * its caster rises and they pull opposite ways: the hard middle shrinks and
 * gives out, while the soft edge around it spreads. One flat ellipse reads as a
 * sticker. A `core` that tightens and fades plus a `halo` nearly twice its width
 * that opens up as the core goes is enough to suggest the penumbra a real one
 * has, at the cost of one extra draw.
 */
export interface GroundShadowOptions {
  /** Width and height of the core at ground level, in pixels. */
  size?: { w: number; h: number };
  /** How far the caster can rise before the shadow reaches its high value. */
  lift?: number;
  /** Multiplied into both ellipses — one number to scale a shadow to its owner. */
  scale?: number;
}

const DEFAULT_SIZE = { w: 44, h: 17 };
const DEFAULT_LIFT = 44;

/** First value is at ground level, second at full lift. */
const CORE_SCALE = [1, 0.62];
const CORE_ALPHA = [0.5, 0.16];
const HALO_WIDEN = 1.75;
const HALO_SCALE = [0.7, 1.05];
const HALO_ALPHA = [0.13, 0.2];

/** Near-black with a little of the world's violet in it, so it is not a hole. */
const COLOUR = 0x120a1e;

export class GroundShadow {
  private core: Phaser.GameObjects.Ellipse | null = null;
  private halo: Phaser.GameObjects.Ellipse | null = null;
  private readonly size: { w: number; h: number };
  private readonly lift: number;
  private readonly scale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    options: GroundShadowOptions = {},
  ) {
    this.size = options.size ?? DEFAULT_SIZE;
    this.lift = options.lift ?? DEFAULT_LIFT;
    this.scale = options.scale ?? 1;
  }

  /**
   * Puts the shadow under `(x, y)`, sized for how far above it the sprite is
   * drawn. `height` of 0 is standing on the ground, which is the common case.
   *
   * Made on the first call rather than in the constructor, so an entity that is
   * destroyed before it is ever drawn never pays for one.
   */
  sync(x: number, y: number, height = 0): void {
    if (!this.core) {
      const mark = (w: number, h: number) =>
        this.scene.add.ellipse(x, y, w * this.scale, h * this.scale, COLOUR);
      // halo first, so it is added underneath the core
      this.halo = mark(this.size.w * HALO_WIDEN, this.size.h * HALO_WIDEN);
      this.core = mark(this.size.w, this.size.h);
    }

    const t = this.lift > 0 ? Math.min(1, height / this.lift) : 0;
    const lerp = (pair: readonly number[]) => pair[0] + (pair[1] - pair[0]) * t;
    // one under the sprite's own depth key, so it lies on the ground it is over
    const depth = y - 1;

    this.halo!.setVisible(true).setPosition(x, y).setDepth(depth)
      .setScale(lerp(HALO_SCALE))
      .setAlpha(lerp(HALO_ALPHA));
    this.core!.setVisible(true).setPosition(x, y).setDepth(depth)
      .setScale(lerp(CORE_SCALE))
      .setAlpha(lerp(CORE_ALPHA));
  }

  /** For a caster that has left the world — dead, despawned, mid-teleport. */
  hide(): void {
    this.core?.setVisible(false);
    this.halo?.setVisible(false);
  }

  destroy(): void {
    this.core?.destroy();
    this.halo?.destroy();
    this.core = null;
    this.halo = null;
  }
}
