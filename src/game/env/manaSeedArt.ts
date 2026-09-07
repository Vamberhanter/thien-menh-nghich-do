import Phaser from 'phaser';
import { gameAssetUrl } from '../../net/assets';
import { KitRole, kitKey } from './textures';
import type { EnvKit } from './kit';

/** This kit's own corner of the texture cache. */
const MS = (role: string) => kitKey('manaseed', role);

/**
 * Mana Seed "seasonal forest sample (summer)" by Seliel the Shaper, sliced at
 * runtime out of the single 256x256 sheet the sample ships.
 *
 * Run `npm run env:manaseed` to copy the sheet into `public/`. The sample is a
 * teaser rather than a full tileset — its cliff autotiles have holes and it only
 * carries one grass, so this kit deliberately sticks to the pieces that are
 * complete: ground, tree, bushes, rocks, wall and the cave mouth.
 */
export const MANA_SEED_SOURCE = 'manaseed-summer';
export const MANA_SEED_SOURCE_URL = gameAssetUrl(
  'environment/manaseed/seasonal-sample-summer.png',
);

/** The sheet this slice table was measured against. */
export const MANA_SEED_SHEET = { width: 256, height: 256, tile: 16 } as const;

const T = MANA_SEED_SHEET.tile;

/** Decal keys, kept apart from `WorldTexture` because only this kit has them. */
const Decal = {
  BushLarge: 'ms-bush-large',
  BushMedium: 'ms-bush-medium',
  Sprout: 'ms-sprout',
  Pebbles: 'ms-pebbles',
  SmallRock: 'ms-small-rock',
  FlowersA: 'ms-flowers-a',
  FlowersB: 'ms-flowers-b',
  Wall: 'ms-wall',
} as const;

interface Slice {
  key: string;
  /** Top-left corner in sheet tiles. */
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/**
 * The grass block is 1x5 rather than a single tile because that run is the only
 * one on the sheet whose wrap seam is no harsher than its interior seams.
 */
const SLICES: readonly Slice[] = [
  { key: MS(KitRole.Grass), col: 0, row: 1, cols: 1, rows: 5 },
  // The sample only ships one grass, so the forest floor has to reuse it.
  { key: MS(KitRole.Forest), col: 0, row: 1, cols: 1, rows: 5 },
  { key: MS(KitRole.Tree), col: 11, row: 0, cols: 5, rows: 7 },
  { key: MS(KitRole.Rock), col: 3, row: 14, cols: 2, rows: 2 },
  { key: MS(KitRole.TrainingStone), col: 4, row: 8, cols: 1, rows: 2 },
  { key: MS(KitRole.Portal), col: 11, row: 7, cols: 5, rows: 5 },
  { key: Decal.BushLarge, col: 2, row: 8, cols: 2, rows: 2 },
  { key: Decal.BushMedium, col: 1, row: 8, cols: 1, rows: 2 },
  { key: Decal.Sprout, col: 0, row: 8, cols: 1, rows: 2 },
  { key: Decal.Pebbles, col: 4, row: 6, cols: 1, rows: 1 },
  { key: Decal.SmallRock, col: 4, row: 7, cols: 1, rows: 1 },
  { key: Decal.FlowersA, col: 0, row: 6, cols: 1, rows: 1 },
  { key: Decal.FlowersB, col: 2, row: 7, cols: 1, rows: 1 },
  { key: Decal.Wall, col: 2, row: 10, cols: 3, rows: 3 },
];

export const MANA_SEED_TEXTURES: readonly string[] = SLICES.map((s) => s.key);

/** Cave mouth height in sheet pixels, used to lift the portal name plate clear. */
const CAVE_HEIGHT = 5 * T;

export function manaSeedLoaded(scene: Phaser.Scene): boolean {
  return scene.textures.exists(MANA_SEED_SOURCE);
}

/** Cuts every slice into its own nearest-neighbour texture, magnified `scale`x. */
export function paintManaSeedEnv(scene: Phaser.Scene, scale: number): void {
  const source = scene.textures.get(MANA_SEED_SOURCE).getSourceImage() as CanvasImageSource;

  for (const slice of SLICES) {
    if (scene.textures.exists(slice.key)) continue;
    const w = slice.cols * T;
    const h = slice.rows * T;
    const texture = scene.textures.createCanvas(slice.key, w * scale, h * scale);
    if (!texture) continue;
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, slice.col * T, slice.row * T, w, h, 0, 0, w * scale, h * scale);
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/**
 * Boxes are the sheet footprints multiplied by `scale`, and every prop anchors
 * at its base — the tree's trunk sits dead centre of its block, so a centred
 * box lines up with the bark.
 */
export function manaSeedKit(scale: number): EnvKit {
  const box = (width: number, height: number) => ({
    width: width * scale,
    height: height * scale,
    offsetY: -height * scale,
  });

  return {
    id: `manaseed-${scale}x`,
    label: `Mana Seed ${scale}x (tile ${T * scale}px)`,
    // No ash: this is a summer forest sample. Its one dark tile is a cave floor,
    // and its ground clutter is drawn onto opaque grass, which on the valley's
    // dark ground reads as a scatter of green squares.
    ground: { grass: MS(KitRole.Grass), forest: MS(KitRole.Forest) },
    tree: { texture: MS(KitRole.Tree), originY: 1, box: box(24, 9) },
    rock: { texture: MS(KitRole.Rock), originY: 1, box: box(26, 9) },
    stone: { texture: MS(KitRole.TrainingStone), originY: 1, box: box(12, 8) },
    portal: { texture: MS(KitRole.Portal), originY: 1, labelLift: CAVE_HEIGHT * scale + 8 },
    decals: [
      { texture: Decal.BushLarge, weight: 3 },
      { texture: Decal.BushMedium, weight: 4 },
      { texture: Decal.Sprout, weight: 4 },
      { texture: Decal.Pebbles, weight: 5 },
      { texture: Decal.SmallRock, weight: 3 },
      { texture: Decal.FlowersA, weight: 5 },
      { texture: Decal.FlowersB, weight: 5 },
      { texture: Decal.Wall, weight: 1 },
    ],
  };
}
