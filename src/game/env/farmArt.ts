import { gameAssetUrl } from '../../net/assets';

/** Cute Fantasy farm props + Farm RPG growth stages staged by `npm run env:farm`. */
export const FarmTexture = {
  Soil: 'farm-soil',
  SoilWet: 'farm-soil-wet',
  Path: 'farm-path',
  FenceH: 'farm-fence-h',
  FenceV: 'farm-fence-v',
  FencePost: 'farm-fence-post',
  House: 'farm-house',
  Chicken: 'farm-chicken',
} as const;

export type FarmCropKind = 'blood-berry' | 'spirit-herb' | 'earth-fruit' | 'essence-root';

const CROP_KINDS: readonly FarmCropKind[] = [
  'blood-berry',
  'spirit-herb',
  'earth-fruit',
  'essence-root',
];

/** Growth stage textures: 0 sprout → 4 mature / ready. */
export function farmGrowTexture(kind: FarmCropKind, stage: number): string {
  const clamped = Math.max(0, Math.min(4, Math.floor(stage)));
  return `farm-grow-${kind}-${clamped}`;
}

export const FARM_PROP_TEXTURES = [
  { key: FarmTexture.Soil, url: gameAssetUrl('environment/farm/soil.png') },
  { key: FarmTexture.SoilWet, url: gameAssetUrl('environment/farm/soil-wet.png') },
  { key: FarmTexture.Path, url: gameAssetUrl('environment/farm/path.png') },
  { key: FarmTexture.FenceH, url: gameAssetUrl('environment/farm/fence-h.png') },
  { key: FarmTexture.FenceV, url: gameAssetUrl('environment/farm/fence-v.png') },
  { key: FarmTexture.FencePost, url: gameAssetUrl('environment/farm/fence-post.png') },
  { key: FarmTexture.House, url: gameAssetUrl('environment/farm/house.png') },
  { key: FarmTexture.Chicken, url: gameAssetUrl('environment/farm/chicken.png') },
] as const;

export const FARM_GROW_TEXTURES = CROP_KINDS.flatMap((kind) =>
  [0, 1, 2, 3, 4].map((stage) => ({
    key: farmGrowTexture(kind, stage),
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
