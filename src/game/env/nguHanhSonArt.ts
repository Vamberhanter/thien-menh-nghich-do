import Phaser from 'phaser';
import { gameAssetUrl } from '../../net/assets';

/**
 * The Ngũ Hành Sơn sheets, and how they reach Phaser.
 *
 * Cut by `npm run env:nguhanhson` into one seamless 64px ground tileset plus
 * eight packed prop atlases. The JSON that describes them is this project's
 * own shape rather than Phaser's multiatlas format — it carries a `tileset`
 * block for the tilemap and a bottom-centre anchor per frame — so the frames
 * are registered by hand in `registerNguHanhSonFrames` once the images are in.
 *
 * That is a few lines more than `load.multiatlas`, and it buys the thing
 * multiatlas cannot express: a tilemap tileset and a prop atlas described by
 * the same file, built by the same tool, from the same eight sheets.
 */

const DIR = 'assets/environment/nguhanhson/atlas';

/**
 * The second drop, in `dist/assets/environment/nguhanh_son` — eight sheets cut
 * by `tools/build-nguhanhson2.mjs` by real connected-component segmentation
 * rather than the first drop's row/column pass, because these scatter across
 * both axes at once (see that tool's header). No ground tileset came with it:
 * every one of the eight is raised terrain, water or decoration, nothing flat
 * enough to butt-join at 64px. `NHS_GROUND` — the tile grid the map actually
 * walks on — stays the first drop's; this only replaces the props.
 */
const DIR2 = 'assets/environment/nguhanhson2/atlas';

/** Tileset key for the tilemap. Kept apart: it is indexed, not named. */
export const NHS_GROUND = 'nhs-ground';

/** One key per packed prop sheet. Frames inside are `<prefix>_<n>`. */
export const NHS_TEXTURES = [
  'nhs-cliff',
  'nhs-tree',
  'nhs-mountain',
  'nhs-rockface',
  'nhs-build',
  'nhs-water',
  'nhs-isle',
  'nhs-relic',
] as const;

/** The second drop's prop sheets, loaded and registered the same way. */
export const NHS2_TEXTURES = [
  'nhs2-cliff2',
  'nhs2-peak',
  'nhs2-lake',
  'nhs2-flora',
  'nhs2-ground',
  'nhs2-isleA',
  'nhs2-isleB',
  'nhs2-floater',
] as const;

/** Prefix in the JSON for each texture key, which is the key minus its `nhs-`/`nhs2-`. */
const prefixOf = (key: string) => key.replace(/^nhs2?-/, '');

export interface NguHanhSonManifest {
  tileset: { image: string; tile: number; columns: number; count: number };
  textures: Array<{
    image: string;
    size: { w: number; h: number };
    frames: Array<{
      name: string;
      frame: { x: number; y: number; w: number; h: number };
      anchor: { x: number; y: number };
    }>;
  }>;
}

export const NHS_MANIFEST_KEY = 'nhs-manifest';
export const NHS2_MANIFEST_KEY = 'nhs2-manifest';

/** Queued in `preload`; every file is optional so a missing cut is a 404 only. */
export function loadNguHanhSonArt(scene: Phaser.Scene): void {
  scene.load.json(NHS_MANIFEST_KEY, gameAssetUrl(`${DIR}/nguhanhson.json`));
  scene.load.image(NHS_GROUND, gameAssetUrl(`${DIR}/ground.png`));
  scene.load.image('nhs-cliff', gameAssetUrl(`${DIR}/cliff.png`));
  scene.load.image('nhs-tree', gameAssetUrl(`${DIR}/tree.png`));
  scene.load.image('nhs-mountain', gameAssetUrl(`${DIR}/mountain.png`));
  scene.load.image('nhs-rockface', gameAssetUrl(`${DIR}/rockface.png`));
  scene.load.image('nhs-build', gameAssetUrl(`${DIR}/build.png`));
  scene.load.image('nhs-water', gameAssetUrl(`${DIR}/water.png`));
  scene.load.image('nhs-isle', gameAssetUrl(`${DIR}/isle.png`));
  scene.load.image('nhs-relic', gameAssetUrl(`${DIR}/relic.png`));

  scene.load.json(NHS2_MANIFEST_KEY, gameAssetUrl(`${DIR2}/nguhanhson2.json`));
  for (const key of NHS2_TEXTURES) {
    scene.load.image(key, gameAssetUrl(`${DIR2}/${prefixOf(key)}.png`));
  }
}

/**
 * Turns each loaded image into a frame-addressable texture.
 *
 * Called from `create`, after the loader has run. Nearest-neighbour on every
 * one: the ground tiles are 64px and the camera zoom is not an integer, so
 * bilinear filtering would bleed one tile's edge into the next and put back the
 * seams the cut was made to remove.
 */
export function registerNguHanhSonFrames(scene: Phaser.Scene): number {
  const manifest = scene.cache.json.get(NHS_MANIFEST_KEY) as NguHanhSonManifest | undefined;
  const manifest2 = scene.cache.json.get(NHS2_MANIFEST_KEY) as Pick<NguHanhSonManifest, 'textures'> | undefined;

  if (scene.textures.exists(NHS_GROUND)) {
    scene.textures.get(NHS_GROUND).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  let added = 0;
  const registerFrom = (keys: readonly string[], source: Pick<NguHanhSonManifest, 'textures'> | undefined) => {
    if (!source) return;
    for (const key of keys) {
      if (!scene.textures.exists(key)) continue;
      const texture = scene.textures.get(key);
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      const entry = source.textures.find((t) => t.image === `${prefixOf(key)}.png`);
      if (!entry) continue;
      for (const frame of entry.frames) {
        if (texture.has(frame.name)) continue;
        const added_ = texture.add(frame.name, 0, frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h);
        if (added_) added++;
      }
    }
  };
  registerFrom(NHS_TEXTURES, manifest);
  registerFrom(NHS2_TEXTURES, manifest2);
  return added;
}
