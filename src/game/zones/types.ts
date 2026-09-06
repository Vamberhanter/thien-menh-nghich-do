import type { DropChance } from '../systems/Inventory';

export type ZoneId =
  | 'ngoai-mon'
  | 'linh-dien'
  | 'rung-ngoai-mon'
  | 'huyet-ma-coc'
  | 'thanh-phong-coc';

export type MobKind =
  | 'toad'
  | 'crab'
  | 'serpent'
  | 'drake'
  | 'golem'
  | 'troll'
  | 'blood-serpent'
  | 'fire-drake'
  | 'ember-golem';

export type GroundKind = 'grass' | 'forest' | 'ash';
export type PlantKind = 'blood-berry' | 'spirit-herb' | 'earth-fruit' | 'essence-root';
export type ChestTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface PlantDef {
  kind: PlantKind;
  x: number;
  y: number;
}

/** Personal cultivation plot — `id` matches Farming plot ids (`plot-1`…). */
export interface FarmPlotDef {
  id: string;
  x: number;
  y: number;
}

export type FarmDecorKind =
  | 'house'
  | 'fence-h'
  | 'fence-v'
  | 'fence-post'
  | 'chicken'
  | 'path'
  | 'soil-pad';

export interface FarmDecorDef {
  kind: FarmDecorKind;
  x: number;
  y: number;
}

export interface ChestDef {
  tier: ChestTier;
  x: number;
  y: number;
}

export interface PortalDef {
  x: number;
  y: number;
  to: ZoneId;
  /** Standing point after the fade, on the destination map. */
  spawn: { x: number; y: number };
  label: string;
}

export interface MobSpawn {
  kind: MobKind;
  x: number;
  y: number;
}

export interface ZoneDef {
  id: ZoneId;
  name: string;
  width: number;
  height: number;
  ground: GroundKind;
  /** Huyết mạch — death revive and character swap. */
  shrine: { x: number; y: number };
  /** Dedicated fast-travel altar; separate from the respawn shrine. */
  waypoint: { x: number; y: number };
  trees: Array<[number, number]>;
  rocks: Array<[number, number]>;
  stones: Array<[number, number]>;
  plants: PlantDef[];
  /** Tilled personal plots (Linh Điền). Empty elsewhere. */
  farmPlots?: FarmPlotDef[];
  /** Cottage, fences, path tiles, animals around the farm court. */
  farmDecor?: FarmDecorDef[];
  /**
   * Continuous dirt court under the plots (world top-left + size). One solid
   * bed avoids grass peeking through gaps between soil sprites.
   */
  farmBed?: { x: number; y: number; width: number; height: number };
  /** Portal → gate road as one TileSprite strip (same idea as farmBed). */
  farmPath?: { x: number; y: number; width: number; height: number };
  chests: ChestDef[];
  mobs: MobSpawn[];
  boss?: { x: number; y: number };
  /** Open court the boss owns — drawn as a ring, kept clear of props. */
  arena?: { x: number; y: number; radius: number; label?: string };
  portals: PortalDef[];
}

export const MOB_XP: Record<MobKind, number> = {
  toad: 10,
  crab: 14,
  serpent: 18,
  drake: 20,
  golem: 28,
  troll: 30,
  'blood-serpent': 36,
  'fire-drake': 34,
  'ember-golem': 46,
};

export const BOSS_XP = 80;
export const STONE_XP = 4;

/**
 * Herbs come off the beasts that graze on them and equipment off the ones that
 * fight back, so the training ground stocks the bag while the valley upgrades it.
 *
 * Each species carries exactly one rung of the sword ladder, at a rate low enough
 * that the blade is a reason to keep hunting that species rather than something
 * the first kill hands over. The demonic blade is the boss's alone.
 */
