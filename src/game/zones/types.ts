import type { DropChance } from '../systems/Inventory';

export type ZoneId = 'ngoai-mon' | 'rung-ngoai-mon' | 'huyet-ma-coc';

export type MobKind = 'wolf' | 'archer' | 'brute';

export type GroundKind = 'grass' | 'forest' | 'ash';

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
  /**
   * Base brightness of everything lit in the zone, as a grey.
   *
   * 0xffffff means lights only ever add, so the zone looks exactly as it does
   * unlit until an effect fires — the right default for an open map under the
   * sky. A cave wants far less, and that is the whole point of it being per
   * zone: it is what makes Huyết Ma Cốc a different place rather than the same
   * place with different tiles.
   */
  ambient?: number;
  /** Huyết mạch — death revive and character swap. */
  shrine: { x: number; y: number };
  trees: Array<[number, number]>;
  rocks: Array<[number, number]>;
  stones: Array<[number, number]>;
  mobs: MobSpawn[];
  boss?: { x: number; y: number };
  /** Open court the boss owns — drawn as a ring, kept clear of props. */
  arena?: { x: number; y: number; radius: number; label?: string };
  portals: PortalDef[];
}

export const MOB_XP: Record<MobKind, number> = {
  wolf: 12,
  archer: 14,
  brute: 22,
};

export const BOSS_XP = 80;
export const STONE_XP = 4;

export const MOB_DROPS: Record<MobKind, readonly DropChance[]> = {
  wolf: [
    { id: 'spirit-stone', chance: 0.4 },
    { id: 'iron-sword', chance: 0.08 },
  ],
  archer: [
    { id: 'spirit-stone', chance: 0.35 },
    { id: 'jade-pendant', chance: 0.06 },
  ],
  brute: [
    { id: 'spirit-stone', chance: 0.3 },
    { id: 'outer-robe', chance: 0.1 },
  ],
};

export const BOSS_DROPS: readonly DropChance[] = [
  { id: 'frost-talisman', chance: 0.45 },
  { id: 'spirit-stone', chance: 0.7 },
];
