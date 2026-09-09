import { gameAssetUrl } from '../../../net/assets';

/**
 * Every prop the game has ever loaded, read straight off the two atlas
 * manifests rather than a hand-picked list kept here.
 *
 * The palette used to be ~24 entries chosen by hand across 3 of the 16
 * sheets the two art drops actually built — reasonable for "here is a
 * curated set to start a map with", wrong the moment someone keeps adding
 * art to the sheets and the palette does not know it grew. 966 frames across
 * both manifests now; this reads whichever exist and builds the palette from
 * that, so a sheet gaining a hundred more frames needs no change here.
 *
 * Kept Phaser-free for the same reason `editorCatalog.ts` was: `MapEditor`
 * and the React palette both need it, and only one of them has a Phaser
 * scene to ask.
 */

interface ManifestFrame {
  name: string;
  frame: { x: number; y: number; w: number; h: number };
}

interface ManifestTexture {
  image: string;
  frames: ManifestFrame[];
}

interface Manifest {
  textures: ManifestTexture[];
}

/** One sheet's manifest, and how its frames map to a loaded Phaser texture key. */
interface Drop {
  readonly manifestUrl: string;
  /** `image` in the manifest ("cliff2.png") → the texture key BootScene loaded it under. */
  readonly textureKey: (image: string) => string;
}

const DROPS: readonly Drop[] = [
  {
    manifestUrl: gameAssetUrl('assets/environment/nguhanhson2/atlas/nguhanhson2.json'),
    textureKey: (image) => `nhs2-${image.replace(/\.png$/, '')}`,
  },
  {
    manifestUrl: gameAssetUrl('assets/environment/nguhanhson/atlas/nguhanhson.json'),
    textureKey: (image) => `nhs-${image.replace(/\.png$/, '')}`,
  },
];

/** Vietnamese label per sheet prefix — cosmetic only, falls back to the prefix itself. */
const SHEET_LABEL: Record<string, string> = {
  'nhs2-cliff2': 'Vách đá',
  'nhs2-floater': 'Đảo nhỏ trôi',
  'nhs2-flora': 'Cây cối',
  'nhs2-ground': 'Nước & đường',
  'nhs2-isleA': 'Đảo trôi A',
  'nhs2-isleB': 'Đảo trôi B',
  'nhs2-lake': 'Hồ nước',
  'nhs2-peak': 'Núi xa',
  'nhs-cliff': 'Vách đá (đợt 1)',
  'nhs-tree': 'Cây cối (đợt 1)',
  'nhs-mountain': 'Núi xa (đợt 1)',
  'nhs-rockface': 'Đá tảng (đợt 1)',
  'nhs-build': 'Kiến trúc',
  'nhs-water': 'Nước (đợt 1)',
  'nhs-isle': 'Đảo trôi (đợt 1)',
  'nhs-relic': 'Bảo vật',
};

export interface ThumbnailRect {
  readonly sheetUrl: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PropEntry {
  readonly texture: string;
  readonly frame: string;
  readonly rect: ThumbnailRect;
}

export interface PropCategory {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly PropEntry[];
}

let categoriesPromise: Promise<PropCategory[]> | null = null;

/** Fetched once, shared by every caller — the palette and every thumbnail alike. */
export function loadCategories(): Promise<PropCategory[]> {
  categoriesPromise ??= Promise.all(
    DROPS.map(async (drop) => {
      const manifest = await fetch(drop.manifestUrl)
        .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
        .catch(() => null);
      if (!manifest) return [];
      return manifest.textures.map((tex): PropCategory => {
        const texture = drop.textureKey(tex.image);
        // The PNG sits beside the manifest — swap the last path segment
        // rather than re-resolving through `gameAssetUrl`, which would
        // mangle an already-resolved Storage URL in production (it only
        // knows how to strip a leading "assets/", not rewrite an arbitrary
        // absolute one).
        const sheetUrl = drop.manifestUrl.replace(/[^/]+\.json(?:\?.*)?$/, tex.image);
        return {
          id: texture,
          label: SHEET_LABEL[texture] ?? texture,
          entries: tex.frames.map((f) => ({
            texture,
            frame: f.name,
            rect: { sheetUrl, x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h },
          })),
        };
      });
    }),
  ).then((perDrop) => perDrop.flat().sort((a, b) => a.label.localeCompare(b.label)));
  return categoriesPromise;
}

/** One frame's crop rect, for a thumbnail that only knows texture+frame (the editor's inspector). */
export async function loadThumbnailRect(texture: string, frame: string): Promise<ThumbnailRect | null> {
  const categories = await loadCategories();
  for (const category of categories) {
    if (category.id !== texture) continue;
    const entry = category.entries.find((e) => e.frame === frame);
    return entry?.rect ?? null;
  }
  return null;
}
