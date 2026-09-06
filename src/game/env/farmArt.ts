import type Phaser from 'phaser';
import { gameAssetUrl } from '../../net/assets';
import { magnify, paint } from './textures';

/** Cute Fantasy farm props + Farm RPG growth stages staged by `npm run env:farm`. */
export const FarmTexture = {
  Soil: 'farm-soil',
  SoilWet: 'farm-soil-wet',
  Path: 'farm-path',
  /** Wider packed-earth under the lane — softens the hard road edge. */
  PathBank: 'farm-path-bank',
  FenceH: 'farm-fence-h',
  FenceV: 'farm-fence-v',
  FencePost: 'farm-fence-post',
  House: 'farm-house',
  Chicken: 'farm-chicken',
  /** Seamless dirt tile for the full farm TileSprite bed. */
  Bed: 'farm-bed',
  /** Grass→dirt fringe around the court. */
  BedRim: 'farm-bed-rim',
} as const;

/** BootScene loads these; `paintFarmArt` magnifies them into `FarmTexture`. */
const FarmSource = {
  Soil: 'farm-src-soil',
  SoilWet: 'farm-src-soil-wet',
  Path: 'farm-src-path',
  FenceH: 'farm-src-fence-h',
  FenceV: 'farm-src-fence-v',
  FencePost: 'farm-src-fence-post',
  House: 'farm-src-house',
  Chicken: 'farm-src-chicken',
} as const;

export type FarmCropKind = 'blood-berry' | 'spirit-herb' | 'earth-fruit' | 'essence-root';

const CROP_KINDS: readonly FarmCropKind[] = [
  'blood-berry',
  'spirit-herb',
  'earth-fruit',
  'essence-root',
];

const CROP_COLORS: Record<FarmCropKind, { sprout: string; leaf: string; fruit: string }> = {
  'blood-berry': { sprout: '#5a3028', leaf: '#7a4034', fruit: '#c04040' },
  'spirit-herb': { sprout: '#2a5038', leaf: '#3d7a4e', fruit: '#6fd8ff' },
  'earth-fruit': { sprout: '#4a3820', leaf: '#6a5430', fruit: '#c88840' },
  'essence-root': { sprout: '#3a3050', leaf: '#544d76', fruit: '#b46cff' },
};

const PROP_SCALE = 3;
const HOUSE_SCALE = 2;
const GROW_SCALE = 3;

/** Growth stage textures: 0 sprout → 4 mature / ready. */
export function farmGrowTexture(kind: FarmCropKind, stage: number): string {
  const clamped = Math.max(0, Math.min(4, Math.floor(stage)));
  return `farm-grow-${kind}-${clamped}`;
}

function farmGrowSource(kind: FarmCropKind, stage: number): string {
  return `farm-src-grow-${kind}-${Math.max(0, Math.min(4, Math.floor(stage)))}`;
}

export const FARM_PROP_TEXTURES = [
  { key: FarmSource.Soil, url: gameAssetUrl('environment/farm/soil.png') },
  { key: FarmSource.SoilWet, url: gameAssetUrl('environment/farm/soil-wet.png') },
  { key: FarmSource.Path, url: gameAssetUrl('environment/farm/path.png') },
  { key: FarmSource.FenceH, url: gameAssetUrl('environment/farm/fence-h.png') },
  { key: FarmSource.FenceV, url: gameAssetUrl('environment/farm/fence-v.png') },
  { key: FarmSource.FencePost, url: gameAssetUrl('environment/farm/fence-post.png') },
  { key: FarmSource.House, url: gameAssetUrl('environment/farm/house.png') },
  { key: FarmSource.Chicken, url: gameAssetUrl('environment/farm/chicken.png') },
] as const;

export const FARM_GROW_TEXTURES = CROP_KINDS.flatMap((kind) =>
  [0, 1, 2, 3, 4].map((stage) => ({
    key: farmGrowSource(kind, stage),
    url: gameAssetUrl(`items/farm/grow-${kind}-${stage}.png`),
  })),
);

export const FARM_TEXTURES = [...FARM_PROP_TEXTURES, ...FARM_GROW_TEXTURES] as const;

export function cropKindFromSeed(seedId: string | null | undefined): FarmCropKind | null {
  if (!seedId) return null;
  if (seedId.startsWith('blood-berry')) return 'blood-berry';
  if (seedId.startsWith('spirit-herb')) return 'spirit-herb';
  if (seedId.startsWith('earth-fruit')) return 'earth-fruit';
  if (seedId.startsWith('essence-root')) return 'essence-root';
  return null;
}

/** Maps growth progress 0–1 (or ready) onto a discrete sprout frame. */
export function growthStage(progress: number, ready: boolean): number {
  if (ready) return 4;
  if (progress >= 0.8) return 3;
  if (progress >= 0.55) return 2;
  if (progress >= 0.3) return 1;
  return 0;
}

