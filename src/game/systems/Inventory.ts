import type { CharacterStats } from '../types';
import { gameAssetUrl } from '../../net/assets';
import {
  GEM_CATALOG,
  createSocketState,
  gemBonuses,
  removeGem,
  socketGem,
  type SocketState,
} from './GemSystem';

const GEM_ITEM_ICONS: Readonly<Record<string, string>> = {
  'hong-ngoc-1': gameAssetUrl('items/gems/hong-ngoc-1.png'),
  'hong-ngoc-2': gameAssetUrl('items/gems/hong-ngoc-2.png'),
  'hong-ngoc-3': gameAssetUrl('items/gems/hong-ngoc-3.png'),
  'lam-ngoc-1': gameAssetUrl('items/gems/lam-ngoc-1.png'),
  'lam-ngoc-2': gameAssetUrl('items/gems/lam-ngoc-2.png'),
  'lam-ngoc-3': gameAssetUrl('items/gems/lam-ngoc-3.png'),
  'luc-ngoc-1': gameAssetUrl('items/gems/luc-ngoc-1.png'),
  'luc-ngoc-2': gameAssetUrl('items/gems/luc-ngoc-2.png'),
  'luc-ngoc-3': gameAssetUrl('items/gems/luc-ngoc-3.png'),
  'hoang-ngoc-1': gameAssetUrl('items/gems/hoang-ngoc-1.png'),
  'hoang-ngoc-2': gameAssetUrl('items/gems/hoang-ngoc-2.png'),
  'hoang-ngoc-3': gameAssetUrl('items/gems/hoang-ngoc-3.png'),
};

export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'relic';