export const MOB_DROPS: Record<MobKind, readonly DropChance[]> = {
  toad: [
    { id: 'spirit-stone', chance: 0.4 },
    { id: 'spirit-herb', chance: 0.3 },
    { id: 'yeu-huyet', chance: 0.35 },
    { id: 'iron-sword', chance: 0.07 },
  ],
  crab: [
    { id: 'spirit-stone', chance: 0.35 },
    { id: 'blood-berry', chance: 0.32 },
    { id: 'yeu-huyet', chance: 0.32 },
    { id: 'bronze-sword', chance: 0.07 },
  ],
  serpent: [
    { id: 'spirit-stone', chance: 0.35 },
    { id: 'earth-fruit', chance: 0.24 },
    { id: 'yeu-huyet', chance: 0.28 },
    { id: 'linh-cot-ha', chance: 0.12 },
    { id: 'jade-sword', chance: 0.07 },
  ],
  drake: [
    { id: 'spirit-stone', chance: 0.35 },
    { id: 'spirit-herb', chance: 0.26 },
    { id: 'linh-cot-ha', chance: 0.18 },
    { id: 'jade-pendant', chance: 0.06 },
    { id: 'gale-sword', chance: 0.07 },
  ],
  golem: [
    { id: 'spirit-stone', chance: 0.3 },
    { id: 'essence-root', chance: 0.2 },
    { id: 'linh-cot-ha', chance: 0.22 },
    { id: 'outer-robe', chance: 0.1 },
    { id: 'frost-sword', chance: 0.08 },
    { id: 'hoang-ngoc-1', chance: 0.06 },
  ],
  troll: [
    { id: 'spirit-stone', chance: 0.32 },
    { id: 'essence-root', chance: 0.24 },
    { id: 'linh-cot-ha', chance: 0.2 },
    { id: 'yeu-dan', chance: 0.08 },
    { id: 'thunder-sword', chance: 0.08 },
  ],
  'blood-serpent': [
    { id: 'spirit-stone', chance: 0.4 },
    { id: 'blood-berry', chance: 0.3 },
    { id: 'yeu-huyet', chance: 0.36 },
    { id: 'linh-cot-trung', chance: 0.14 },
    { id: 'jade-pendant', chance: 0.1 },
    { id: 'venom-sword', chance: 0.09 },
    { id: 'hong-ngoc-1', chance: 0.08 },
  ],
  'fire-drake': [
    { id: 'spirit-stone', chance: 0.4 },
    { id: 'earth-fruit', chance: 0.28 },
    { id: 'linh-cot-trung', chance: 0.16 },
    { id: 'yeu-dan', chance: 0.1 },
    { id: 'outer-robe', chance: 0.12 },
    { id: 'flame-sword', chance: 0.09 },
    { id: 'lam-ngoc-1', chance: 0.08 },
  ],
  'ember-golem': [
    { id: 'spirit-stone', chance: 0.5 },
    { id: 'essence-root', chance: 0.3 },
    { id: 'linh-cot-trung', chance: 0.2 },
    { id: 'yeu-dan', chance: 0.12 },
    { id: 'frost-talisman', chance: 0.12 },
    { id: 'blood-sword', chance: 0.1 },
    { id: 'luc-ngoc-1', chance: 0.1 },
  ],
};

export const BOSS_DROPS: readonly DropChance[] = [
  { id: 'frost-talisman', chance: 0.45 },
  { id: 'spirit-stone', chance: 0.7 },
  { id: 'demon-sword', chance: 0.25 },
  { id: 'hong-ngoc-2', chance: 0.35 },
  { id: 'linh-cot-trung', chance: 0.55 },
  { id: 'truc-co-dan', chance: 0.28 },
  { id: 'huyet-ma-tinh', chance: 0.4 },
  { id: 'yeu-dan', chance: 0.35 },
];

/** Thanh Phong Cốc — leans toward Kết Đan mats. */
export const WIND_BOSS_DROPS: readonly DropChance[] = [
  { id: 'spirit-stone', chance: 0.75 },
  { id: 'linh-cot-trung', chance: 0.6 },
  { id: 'yeu-dan', chance: 0.45 },
  { id: 'ket-dan-dan', chance: 0.32 },
  { id: 'void-stone', chance: 0.4 },
  { id: 'gale-sword', chance: 0.28 },
  { id: 'lam-ngoc-2', chance: 0.3 },
];
