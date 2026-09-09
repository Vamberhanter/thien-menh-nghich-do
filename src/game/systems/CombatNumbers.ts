import Phaser from 'phaser';

/**
 * The damage numbers that fly off a hit.
 *
 * **Why these are not `Text`.** They were, one new `GameObject.Text` per hit,
 * destroyed 600ms later. Each of those builds an HTML canvas, measures the
 * string, draws the glyphs and uploads a fresh WebGL texture — measured in this
 * game at **0.93ms each**, against 0.01ms for an image and a 6.9ms frame at
 * 144Hz. One number is a fifth of the frame. A crescent that sweeps four mobs
 * makes four in the same frame and blows the budget outright, which is exactly
 * what a player feels as the game hitching when a skill lands.
 *
 * A bitmap font has no per-number cost at all: the glyphs are baked once into
 * one texture at boot, and a number is a handful of quads out of it that batch
 * with each other. The objects are pooled on top of that, so a burst of hits
 * allocates nothing.
 *
 * **Numbers only.** The same call also draws event banners — a level-up title,
 * a kill notice — in arbitrary Vietnamese, which a thirteen-glyph font cannot
 * spell. Those stay on `Text`, and should: they arrive one at a time, seconds
 * apart, and 0.93ms once is not a stutter. This is for the path that fires four
 * times in a frame.
 */

const FONT = 'combat-numbers';

/** Everything a damage number is spelt with. */
const GLYPHS = '0123456789-+!';

/**
 * Baked at the size it is drawn at, so a normal hit is pixel-for-pixel the
 * texture and a critical is a clean 1.5x of it. Downscaling a bitmap font drops
 * whole rows of pixels and looks broken; upscaling by halves does not.
 */
const BAKE_PX = 16;
const CELL_W = 12;
const CELL_H = 20;
const CRIT_PX = 24;

const RISE = 22;
const LIFE_MS = 600;

/** Past this many at once the oldest is recycled early rather than a new one made. */
const MAX_LIVE = 40;

export class CombatNumbers {
  private readonly pool: Phaser.GameObjects.BitmapText[] = [];
  private readonly live: Phaser.GameObjects.BitmapText[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    bakeFont(scene);
  }

  /** True when the font baked — a canvas texture can fail, and `Text` still works. */
  get ready(): boolean {
    return this.scene.cache.bitmapFont.has(FONT);
  }

  show(x: number, y: number, text: string, tint: number, critical: boolean): void {
    const number = this.acquire();
    if (!number) return;
    number
      .setText(text)
      .setFontSize(critical ? CRIT_PX : BAKE_PX)
      .setPosition(x, y)
      .setOrigin(0.5)
      .setTint(tint)
      .setAlpha(1)
      .setDepth(10000)
      .setVisible(true);

    this.scene.tweens.add({
      targets: number,
      y: y - RISE,
      alpha: 0,
      duration: LIFE_MS,
      onComplete: () => this.release(number),
    });
  }

  destroy(): void {
    for (const number of [...this.live, ...this.pool]) number.destroy();
    this.live.length = 0;
    this.pool.length = 0;
  }

  private acquire(): Phaser.GameObjects.BitmapText | null {
    const spare = this.pool.pop();
    if (spare) {
      this.live.push(spare);
      return spare;
    }
    if (this.live.length >= MAX_LIVE) {
      // Recycle the oldest rather than grow: forty numbers on screen is already
      // more than anyone is reading.
      const oldest = this.live.shift();
      if (!oldest) return null;
      this.scene.tweens.killTweensOf(oldest);
      this.live.push(oldest);
      return oldest;
    }
    const made = this.scene.add.bitmapText(0, 0, FONT, '');
    this.live.push(made);
    return made;
  }

  private release(number: Phaser.GameObjects.BitmapText): void {
    const at = this.live.indexOf(number);
    if (at >= 0) this.live.splice(at, 1);
    number.setVisible(false);
    this.pool.push(number);
  }
}

/**
 * Draws the glyph strip once and registers it as a retro font.
 *
 * White, so the tint on each number is the only thing that colours it. One row
 * of fixed-width cells is what `RetroFont` wants, and monospace is what the
 * rest of this game's text uses, so the numbers still look like they belong to
 * the same HUD.
 */
function bakeFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.has(FONT)) return;
  const key = `${FONT}-glyphs`;
  try {
    if (!scene.textures.exists(key)) {
      const texture = scene.textures.createCanvas(key, CELL_W * GLYPHS.length, CELL_H);
      if (!texture) return;
      const ctx = texture.getContext();
      ctx.imageSmoothingEnabled = false;
      ctx.font = `${BAKE_PX}px monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < GLYPHS.length; i++) {
        ctx.fillText(GLYPHS[i], i * CELL_W + CELL_W / 2, CELL_H / 2);
      }
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    scene.cache.bitmapFont.add(
      FONT,
      // `GameObjects.RetroFont`, not `Display.RetroFont` — the second is what
      // most of the documentation says and it does not exist in this build,
      // which is what the try/catch below is really for.
      Phaser.GameObjects.RetroFont.Parse(scene, {
        image: key,
        width: CELL_W,
        height: CELL_H,
        chars: GLYPHS,
        charsPerRow: GLYPHS.length,
        'offset.x': 0,
        'offset.y': 0,
        'spacing.x': 0,
        'spacing.y': 0,
        lineSpacing: 0,
      }),
    );
  } catch (error) {
    /*
     * A failed bake must not take the game with it.
     *
     * The first version threw out of here, and because this runs in the
     * scene's `create` the whole world failed to start — no player, no map, a
     * black screen behind the lobby. Damage numbers are worth 0.93ms a frame;
     * they are not worth the game. `ready` stays false and every number falls
     * back to `Text`, which is exactly where it was before this file existed.
     */
    // eslint-disable-next-line no-console
    console.warn('combat numbers: bitmap font unavailable, falling back to Text', error);
  }
}
