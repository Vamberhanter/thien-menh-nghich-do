import type Phaser from 'phaser';
import { paint } from './textures';
import { WorldResourceTexture } from './worldResourceArt';
import type { ChestTier } from '../zones/types';

type ChestPalette = {
  wood: string;
  woodLite: string;
  woodDark: string;
  band: string;
  bandLite: string;
  lock: string;
  lockLite: string;
  cloth?: string;
};

const CHEST_PALETTE: Record<ChestTier, ChestPalette> = {
  common: {
    wood: '#6b4a28',
    woodLite: '#8a6428',
    woodDark: '#3a2818',
    band: '#8a8a9a',
    bandLite: '#c8c8d4',
    lock: '#c9a24a',
    lockLite: '#ffe9a8',
  },
  rare: {
    wood: '#5a4830',
    woodLite: '#7a6438',
    woodDark: '#2e2418',
    band: '#6a8a70',
    bandLite: '#a8d4b0',
    lock: '#4ecf7a',
    lockLite: '#b8ffd0',
    cloth: '#3a8050',
  },
  epic: {
    wood: '#4a3a50',
    woodLite: '#6a5470',
    woodDark: '#281828',
    band: '#5a70a0',
    bandLite: '#9ab0e0',
    lock: '#6a9fff',
    lockLite: '#d0e4ff',
    cloth: '#4050a0',
  },
  legendary: {
    wood: '#6a4820',
    woodLite: '#9a6a28',
    woodDark: '#3a2410',
    band: '#c9a24a',
    bandLite: '#ffe9a8',
    lock: '#ffd060',
    lockLite: '#fff4c8',
    cloth: '#a05020',
  },
  mythic: {
    wood: '#3a2848',
    woodLite: '#5a4068',
    woodDark: '#1a1028',
    band: '#9060c0',
    bandLite: '#e0b4ff',
    lock: '#e070ff',
    lockLite: '#f8d0ff',
    cloth: '#702090',
  },
};

const CHEST_KEYS: Record<ChestTier, string> = {
  common: WorldResourceTexture.ChestCommon,
  rare: WorldResourceTexture.ChestRare,
  epic: WorldResourceTexture.ChestEpic,
  legendary: WorldResourceTexture.ChestLegendary,
  mythic: WorldResourceTexture.ChestMythic,
};

/**
 * World loot chests. High-res CDN paintings clash with the pixel map, and the
 * PNGs are gitignored — so we always bake chunky tiered chests and force
 * NEAREST so they sit next to trees / fences without looking pasted on.
 */
export function paintChestArt(scene: Phaser.Scene): void {
  for (const tier of Object.keys(CHEST_PALETTE) as ChestTier[]) {
    const key = CHEST_KEYS[tier];
    if (scene.textures.exists(key)) scene.textures.remove(key);
    bakeChest(scene, key, CHEST_PALETTE[tier]);
  }
}

function bakeChest(scene: Phaser.Scene, key: string, c: ChestPalette): void {
  paint(scene, key, 28, 22, (px) => {
    // Soft ground contact (drawn into the sprite so every chest grounds itself).
    px(4, 20, 20, 2, '#000000');
    px(6, 19, 16, 1, '#000000');

    // Body
    px(4, 10, 20, 10, c.woodDark);
    px(5, 10, 18, 9, c.wood);
    px(6, 11, 16, 6, c.woodLite);

    // Lid
    px(3, 5, 22, 6, c.woodDark);
    px(4, 4, 20, 6, c.wood);
    px(5, 4, 18, 4, c.woodLite);
    px(7, 3, 14, 2, c.woodLite);

    // Metal bands
    px(4, 8, 20, 2, c.band);
    px(5, 8, 18, 1, c.bandLite);
    px(4, 15, 20, 2, c.band);
    px(11, 4, 2, 14, c.band);
    px(15, 4, 2, 14, c.band);
    px(11, 4, 2, 1, c.bandLite);
    px(15, 4, 2, 1, c.bandLite);

    // Lock / gem
    px(12, 11, 4, 4, c.lock);
    px(13, 12, 2, 2, c.lockLite);

    if (c.cloth) {
      px(7, 17, 2, 3, c.cloth);
      px(13, 17, 2, 3, c.cloth);
      px(19, 17, 2, 3, c.cloth);
    }
  });
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