export type ItemKind = 'equip' | 'consumable' | 'material' | 'gem' | 'quest';
export type ItemRarity = 'common' | 'rare' | 'epic';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity?: ItemRarity;
  requiredLevel?: number;
  maxStack?: number;
  buyValue?: number;
  socketCount?: 0 | 1 | 2;
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
    requiredLevel: 1,
    buyValue: 90,
    sellValue: 35,
    socketCount: 1,
    icon: gameAssetUrl('weapons/iron-sword.png'),
  },
  'bronze-sword': {
    id: 'bronze-sword',
    name: 'Thanh Đồng kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 7 },
    rarity: 'rare',
    requiredLevel: 2,
    buyValue: 180,
    sellValue: 70,
    socketCount: 1,
    icon: gameAssetUrl('weapons/bronze-sword.png'),
  },
  'jade-sword': {
    id: 'jade-sword',
    name: 'Linh Ngọc kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 9, maxSpiritualPower: 5 },
    rarity: 'rare',
    requiredLevel: 4,
    buyValue: 360,
    sellValue: 140,
    socketCount: 2,
    icon: gameAssetUrl('weapons/jade-sword.png'),
  },
  'gale-sword': {
    id: 'gale-sword',
    name: 'Phong Vũ kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 11, speed: 12 },
    requiredLevel: 5,
    sellValue: 180,
    socketCount: 1,
    icon: gameAssetUrl('weapons/gale-sword.png'),
  },
  'frost-sword': {
    id: 'frost-sword',
    name: 'Hàn Băng kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 14, maxSpiritualPower: 6 },
    requiredLevel: 6,
    sellValue: 220,
    socketCount: 1,
    icon: gameAssetUrl('weapons/frost-sword.png'),
  },
  'thunder-sword': {
    id: 'thunder-sword',
    name: 'Lôi Đình kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 17, speed: 10 },
    requiredLevel: 6,
    sellValue: 270,
    socketCount: 1,
    icon: gameAssetUrl('weapons/thunder-sword.png'),
  },
  'venom-sword': {
    id: 'venom-sword',
    name: 'Độc Vụ kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 20, defense: 3 },
    requiredLevel: 7,
    sellValue: 320,
    socketCount: 1,
    icon: gameAssetUrl('weapons/venom-sword.png'),
  },
  'flame-sword': {
    id: 'flame-sword',
    name: 'Viêm Dương kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 23, maxHp: 20 },
    requiredLevel: 7,
    sellValue: 380,
    socketCount: 2,
    icon: gameAssetUrl('weapons/flame-sword.png'),
  },
  'blood-sword': {
    id: 'blood-sword',
    name: 'Huyết Sát kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 27, maxHp: 30 },
    requiredLevel: 8,
    sellValue: 450,
    socketCount: 2,
    icon: gameAssetUrl('weapons/blood-sword.png'),
  },
  'demon-sword': {
    id: 'demon-sword',
    name: 'Nghịch Đồ ma kiếm',
    kind: 'equip',
    slot: 'weapon',
    bonuses: { attack: 32, maxHp: 40, maxSpiritualPower: 10 },
    rarity: 'epic',
    requiredLevel: 9,
    sellValue: 500,
    socketCount: 2,
    icon: gameAssetUrl('weapons/demon-sword.png'),
  },
  'outer-robe': {
    id: 'outer-robe',
    name: 'Áo ngoại môn',
    kind: 'equip',
    slot: 'armor',
    bonuses: { maxHp: 16, defense: 2 },
    socketCount: 1,
    icon: gameAssetUrl('items/equipment/outer-robe.png'),
  },
  'jade-pendant': {
    id: 'jade-pendant',
    name: 'Ngọc bội',
    kind: 'equip',
    slot: 'accessory',
    bonuses: { maxSpiritualPower: 6 },
    icon: gameAssetUrl('items/equipment/jade-pendant.png'),
  },
  'frost-talisman': {
    id: 'frost-talisman',
    name: 'Pháp bảo sương',
    kind: 'equip',
    slot: 'relic',
    bonuses: { attack: 2, maxSpiritualPower: 4 },
    rarity: 'epic',
    socketCount: 2,
    icon: gameAssetUrl('items/equipment/frost-talisman.png'),
  },
  'spirit-stone': {
    id: 'spirit-stone',
    name: 'Linh thạch',
    kind: 'consumable',
    restoreSp: 10,
    sellValue: 5,
    buyValue: 12,
    maxStack: 20,
    icon: gameAssetUrl('items/consumables/spirit-stone.png'),
  },
  'yeu-huyet': {
    id: 'yeu-huyet',
    name: 'Yêu huyết',
    kind: 'material',
    rarity: 'common',
    maxStack: 30,
    sellValue: 8,
    buyValue: 28,
    icon: gameAssetUrl('items/materials/yeu-huyet.png'),
  },
  'linh-cot-ha': {
    id: 'linh-cot-ha',
    name: 'Linh cốt hạ phẩm',
    kind: 'material',
    rarity: 'common',
    maxStack: 20,
    sellValue: 14,
    buyValue: 48,
    icon: gameAssetUrl('items/materials/linh-cot-ha.png'),
  },
  'linh-cot-trung': {
    id: 'linh-cot-trung',
    name: 'Linh cốt trung phẩm',
    kind: 'material',
    rarity: 'rare',
    maxStack: 20,
    sellValue: 28,
    buyValue: 95,
    icon: gameAssetUrl('items/materials/linh-cot-trung.png'),
  },
  'yeu-dan': {
    id: 'yeu-dan',
    name: 'Yêu đan',
    kind: 'material',
    rarity: 'rare',
    maxStack: 10,
    sellValue: 40,
    buyValue: 140,
    icon: gameAssetUrl('items/materials/yeu-dan.png'),
  },
  'truc-co-dan': {
    id: 'truc-co-dan',
    name: 'Trúc Cơ đan',
    kind: 'material',
    rarity: 'epic',
    maxStack: 5,
    sellValue: 120,
    buyValue: 320,
    icon: gameAssetUrl('items/materials/truc-co-dan.png'),
  },
  'ket-dan-dan': {
    id: 'ket-dan-dan',
    name: 'Kết Đan đan',
    kind: 'material',
    rarity: 'epic',
    maxStack: 5,
    sellValue: 280,
    buyValue: 780,
    icon: gameAssetUrl('items/materials/ket-dan-dan.png'),
  },
  'huyet-ma-tinh': {
    id: 'huyet-ma-tinh',
    name: 'Huyết ma tinh',
    kind: 'material',
    rarity: 'epic',
    maxStack: 5,
    sellValue: 90,
    icon: gameAssetUrl('items/materials/huyet-ma-tinh.png'),
  },
  'wood-stone': {
    id: 'wood-stone',
    name: 'Mộc linh thạch',
    kind: 'consumable',
    cultivationXp: 18,
    sellValue: 15,
    icon: gameAssetUrl('resources/stones/stone-wood.png'),
  },
  'water-stone': {
    id: 'water-stone',
    name: 'Thủy linh thạch',
    kind: 'consumable',
    cultivationXp: 28,
    sellValue: 24,
    icon: gameAssetUrl('resources/stones/stone-water.png'),
  },
  'fire-stone': {
    id: 'fire-stone',
    name: 'Hỏa linh thạch',
    kind: 'consumable',
    cultivationXp: 42,
    sellValue: 38,
    icon: gameAssetUrl('resources/stones/stone-fire.png'),
  },
  'earth-stone': {
    id: 'earth-stone',
    name: 'Thổ linh thạch',
    kind: 'consumable',
    cultivationXp: 58,
    sellValue: 55,
    icon: gameAssetUrl('resources/stones/stone-earth.png'),
  },
  'void-stone': {
    id: 'void-stone',
    name: 'Hư Không linh thạch',
    kind: 'consumable',
    cultivationXp: 85,
    sellValue: 80,
    icon: gameAssetUrl('resources/stones/stone-void.png'),
  },
  'spirit-herb': {
    id: 'spirit-herb',
    name: 'Thanh linh thảo',
    kind: 'consumable',
    restoreSp: 16,
    sellValue: 10,
    buyValue: 24,
    maxStack: 20,
    icon: gameAssetUrl('items/consumables/spirit-herb.png'),
  },
  'blood-berry': {
    id: 'blood-berry',
    name: 'Huyết quả',
    kind: 'consumable',
    restoreHp: 30,
    sellValue: 16,
    buyValue: 38,
    maxStack: 20,
    icon: gameAssetUrl('items/consumables/blood-berry.png'),
  },
  'earth-fruit': {
    id: 'earth-fruit',
    name: 'Địa linh quả',
    kind: 'consumable',
    restoreHp: 22,
    restoreSp: 8,
    sellValue: 24,
    buyValue: 58,
    maxStack: 20,
    icon: gameAssetUrl('items/consumables/earth-fruit.png'),
  },
  'essence-root': {
    id: 'essence-root',
    name: 'Hoàng tinh căn',
    kind: 'consumable',
    restoreHp: 65,
    sellValue: 45,
    buyValue: 110,
    maxStack: 20,
    icon: gameAssetUrl('items/consumables/essence-root.png'),
  },
  'spirit-herb-seed': {
    id: 'spirit-herb-seed',
    name: 'Hạt Thanh Linh Thảo',
    kind: 'material',
    rarity: 'common',
    maxStack: 20,
    buyValue: 8,
    sellValue: 2,
    icon: gameAssetUrl('items/farm/spirit-herb-seed.png'),
  },
  'blood-berry-seed': {
    id: 'blood-berry-seed',
    name: 'Hạt Huyết Quả',
    kind: 'material',
    rarity: 'common',
    maxStack: 20,
    buyValue: 14,
    sellValue: 4,
    icon: gameAssetUrl('items/farm/blood-berry-seed.png'),
  },
  'earth-fruit-seed': {
    id: 'earth-fruit-seed',
    name: 'Hạt Địa Linh Quả',
    kind: 'material',
    rarity: 'rare',
    maxStack: 20,
    buyValue: 24,
    sellValue: 7,
    icon: gameAssetUrl('items/farm/earth-fruit-seed.png'),
  },
  'essence-root-seed': {
    id: 'essence-root-seed',
    name: 'Mầm Hoàng Tinh Căn',
    kind: 'material',
    rarity: 'rare',
    maxStack: 20,
    buyValue: 50,
    sellValue: 14,
    icon: gameAssetUrl('items/farm/essence-root-seed.png'),
  },
  ...Object.fromEntries(
    Object.values(GEM_CATALOG).map((gem) => [
      gem.id,
      {
        id: gem.id,
        name: gem.name,
        kind: 'gem' as const,
        rarity: gem.tier === 1 ? 'common' as const : gem.tier === 2 ? 'rare' as const : 'epic' as const,
        maxStack: 20,
        sellValue: gem.tier * gem.tier * 20,
        icon: GEM_ITEM_ICONS[gem.id],
      },
    ]),
  ),
};

