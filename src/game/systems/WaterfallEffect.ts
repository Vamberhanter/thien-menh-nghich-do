import Phaser from 'phaser';
import type { EditableProp } from './map/TilemapTerrain';

/**
 * Every waterfall in Ngũ Hành Sơn is a single static frame baked into a
 * larger rock/pond/riverbed sprite (see `nguHanhSon.ts`'s `RIM_WATERFALL`,
 * `LAKE_FALL_BIG`/`LAKE_FALL_SMALL`, `GROUND_FALL`) — there is no dedicated
 * animation strip for the water itself. Rather than author one, this lays a
 * translucent scrolling streak over the part of each known frame that is
 * water, so the fall reads as moving without a new art asset.
 *
 * The box for each frame was picked by eye off the cropped source art —
 * `xFrac` is the box's horizontal centre and `topFrac`/`heightFrac` its
 * vertical span, all as a fraction of the frame's own width/height, matched
 * to where the blue chute actually sits inside that frame's rock/greenery.
 */
interface WaterfallSpec {
  readonly texture: string;
  readonly frame: string;
  readonly xFrac: number;
  readonly topFrac: number;
  readonly widthFrac: number;
  readonly heightFrac: number;
}

const WATERFALLS: readonly WaterfallSpec[] = [
  // Rim cliff falls.
  { texture: 'nhs2-cliff2', frame: 'cliff2_18', xFrac: 0.5, topFrac: 0.25, widthFrac: 0.4, heightFrac: 0.75 },
  { texture: 'nhs2-cliff2', frame: 'cliff2_4', xFrac: 0.76, topFrac: 0.12, widthFrac: 0.3, heightFrac: 0.88 },
  // Pond outflow.
  { texture: 'nhs2-lake', frame: 'lake_0', xFrac: 0.35, topFrac: 0.12, widthFrac: 0.28, heightFrac: 0.85 },
  { texture: 'nhs2-lake', frame: 'lake_5', xFrac: 0.5, topFrac: 0.42, widthFrac: 0.32, heightFrac: 0.55 },
  // River mouth splash.
  { texture: 'nhs2-ground', frame: 'ground_87', xFrac: 0.5, topFrac: 0.05, widthFrac: 0.75, heightFrac: 0.9 },
];

const STREAK_TEXTURE_KEY = 'waterfall-streak';
/** World px the streak texture scrolls per second. */
const SCROLL_SPEED = 90;

/** A handful of soft, uneven vertical bands — built once, reused by every waterfall. */
function ensureStreakTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(STREAK_TEXTURE_KEY)) return;
  const width = 32;
  const height = 64;
  const g = scene.add.graphics();
  const streaks: readonly { x: number; w: number; a: number }[] = [
    { x: 2, w: 3, a: 0.5 },
    { x: 8, w: 2, a: 0.32 },
    { x: 13, w: 4, a: 0.6 },
    { x: 20, w: 2, a: 0.3 },
    { x: 25, w: 3, a: 0.48 },
  ];
  for (const s of streaks) {
    g.fillStyle(0xdff7ff, s.a);
    g.fillRect(s.x, 0, s.w, height);
  }
  g.generateTexture(STREAK_TEXTURE_KEY, width, height);
  g.destroy();
}

/**
 * Lays a scrolling water overlay on every placed prop that matches a known
 * waterfall frame, and scrolls them each frame. Rebuilt whenever the zone's
 * props change (`build`), so it always matches whatever `nguHanhSon.ts` or a
 * saved map-editor draft actually placed rather than a hardcoded position.
 */
export class WaterfallEffect {
  private tiles: Phaser.GameObjects.TileSprite[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    ensureStreakTexture(scene);
  }

  build(editableProps: readonly EditableProp[]): void {
    this.destroy();
    for (const prop of editableProps) {
      const spec = WATERFALLS.find((w) => w.texture === prop.def.texture && w.frame === prop.def.frame);
      if (!spec) continue;
      const frameData = this.scene.textures.getFrame(prop.def.texture, prop.def.frame);
      if (!frameData) continue;
      const fw = frameData.width;
      const fh = frameData.height;
      const boxWidth = fw * spec.widthFrac;
      const boxHeight = fh * spec.heightFrac;
      // The prop's own origin is (0.5, 1) — bottom-centre sits at (x, y).
      const left = prop.sprite.x - fw / 2 + fw * spec.xFrac - boxWidth / 2;
      const top = prop.sprite.y - fh + fh * spec.topFrac;
      const tile = this.scene.add
        .tileSprite(left + boxWidth / 2, top + boxHeight / 2, boxWidth, boxHeight, STREAK_TEXTURE_KEY)
        .setOrigin(0.5, 0.5)
        // Just above the rock it belongs to — not `OVERHEAD_DEPTH`, so it
        // still sorts against a character the same way the rock itself does.
        .setDepth(prop.sprite.depth + 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.55);
      this.tiles.push(tile);
    }
  }

  update(delta: number): void {
    if (this.tiles.length === 0) return;
    const step = (SCROLL_SPEED * delta) / 1000;
    for (const tile of this.tiles) tile.tilePositionY += step;
  }

  destroy(): void {
    for (const tile of this.tiles) tile.destroy();
    this.tiles = [];
  }
}