function nearest(scene: Phaser.Scene, key: string): void {
  if (!scene.textures.exists(key)) return;
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function takeSource(scene: Phaser.Scene, dest: string, src: string, scale: number): boolean {
  if (!scene.textures.exists(src)) return false;
  if (scene.textures.exists(dest)) scene.textures.remove(dest);
  magnify(scene, dest, src, scale);
  nearest(scene, dest);
  return scene.textures.exists(dest);
}

/**
 * Magnifies staged Cute Fantasy / Farm RPG cuts into world-scale keys, or bakes
 * chunky stand-ins when CDN/local staging is missing. Always NEAREST so 16px
 * tiles do not blur into mush on the canvas.
 */
export function paintFarmArt(scene: Phaser.Scene): void {
  takeSource(scene, FarmTexture.Soil, FarmSource.Soil, PROP_SCALE);
  takeSource(scene, FarmTexture.SoilWet, FarmSource.SoilWet, PROP_SCALE);
  // Path / bed / rim are always code-baked so they share the map's green earth
  // palette — Cute Fantasy path is too bright and reads as a pasted strip.
  takeSource(scene, FarmTexture.FenceH, FarmSource.FenceH, PROP_SCALE);
  takeSource(scene, FarmTexture.FenceV, FarmSource.FenceV, PROP_SCALE);
  takeSource(scene, FarmTexture.FencePost, FarmSource.FencePost, PROP_SCALE);
  takeSource(scene, FarmTexture.House, FarmSource.House, HOUSE_SCALE);
  takeSource(scene, FarmTexture.Chicken, FarmSource.Chicken, PROP_SCALE);

  for (const kind of CROP_KINDS) {
    for (let stage = 0; stage <= 4; stage++) {
      takeSource(scene, farmGrowTexture(kind, stage), farmGrowSource(kind, stage), GROW_SCALE);
    }
  }

  paintFarmFallbacks(scene);
  paintFarmBlendGround(scene);
}

/** Force-bake ground that must match grass (overrides any staged path tile). */
function paintFarmBlendGround(scene: Phaser.Scene): void {
  for (const key of [FarmTexture.Bed, FarmTexture.BedRim, FarmTexture.Path, FarmTexture.PathBank]) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }

  // Court dirt: cool olive-brown so it sits next to `#243c2c` grass.
  paint(scene, FarmTexture.Bed, 16, 16, (px) => {
    px(0, 0, 16, 16, '#3e3424');
    for (let y = 0; y < 16; y += 2) {
      for (let x = 0; x < 16; x += 2) {
        const n = (x * 3 + y * 7) % 6;
        if (n === 0) px(x, y, 2, 2, '#4a3c28');
        if (n === 1) px(x, y, 1, 1, '#2e2818');
        if (n === 2) px(x + 1, y + 1, 1, 1, '#524830');
        if (n === 4) px(x, y + 1, 1, 1, '#2c4834'); // grass fleck
      }
    }
    px(5, 8, 1, 1, '#375b41');
    px(12, 3, 1, 1, '#2c4834');
  });
  nearest(scene, FarmTexture.Bed);

  // Rim: dirt mixed with grass clumps — the transition band around the court.
  paint(scene, FarmTexture.BedRim, 16, 16, (px) => {
    px(0, 0, 16, 16, '#2a3428');
    for (let y = 0; y < 16; y += 2) {
      for (let x = 0; x < 16; x += 2) {
        const n = (x + y * 2) % 5;
        if (n === 0) px(x, y, 2, 2, '#243c2c');
        if (n === 1) px(x, y, 2, 2, '#3a3424');
        if (n === 2) px(x + 1, y, 1, 1, '#375b41');
        if (n === 3) px(x, y + 1, 1, 1, '#4a3c28');
      }
    }
    px(3, 4, 2, 3, '#41684a');
    px(10, 9, 2, 2, '#2c4834');
  });
  nearest(scene, FarmTexture.BedRim);

  // Path centre lane.
  paint(scene, FarmTexture.Path, 16, 16, (px) => {
    px(0, 0, 16, 16, '#3a3424');
    px(2, 0, 12, 16, '#4a4030');
    px(4, 0, 8, 16, '#5a4c34');
    px(6, 0, 4, 16, '#6a5a3c');
    for (let y = 1; y < 16; y += 3) {
      px(3, y, 1, 1, '#2c4834');
      px(12, y + 1, 1, 1, '#2c4834');
      px(7, y, 2, 1, '#7a6a48');
    }
  });
  nearest(scene, FarmTexture.Path);

  // Path bank: mostly grass-dirt mix under/beside the lane.
  paint(scene, FarmTexture.PathBank, 16, 16, (px) => {
    px(0, 0, 16, 16, '#243c2c');
    for (let y = 0; y < 16; y += 2) {
      for (let x = 0; x < 16; x += 2) {
        const n = (x * 5 + y) % 4;
        if (n === 0) px(x, y, 2, 2, '#2c4834');
        if (n === 1) px(x, y, 2, 1, '#3a3424');
        if (n === 2) px(x + 1, y + 1, 1, 1, '#4a3c28');
      }
    }
    px(2, 6, 1, 2, '#41684a');
    px(13, 10, 1, 2, '#375b41');
  });
  nearest(scene, FarmTexture.PathBank);
}

