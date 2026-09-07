import type Phaser from 'phaser';
import { gameAssetUrl } from '../../net/assets';
import { MobTexture, paint } from './textures';

/**
 * Monster Pack 1 by Admurin. Run `npm run env:monsters` to stage the sprites —
 * they are licensed art, so they stay out of git and are copied from the pack
 * folder on demand.
 *
 * The pack draws every monster with 3x3 pixel blocks on a wide transparent
 * canvas. The build script de-magnifies back to the native grid and trims the
 * padding, so what lands in `public/` is already the final texture: nothing here
 * scales or slices it. Sizes below are those staged files, and the build script
 * asserts them — if it fails, these numbers and the bodies in `entities/Mob.ts`
 * are what went stale.
 */
export interface MonsterArt {
  key: string;
  url: string;
  width: number;
  height: number;
  /** Silhouette colour used only when the pack has not been staged. */
  fallback: string;
}

/**
 * Each `url` is spelled out rather than built from a shared prefix: the build
 * strips any image under `assets/` whose path does not appear literally in the
 * bundle (see `stripSourceSheets` in vite.config.ts), and a concatenated path
 * does not survive minification.
 */
export const MONSTER_ART = {
  [MobTexture.Toad]: {
    key: MobTexture.Toad,
    url: gameAssetUrl('monsters/toad.png'),
    width: 50,
    height: 45,
    fallback: '#4a7a3c',
  },
  [MobTexture.Crab]: {
    key: MobTexture.Crab,
    url: gameAssetUrl('monsters/crab.png'),
    width: 50,
    height: 44,
    fallback: '#3c6a8a',
  },
  [MobTexture.Serpent]: {
    key: MobTexture.Serpent,
    url: gameAssetUrl('monsters/serpent.png'),
    width: 60,
    height: 61,
    fallback: '#5a6a34',
  },
  [MobTexture.Drake]: {
    key: MobTexture.Drake,
    url: gameAssetUrl('monsters/drake.png'),
    width: 71,
    height: 62,
    fallback: '#6a7a30',
  },
  [MobTexture.Golem]: {
    key: MobTexture.Golem,
    url: gameAssetUrl('monsters/golem.png'),
    width: 64,
    height: 70,
    fallback: '#6a5238',
  },
  [MobTexture.Troll]: {
    key: MobTexture.Troll,
    url: gameAssetUrl('monsters/troll.png'),
    width: 78,
    height: 74,
    fallback: '#8a7040',
  },
  [MobTexture.BloodSerpent]: {
    key: MobTexture.BloodSerpent,
    url: gameAssetUrl('monsters/blood-serpent.png'),
    width: 71,
    height: 67,
    fallback: '#a04028',
  },
  [MobTexture.EmberGolem]: {
    key: MobTexture.EmberGolem,
    url: gameAssetUrl('monsters/ember-golem.png'),
    width: 64,
    height: 71,
    fallback: '#4a4048',
  },
  [MobTexture.FireDrake]: {
    key: MobTexture.FireDrake,
    url: gameAssetUrl('monsters/fire-drake.png'),
    width: 71,
    height: 62,
    fallback: '#a05430',
  },
} as const satisfies Record<string, MonsterArt>;

export const MONSTER_TEXTURES: readonly MonsterArt[] = Object.values(MONSTER_ART);

export function monsterArt(key: string): MonsterArt {
  const art = (MONSTER_ART as Record<string, MonsterArt | undefined>)[key];
  if (!art) throw new Error(`no monster art registered for "${key}"`);
  return art;
}

/**
 * Stands in for any species whose sprite failed to load. One parameterised
 * silhouette covers the whole roster rather than nine hand-drawn blobs: the
 * shape only has to read as "creature, this big, this colour" until someone runs
 * the staging script.
 */
export function paintMonsterFallbacks(scene: Phaser.Scene): void {
  for (const art of MONSTER_TEXTURES) {
    if (scene.textures.exists(art.key)) continue;
    // Drawn at half size so `paint` doubles it back up, giving the same chunky
    // 2px grid as the placeholder scenery instead of 1px detail.
    const w = Math.round(art.width / 2);
    const h = Math.round(art.height / 2);
    paint(scene, art.key, w, h, (px) => {
      const shade = mix(art.fallback, '#000000', 0.4);
      const lit = mix(art.fallback, '#ffffff', 0.22);
      px(1, 2, w - 2, h - 4, shade);
      px(2, 1, w - 4, h - 3, art.fallback);
      px(3, 2, w - 6, Math.max(1, Math.round(h * 0.35)), lit);
      px(1, h - 2, w - 2, 2, shade);
      const eye = Math.max(1, Math.round(w * 0.12));
      px(Math.round(w * 0.28), Math.round(h * 0.3), eye, eye, '#f4e8d0');
      px(Math.round(w * 0.6), Math.round(h * 0.3), eye, eye, '#f4e8d0');
    });
  }
}

/** Blends two `#rrggbb` strings — keeps the fallback palette to one colour each. */
function mix(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}
