import Phaser from 'phaser';

/**
 * Texture keys no kit owns, so they keep a plain key: no tileset ships a
 * cultivation shrine, and the loot pile comes from the item pack instead.
 */
export const WorldTexture = {
  Shrine: 'prop-shrine',
  Loot: 'prop-loot',
} as const;

/**
 * The scenery roles a kit fills. These are role names, not texture keys — every
 * kit is baked at boot so that a zone can pick whichever one suits its ground
 * (see `envKitFor` in `./index.ts`), which means two kits are alive at once and
 * cannot share a key. Each namespaces its roles through `kitKey`.
 */
export const KitRole = {
  Grass: 'tile-grass',
  Forest: 'tile-forest',
  Ash: 'tile-ash',
  Tree: 'prop-tree',
  Rock: 'prop-rock',
  TrainingStone: 'prop-training-stone',
  Portal: 'prop-portal',
} as const;

export function kitKey(prefix: string, role: string): string {
  return `${prefix}/${role}`;
}

/** One key per species in the roster (see `./monsterArt.ts` for the art behind them). */
export const MobTexture = {
  Toad: 'mob-toad',
  Crab: 'mob-crab',
  Serpent: 'mob-serpent',
  Drake: 'mob-drake',
  Golem: 'mob-golem',
  Troll: 'mob-troll',
  BloodSerpent: 'mob-blood-serpent',
  EmberGolem: 'mob-ember-golem',
  FireDrake: 'mob-fire-drake',
} as const;

/** Placeholder scenery is drawn at this pixel size to match the character. */
export const PIXEL = 2;

/**
 * Draws into a canvas texture with hard pixels only. Every coordinate is
 * multiplied by PIXEL, so the placeholder scenery shares the character
 * sheet's chunky pixel grid instead of looking twice as fine.
 */
export function paint(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (px: (x: number, y: number, w: number, h: number, color: string) => void) => void,
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width * PIXEL, height * PIXEL);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  draw((x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * PIXEL, y * PIXEL, w * PIXEL, h * PIXEL);
  });
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * Copies a loaded image into a new nearest-neighbour texture, `scale` times
 * bigger. Packs drawn for a 16px world need this to hold their own next to a
 * 110px tall character.
 */
export function magnify(scene: Phaser.Scene, key: string, sourceKey: string, scale: number): void {
  if (scene.textures.exists(key) || !scene.textures.exists(sourceKey)) return;
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
  const texture = scene.textures.createCanvas(key, source.width * scale, source.height * scale);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, source.width * scale, source.height * scale);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