export const BAG_SIZE = 20;
export const WAREHOUSE_SIZE = 24;

export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'accessory', 'relic'];

export interface WarehouseState {
  slots: Array<string | null>;
  quantities: number[];
}

export interface InventoryState {
  bag: Array<string | null>;
  quantities?: number[];
  equipped: Record<EquipSlot, string | null>;
  sockets?: Partial<Record<EquipSlot, SocketState>>;
  coins: number;
  /** Shared personal stash near respawn shrines (persists with the bag). */
  warehouse?: WarehouseState;
}

export function emptyWarehouse(): WarehouseState {
  return {
    slots: Array.from({ length: WAREHOUSE_SIZE }, () => null),
    quantities: Array.from({ length: WAREHOUSE_SIZE }, () => 0),
  };
}

export function ensureWarehouse(state?: WarehouseState | null): WarehouseState {
  const seed = state ?? emptyWarehouse();
  const slots = seed.slots.slice(0, WAREHOUSE_SIZE);
  while (slots.length < WAREHOUSE_SIZE) slots.push(null);
  const quantities = Array.from({ length: WAREHOUSE_SIZE }, (_, index) =>
    slots[index] ? Math.max(1, Math.floor(seed.quantities?.[index] ?? 1)) : 0,
  );
  return { slots, quantities };
}

