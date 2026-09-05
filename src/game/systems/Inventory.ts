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
  /** Health restored when used. */
  restoreHp?: number;
  /** Cultivation XP granted when refined from the bag. */
  cultivationXp?: number;
  /** Copper received when the item is sold from the bag. */
  sellValue?: number;
  /**
   * Sprite the bag shows, under `public/`. Optional: the robe, the pendant and
   * the talisman have no counterpart in any staged pack, and the bag falls back
   * to their initial.
   *
   * Spelled out per item rather than built from a shared prefix — the build
   * strips any image under `assets/` whose path does not appear literally in the
   * bundle (see `stripSourceSheets` in vite.config.ts).
   */
  icon?: string;
}

/**
 * Ten swords climbing from scrap steel to the demonic blade the title alludes to.
 * Every other tier trades a little attack for a side stat, so a lower rung stays
 * worth wearing for a build that wants the speed or the spirit pool.
 */
export const ITEM_CATALOG: Record<string, ItemDef> = {
  'iron-sword': {
    id: 'iron-sword',
    name: 'Kiếm phế sắt',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 4 },
    icon: 'assets/weapons/iron-sword.png',
  },
  'bronze-sword': {
    id: 'bronze-sword',
    name: 'Thanh Đồng kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 7 },
    icon: 'assets/weapons/bronze-sword.png',
  },
  'jade-sword': {
    id: 'jade-sword',
    name: 'Linh Ngọc kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 9, maxSpiritualPower: 5 },
    icon: 'assets/weapons/jade-sword.png',
  },
  'gale-sword': {
    id: 'gale-sword',
    name: 'Phong Vũ kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 11, speed: 12 },
    icon: 'assets/weapons/gale-sword.png',
  },
  'frost-sword': {
    id: 'frost-sword',
    name: 'Hàn Băng kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 14, maxSpiritualPower: 6 },
    icon: 'assets/weapons/frost-sword.png',
  },
  'thunder-sword': {
    id: 'thunder-sword',
    name: 'Lôi Đình kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 17, speed: 10 },
    icon: 'assets/weapons/thunder-sword.png',
  },
  'venom-sword': {
    id: 'venom-sword',
    name: 'Độc Vụ kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 20, defense: 3 },
    icon: 'assets/weapons/venom-sword.png',
  },
  'flame-sword': {
    id: 'flame-sword',
    name: 'Viêm Dương kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 23, maxHp: 20 },
    icon: 'assets/weapons/flame-sword.png',
  },
  'blood-sword': {
    id: 'blood-sword',
    name: 'Huyết Sát kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 27, maxHp: 30 },
    icon: 'assets/weapons/blood-sword.png',
  },
  'demon-sword': {
    id: 'demon-sword',
    name: 'Nghịch Đồ ma kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 32, maxHp: 40, maxSpiritualPower: 10 },
    icon: 'assets/weapons/demon-sword.png',
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
    sellValue: 5,
  },
  'wood-stone': {
    id: 'wood-stone',
    name: 'Mộc linh thạch',
    kind: 'consumable',
    cultivationXp: 18,
    sellValue: 15,
    icon: 'assets/resources/stone-wood.png',
  },
  'water-stone': {
    id: 'water-stone',
    name: 'Thủy linh thạch',
    kind: 'consumable',
    cultivationXp: 28,
    sellValue: 24,
    icon: 'assets/resources/stone-water.png',
  },
  'fire-stone': {
    id: 'fire-stone',
    name: 'Hỏa linh thạch',
    kind: 'consumable',
    cultivationXp: 42,
    sellValue: 38,
    icon: 'assets/resources/stone-fire.png',
  },
  'earth-stone': {
    id: 'earth-stone',
    name: 'Thổ linh thạch',
    kind: 'consumable',
    cultivationXp: 58,
    sellValue: 55,
    icon: 'assets/resources/stone-earth.png',
  },
  'void-stone': {
    id: 'void-stone',
    name: 'Hư Không linh thạch',
    kind: 'consumable',
    cultivationXp: 85,
    sellValue: 80,
    icon: 'assets/resources/stone-void.png',
  },
  'spirit-herb': {
    id: 'spirit-herb',
    name: 'Thanh linh thảo',
    kind: 'consumable',
    restoreSp: 16,
    icon: 'assets/items/spirit-herb.png',
  },
  'blood-berry': {
    id: 'blood-berry',
    name: 'Huyết quả',
    kind: 'consumable',
    restoreHp: 30,
    icon: 'assets/items/blood-berry.png',
  },
  'earth-fruit': {
    id: 'earth-fruit',
    name: 'Địa linh quả',
    kind: 'consumable',
    restoreHp: 22,
    restoreSp: 8,
    icon: 'assets/items/earth-fruit.png',
  },
  'essence-root': {
    id: 'essence-root',
    name: 'Hoàng tinh căn',
    kind: 'consumable',
    restoreHp: 65,
    icon: 'assets/items/essence-root.png',
  },
};

export const BAG_SIZE = 20;

export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'accessory', 'relic'];

export interface InventoryState {
  bag: Array<string | null>;
  equipped: Record<EquipSlot, string | null>;
  coins: number;
}

export function emptyInventory(): InventoryState {
  return {
    bag: Array.from({ length: BAG_SIZE }, () => null),
    equipped: { weapon: null, armor: null, accessory: null, relic: null },
    coins: 0,
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
  coins: number;

  constructor(state?: InventoryState) {
    const seed = state ?? emptyInventory();
    this.bag = seed.bag.slice(0, BAG_SIZE);
    while (this.bag.length < BAG_SIZE) this.bag.push(null);
    this.equipped = { ...emptyInventory().equipped, ...seed.equipped };
    this.coins = Math.max(0, Math.floor(seed.coins ?? 0));
  }

  snapshot(): InventoryState {
    return {
      bag: [...this.bag],
      equipped: { ...this.equipped },
      coins: this.coins,
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

  /** Removes a bag item and credits its configured copper value. */
  sell(index: number): ItemDef | null {
    const item = itemOf(this.bag[index]);
    if (!item?.sellValue) return null;
    this.bag[index] = null;
    this.coins += item.sellValue;
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