/**
 * Licensed farm PNGs are gitignored / optional on CDN. Bake stand-ins for any
 * display key still missing after magnification.
 */
export function paintFarmFallbacks(scene: Phaser.Scene): void {
  // Tiled bed / path are owned by paintFarmBlendGround — keep a cheap Soil
  // fallback only for plot markers when the pack is missing.
  paint(scene, FarmTexture.Soil, 16, 16, (px) => {
    px(0, 0, 16, 16, '#3e3424');
    px(1, 1, 14, 14, '#4a3c28');
    px(2, 2, 12, 12, '#524830');
    for (let i = 0; i < 16; i += 4) {
      px(i, 3, 2, 1, '#2e2818');
      px(i + 2, 10, 1, 1, '#2c4834');
    }
  });
  nearest(scene, FarmTexture.Soil);

  paint(scene, FarmTexture.Bed, 16, 16, (px) => {
    px(0, 0, 16, 16, '#3e3424');
    px(2, 2, 12, 12, '#4a3c28');
  });
  nearest(scene, FarmTexture.Bed);

  paint(scene, FarmTexture.SoilWet, 16, 16, (px) => {
    px(0, 0, 16, 16, '#2a2818');
    px(1, 1, 14, 14, '#343020');
    px(2, 2, 12, 12, '#3a3828');
    px(4, 5, 3, 2, '#2a4a38');
    px(9, 9, 4, 2, '#2a4a38');
  });
  nearest(scene, FarmTexture.SoilWet);

  paint(scene, FarmTexture.Path, 16, 16, (px) => {
    px(0, 0, 16, 16, '#3a3424');
    px(4, 0, 8, 16, '#5a4c34');
  });
  nearest(scene, FarmTexture.Path);

  paint(scene, FarmTexture.FenceH, 16, 16, (px) => {
    px(0, 6, 16, 3, '#6b4a28');
    px(0, 7, 16, 1, '#8a6428');
    px(1, 10, 14, 2, '#5a3a20');
  });
  nearest(scene, FarmTexture.FenceH);

  paint(scene, FarmTexture.FenceV, 16, 16, (px) => {
    px(6, 0, 3, 16, '#6b4a28');
    px(7, 0, 1, 16, '#8a6428');
  });
  nearest(scene, FarmTexture.FenceV);

  paint(scene, FarmTexture.FencePost, 16, 16, (px) => {
    px(5, 2, 6, 14, '#5a3a20');
    px(6, 1, 4, 2, '#8a6428');
    px(6, 4, 4, 10, '#6b4a28');
  });
  nearest(scene, FarmTexture.FencePost);

  paint(scene, FarmTexture.House, 48, 64, (px) => {
    px(8, 28, 32, 32, '#6b4a28');
    px(10, 30, 28, 28, '#8a6428');
    px(4, 20, 40, 12, '#7a3030');
    px(8, 12, 32, 12, '#9a4040');
    px(20, 4, 8, 12, '#7a3030');
    px(18, 40, 12, 20, '#3a2818');
    px(20, 42, 8, 16, '#2a1c10');
    px(12, 36, 6, 6, '#9fe8ff');
    px(30, 36, 6, 6, '#9fe8ff');
  });
  nearest(scene, FarmTexture.House);

  paint(scene, FarmTexture.Chicken, 16, 16, (px) => {
    px(5, 6, 8, 6, '#e8e0c8');
    px(7, 4, 5, 4, '#f0e8d0');
    px(11, 5, 3, 2, '#e05040');
    px(6, 11, 2, 3, '#d4a84a');
    px(10, 11, 2, 3, '#d4a84a');
    px(8, 7, 1, 1, '#202028');
  });
  nearest(scene, FarmTexture.Chicken);

  for (const kind of CROP_KINDS) {
    const colors = CROP_COLORS[kind];
    for (let stage = 0; stage <= 4; stage++) {
      const key = farmGrowTexture(kind, stage);
      paint(scene, key, 16, 16, (px) => {
        if (stage === 0) {
          px(7, 12, 2, 3, colors.sprout);
          px(7, 10, 2, 2, colors.leaf);
          return;
        }
        if (stage === 1) {
          px(7, 10, 2, 5, colors.sprout);
          px(5, 8, 3, 3, colors.leaf);
          px(8, 7, 3, 3, colors.leaf);
          return;
        }
        if (stage === 2) {
          px(7, 8, 2, 7, colors.sprout);
          px(4, 6, 4, 4, colors.leaf);
          px(8, 5, 4, 5, colors.leaf);
          return;
        }
        if (stage === 3) {
          px(7, 6, 2, 9, colors.sprout);
          px(3, 4, 5, 6, colors.leaf);
          px(8, 3, 5, 7, colors.leaf);
          px(6, 5, 2, 2, colors.fruit);
          return;
        }
        px(7, 5, 2, 10, colors.sprout);
        px(2, 3, 6, 7, colors.leaf);
        px(8, 2, 6, 8, colors.leaf);
        px(5, 4, 3, 3, colors.fruit);
        px(9, 5, 3, 3, colors.fruit);
      });
      nearest(scene, key);
    }
  }
}