export function emptyInventory(): InventoryState {
  return {
    bag: Array.from({ length: BAG_SIZE }, () => null),
    quantities: Array.from({ length: BAG_SIZE }, () => 0),
    equipped: { weapon: null, armor: null, accessory: null, relic: null },
    sockets: {},
    coins: 0,
    warehouse: emptyWarehouse(),
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
  readonly quantities: number[];
  readonly warehouseSlots: Array<string | null>;
  readonly warehouseQuantities: number[];
  readonly equipped: Record<EquipSlot, string | null>;
  readonly sockets: Partial<Record<EquipSlot, SocketState>>;
  coins: number;

  constructor(state?: InventoryState) {
    const seed = state ?? emptyInventory();
    this.bag = seed.bag.slice(0, BAG_SIZE);
    while (this.bag.length < BAG_SIZE) this.bag.push(null);
    this.quantities = Array.from({ length: BAG_SIZE }, (_, index) =>
      this.bag[index] ? Math.max(1, Math.floor(seed.quantities?.[index] ?? 1)) : 0,
    );
    const warehouse = ensureWarehouse(seed.warehouse);
    this.warehouseSlots = warehouse.slots;
    this.warehouseQuantities = warehouse.quantities;
    this.equipped = { ...emptyInventory().equipped, ...seed.equipped };
    this.sockets = { ...(seed.sockets ?? {}) };
    this.coins = Math.max(0, Math.floor(seed.coins ?? 0));
  }

  snapshot(): InventoryState {
    return {
      bag: [...this.bag],
      quantities: [...this.quantities],
      equipped: { ...this.equipped },
      sockets: Object.fromEntries(
        Object.entries(this.sockets).map(([slot, state]) => [
          slot,
          state ? { socketCount: state.socketCount, gems: [...state.gems] } : state,
        ]),
      ),
      coins: this.coins,
      warehouse: {
        slots: [...this.warehouseSlots],
        quantities: [...this.warehouseQuantities],
      },
    };
  }

  get full(): boolean {
    return this.bag.every((slot) => slot !== null);
  }

  add(id: string, quantity = 1): boolean {
    const item = ITEM_CATALOG[id];
    if (!item || !Number.isInteger(quantity) || quantity < 1) return false;
    if (!this.canAdd(id, quantity)) return false;
    const maxStack = item.maxStack ?? 1;
    let remaining = quantity;
    for (let index = 0; index < BAG_SIZE && remaining > 0; index += 1) {
      if (this.bag[index] !== id || this.quantities[index] >= maxStack) continue;
      const moved = Math.min(remaining, maxStack - this.quantities[index]);
      this.quantities[index] += moved;
      remaining -= moved;
    }
    while (remaining > 0) {
      const empty = this.bag.indexOf(null);
      if (empty < 0) return false;
      const moved = Math.min(remaining, maxStack);
      this.bag[empty] = id;
      this.quantities[empty] = moved;
      remaining -= moved;
    }
    return true;
  }

  canAdd(id: string, quantity = 1): boolean {
    const item = ITEM_CATALOG[id];
    if (!item || !Number.isInteger(quantity) || quantity < 1) return false;
    const maxStack = item.maxStack ?? 1;
    const capacity = this.bag.reduce((total, slot, index) => {
      if (slot === null) return total + maxStack;
      if (slot === id) return total + Math.max(0, maxStack - this.quantities[index]);
      return total;
    }, 0);
    return capacity >= quantity;
  }

  /** Wear the bag item at `index`. The previously worn piece goes back to the bag. */
  equip(index: number): boolean {
    const id = this.bag[index];
    const item = itemOf(id);
    if (!item || item.kind !== 'equip' || !item.slot) return false;
    const previous = this.equipped[item.slot];
    this.equipped[item.slot] = id;
    this.bag[index] = previous;
    this.quantities[index] = previous ? 1 : 0;
    this.sockets[item.slot] = createSocketState(item.socketCount ?? 0);
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const id = this.equipped[slot];
    if (!id) return false;
    if (this.full) return false;
    this.equipped[slot] = null;
    delete this.sockets[slot];
    return this.add(id);
  }

  /** Consume a bag item. Returns the def so the scene can apply the effect. */
  use(index: number): ItemDef | null {
    const item = itemOf(this.bag[index]);
    if (!item || item.kind !== 'consumable') return null;
    this.removeOne(index);
    return item;
  }

  /** Removes bag items at `index` and credits copper. Defaults to the whole stack. */
  sell(index: number, quantity = this.quantities[index] || 1): { item: ItemDef; quantity: number; gained: number } | null {
    const item = itemOf(this.bag[index]);
    if (!item?.sellValue) return null;
    const have = this.quantities[index] || 0;
    const amount = Math.min(have, Math.max(1, Math.floor(quantity)));
    if (amount < 1) return null;
    for (let i = 0; i < amount; i += 1) this.removeOne(index);
    const gained = item.sellValue * amount;
    this.coins += gained;
    return { item, quantity: amount, gained };
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
    for (const state of Object.values(this.sockets)) {
      if (!state) continue;
      for (const [key, value] of Object.entries(gemBonuses(state))) {
        const field = key as keyof CharacterStats;
        total[field] = (total[field] ?? 0) + (value ?? 0);
      }
    }
    return total;
  }

  socket(slot: EquipSlot, socketIndex: number, bagIndex: number): boolean {
    const equipped = itemOf(this.equipped[slot]);
    const gemId = this.bag[bagIndex];
    if (!equipped || !gemId || !GEM_CATALOG[gemId]) return false;
    const state = this.sockets[slot] ?? createSocketState(equipped.socketCount ?? 0);
    const result = socketGem(state, socketIndex, gemId, this.quantities[bagIndex]);
    if (!result.ok) return false;
    this.sockets[slot] = result.state;
    this.removeOne(bagIndex);
    return true;
  }

  unsocket(slot: EquipSlot, socketIndex: number): boolean {
    const state = this.sockets[slot];
    if (!state) return false;
    const result = removeGem(state, socketIndex);
    if (!result.ok || !this.add(result.gem.id)) return false;
    this.sockets[slot] = result.state;
    return true;
  }

  /** Prefer strongest matching HP or SP potion still in the bag. */
  findQuickUseIndex(kind: 'hp' | 'sp'): number {
    let best = -1;
    let bestPower = -1;
    for (let index = 0; index < BAG_SIZE; index += 1) {
      const item = itemOf(this.bag[index]);
      if (!item || item.kind !== 'consumable') continue;
      const power = kind === 'hp' ? (item.restoreHp ?? 0) : (item.restoreSp ?? 0);
      if (power <= 0) continue;
      if (power > bestPower) {
        bestPower = power;
        best = index;
      }
    }
    return best;
  }

  /** Totals for quick-bar badges. */
  quickUseCounts(): { hp: number; sp: number } {
    let hp = 0;
    let sp = 0;
    for (let index = 0; index < BAG_SIZE; index += 1) {
      const item = itemOf(this.bag[index]);
      if (!item || item.kind !== 'consumable') continue;
      const qty = this.quantities[index] || 0;
      if (item.restoreHp) hp += qty;
      if (item.restoreSp) sp += qty;
    }
    return { hp, sp };
  }

  count(id: string): number {
    return this.bag.reduce(
      (total, itemId, index) => total + (itemId === id ? this.quantities[index] : 0),
      0,
    );
  }

  take(id: string, quantity = 1): boolean {
    if (!Number.isInteger(quantity) || quantity < 1 || this.count(id) < quantity) return false;
    let remaining = quantity;
    for (let index = 0; index < BAG_SIZE && remaining > 0; index += 1) {
      if (this.bag[index] !== id) continue;
      const moved = Math.min(remaining, this.quantities[index]);
      this.quantities[index] -= moved;
      remaining -= moved;
      if (this.quantities[index] === 0) this.bag[index] = null;
    }
    return remaining === 0;
  }

  /** Move items from a bag slot into the shrine warehouse. */
  deposit(bagIndex: number, quantity = this.quantities[bagIndex] || 1): boolean {
    const id = this.bag[bagIndex];
    const item = itemOf(id);
    if (!id || !item) return false;
    const have = this.quantities[bagIndex] || 0;
    let remaining = Math.min(have, Math.max(1, Math.floor(quantity)));
    if (remaining < 1) return false;
    if (!this.canWarehouseHold(id, remaining)) return false;
    const maxStack = item.maxStack ?? 1;
    for (let index = 0; index < WAREHOUSE_SIZE && remaining > 0; index += 1) {
      if (this.warehouseSlots[index] !== id || this.warehouseQuantities[index] >= maxStack) continue;
      const moved = Math.min(remaining, maxStack - this.warehouseQuantities[index]);
      this.warehouseQuantities[index] += moved;
      remaining -= moved;
    }
    while (remaining > 0) {
      const empty = this.warehouseSlots.indexOf(null);
      if (empty < 0) return false;
      const moved = Math.min(remaining, maxStack);
      this.warehouseSlots[empty] = id;
      this.warehouseQuantities[empty] = moved;
      remaining -= moved;
    }
    const taken = Math.min(have, Math.max(1, Math.floor(quantity)));
    this.quantities[bagIndex] -= taken;
    if (this.quantities[bagIndex] <= 0) {
      this.bag[bagIndex] = null;
      this.quantities[bagIndex] = 0;
    }
    return true;
  }

  /** Move items from a warehouse slot back into the bag. */
  withdraw(warehouseIndex: number, quantity = this.warehouseQuantities[warehouseIndex] || 1): boolean {
    const id = this.warehouseSlots[warehouseIndex];
    if (!id) return false;
    const have = this.warehouseQuantities[warehouseIndex] || 0;
    const amount = Math.min(have, Math.max(1, Math.floor(quantity)));
    if (amount < 1 || !this.canAdd(id, amount)) return false;
    if (!this.add(id, amount)) return false;
    this.warehouseQuantities[warehouseIndex] -= amount;
    if (this.warehouseQuantities[warehouseIndex] <= 0) {
      this.warehouseSlots[warehouseIndex] = null;
      this.warehouseQuantities[warehouseIndex] = 0;
    }
    return true;
  }

  private canWarehouseHold(id: string, quantity: number): boolean {
    const item = ITEM_CATALOG[id];
    if (!item || !Number.isInteger(quantity) || quantity < 1) return false;
    const maxStack = item.maxStack ?? 1;
    const capacity = this.warehouseSlots.reduce((total, slot, index) => {
      if (slot === null) return total + maxStack;
      if (slot === id) return total + Math.max(0, maxStack - this.warehouseQuantities[index]);
      return total;
    }, 0);
    return capacity >= quantity;
  }

  private removeOne(index: number): void {
    if (!this.bag[index]) return;
    this.quantities[index] = Math.max(0, this.quantities[index] - 1);
    if (this.quantities[index] === 0) this.bag[index] = null;
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
