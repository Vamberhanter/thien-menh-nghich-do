import type { CharacterStats } from '../types';

export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'relic';

export type ItemKind = 'equip' | 'consumable';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  slot?: EquipSlot;
  bonuses?: Partial<CharacterStats>;
  /** Spirit restored when used. */
  restoreSp?: number;
}

export const ITEM_CATALOG: Record<string, ItemDef> = {
  'iron-sword': {
    id: 'iron-sword',
    name: 'Kiếm phế sắt',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 4 },
  },
  'outer-robe': {
    id: 'outer-robe',
    name: 'Áo ngoại môn',
    kind: 'equip',
    slot: 'armor',
    bonuses: { maxHp: 16, defense: 2 },
  },
  'jade-pendant': {
    id: 'jade-pendant',
    name: 'Ngọc bội',
    kind: 'equip',
    slot: 'accessory',
    bonuses: { maxSpiritualPower: 6 },
  },
  'frost-talisman': {
    id: 'frost-talisman',
    name: 'Pháp bảo sương',
    kind: 'equip',
    slot: 'relic',
    bonuses: { attack: 2, maxSpiritualPower: 4 },
  },
  'spirit-stone': {
    id: 'spirit-stone',
    name: 'Linh thạch',
    kind: 'consumable',
    restoreSp: 10,
  },
};

export const BAG_SIZE = 20;

export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'accessory', 'relic'];

export interface InventoryState {
  bag: Array<string | null>;
  equipped: Record<EquipSlot, string | null>;
}

export function emptyInventory(): InventoryState {
  return {
    bag: Array.from({ length: BAG_SIZE }, () => null),
    equipped: { weapon: null, armor: null, accessory: null, relic: null },
  };
}

export function itemOf(id: string | null | undefined): ItemDef | null {
  if (!id) return null;
  return ITEM_CATALOG[id] ?? null;
}

/**
 * Twenty bag slots and four worn slots. Phaser-free so the HUD and the
 * persist layer can read it without a scene.
 */
export class Inventory {
  readonly bag: Array<string | null>;
  readonly equipped: Record<EquipSlot, string | null>;

  constructor(state?: InventoryState) {
    const seed = state ?? emptyInventory();
    this.bag = seed.bag.slice(0, BAG_SIZE);
    while (this.bag.length < BAG_SIZE) this.bag.push(null);
    this.equipped = { ...emptyInventory().equipped, ...seed.equipped };
  }

  snapshot(): InventoryState {
    return {
      bag: [...this.bag],
      equipped: { ...this.equipped },
    };
  }

  get full(): boolean {
    return this.bag.every((slot) => slot !== null);
  }

  add(id: string): boolean {
    if (!ITEM_CATALOG[id]) return false;
    const empty = this.bag.indexOf(null);
    if (empty < 0) return false;
    this.bag[empty] = id;
    return true;
  }

  /** Wear the bag item at `index`. The previously worn piece goes back to the bag. */
  equip(index: number): boolean {
    const id = this.bag[index];
    const item = itemOf(id);
    if (!item || item.kind !== 'equip' || !item.slot) return false;
    const previous = this.equipped[item.slot];
    this.equipped[item.slot] = id;
    this.bag[index] = previous;
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const id = this.equipped[slot];
    if (!id) return false;
    if (this.full) return false;
    this.equipped[slot] = null;
    return this.add(id);
  }

  /** Consume a bag item. Returns the def so the scene can apply the effect. */
  use(index: number): ItemDef | null {
    const item = itemOf(this.bag[index]);
    if (!item || item.kind !== 'consumable') return null;
    this.bag[index] = null;
    return item;
  }

  /** Sum of every worn piece. Consumables do not count. */
  bonuses(): Partial<CharacterStats> {
    const total: Partial<CharacterStats> = {};
    for (const slot of EQUIP_SLOTS) {
      const item = itemOf(this.equipped[slot]);
      if (!item?.bonuses) continue;
      for (const [key, value] of Object.entries(item.bonuses)) {
        const field = key as keyof CharacterStats;
        total[field] = (total[field] ?? 0) + (value ?? 0);
      }
    }
    return total;
  }
}

export interface DropChance {
  id: string;
  chance: number;
}

/** Rolls each chance independently; at most one of each id. */
export function rollDrops(table: readonly DropChance[], random = Math.random): string[] {
  const out: string[] = [];
  for (const row of table) {
    if (random() < row.chance) out.push(row.id);
  }
  return out;
}
