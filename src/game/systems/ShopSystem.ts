export interface ShopOffer {
  id: string;
  itemId: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  /** Undefined means unlimited stock. */
  stock?: number;
  requiredLevel?: number;
}

export interface ShopState {
  coins: number;
  items: Record<string, number>;
  stock: Record<string, number>;
  capacity?: number;
}

export type ShopError =
  | 'unknown-offer'
  | 'invalid-quantity'
  | 'level-required'
  | 'insufficient-coins'
  | 'insufficient-stock'
  | 'insufficient-items'
  | 'inventory-full'
  | 'not-sellable';

export interface ShopReceipt {
  itemId: string;
  quantity: number;
  coinsChanged: number;
  unitPrice: number;
}

export type ShopResult =
  | { ok: true; state: ShopState; receipt: ShopReceipt }
  | { ok: false; state: ShopState; error: ShopError };

export const SHOP_CATALOG: readonly ShopOffer[] = [
  { id: 'spirit-herb-seed', itemId: 'spirit-herb-seed', name: 'Hạt Thanh Linh Thảo', buyPrice: 8, sellPrice: 2 },
  { id: 'blood-berry-seed', itemId: 'blood-berry-seed', name: 'Hạt Huyết Quả', buyPrice: 14, sellPrice: 4, requiredLevel: 2 },
  { id: 'earth-fruit-seed', itemId: 'earth-fruit-seed', name: 'Hạt Địa Linh Quả', buyPrice: 24, sellPrice: 7, requiredLevel: 3 },
  { id: 'essence-root-seed', itemId: 'essence-root-seed', name: 'Mầm Hoàng Tinh Căn', buyPrice: 50, sellPrice: 14, requiredLevel: 5 },
  { id: 'spirit-stone', itemId: 'spirit-stone', name: 'Linh thạch', buyPrice: 12, sellPrice: 5 },
  { id: 'spirit-herb', itemId: 'spirit-herb', name: 'Thanh linh thảo', buyPrice: 24, sellPrice: 10 },
  { id: 'blood-berry', itemId: 'blood-berry', name: 'Huyết quả', buyPrice: 38, sellPrice: 16, requiredLevel: 2 },
  { id: 'earth-fruit', itemId: 'earth-fruit', name: 'Địa linh quả', buyPrice: 58, sellPrice: 24, requiredLevel: 3 },
  { id: 'essence-root', itemId: 'essence-root', name: 'Hoàng tinh căn', buyPrice: 110, sellPrice: 45, stock: 3, requiredLevel: 5 },
  { id: 'iron-sword', itemId: 'iron-sword', name: 'Kiếm phế sắt', buyPrice: 90, sellPrice: 35, stock: 1 },
  { id: 'bronze-sword', itemId: 'bronze-sword', name: 'Thanh Đồng kiếm', buyPrice: 180, sellPrice: 70, stock: 1, requiredLevel: 2 },
  { id: 'jade-sword', itemId: 'jade-sword', name: 'Linh Ngọc kiếm', buyPrice: 360, sellPrice: 140, stock: 1, requiredLevel: 4 },
  // Đột phá Luyện Khí 9 → Trúc Cơ (~520 đồng đủ bộ)
  { id: 'yeu-huyet', itemId: 'yeu-huyet', name: 'Yêu huyết', buyPrice: 28, sellPrice: 8, requiredLevel: 5 },
  { id: 'linh-cot-ha', itemId: 'linh-cot-ha', name: 'Linh cốt hạ phẩm', buyPrice: 48, sellPrice: 14, requiredLevel: 7 },
  {
    id: 'truc-co-dan',
    itemId: 'truc-co-dan',
    name: 'Trúc Cơ đan',
    buyPrice: 320,
    sellPrice: 120,
    stock: 3,
    requiredLevel: 9,
  },
  { id: 'linh-cot-trung', itemId: 'linh-cot-trung', name: 'Linh cốt trung phẩm', buyPrice: 95, sellPrice: 28, requiredLevel: 12 },
  { id: 'yeu-dan', itemId: 'yeu-dan', name: 'Yêu đan', buyPrice: 140, sellPrice: 40, requiredLevel: 14 },
  {
    id: 'ket-dan-dan',
    itemId: 'ket-dan-dan',
    name: 'Kết Đan đan',
    buyPrice: 780,
    sellPrice: 280,
    stock: 2,
    requiredLevel: 18,
  },
];

export const SHOP_OFFERS: Readonly<Record<string, ShopOffer>> = Object.freeze(
  Object.fromEntries(SHOP_CATALOG.map((offer) => [offer.id, offer])),
);

const whole = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function createShopState(
  coins = 0,
  items: Readonly<Record<string, number>> = {},
  capacity?: number,
): ShopState {
  const normalized: Record<string, number> = {};
  for (const [id, quantity] of Object.entries(items)) {
    if (whole(quantity) > 0) normalized[id] = whole(quantity);
  }
  const stock = Object.fromEntries(
    SHOP_CATALOG.flatMap((offer) =>
      offer.stock === undefined ? [] : [[offer.id, whole(offer.stock)]],
    ),
  );
  return {
    coins: whole(coins),
    items: normalized,
    stock,
    ...(capacity === undefined ? {} : { capacity: whole(capacity) }),
  };
}

export function snapshotShop(state: Readonly<ShopState>): ShopState {
  return {
    coins: whole(state.coins),
    items: Object.fromEntries(
      Object.entries(state.items)
        .filter(([, quantity]) => whole(quantity) > 0)
        .map(([id, quantity]) => [id, whole(quantity)]),
    ),
    stock: Object.fromEntries(
      Object.entries(state.stock).map(([id, quantity]) => [id, whole(quantity)]),
    ),
    ...(state.capacity === undefined ? {} : { capacity: whole(state.capacity) }),
  };
}

function itemCount(state: ShopState): number {
  return Object.values(state.items).reduce((sum, quantity) => sum + quantity, 0);
}

export function buyOffer(
  state: Readonly<ShopState>,
  offerId: string,
  quantity = 1,
  playerLevel = 1,
): ShopResult {
  const next = snapshotShop(state);
  const offer = SHOP_OFFERS[offerId];
  if (!offer) return { ok: false, state: next, error: 'unknown-offer' };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, state: next, error: 'invalid-quantity' };
  }
  if (playerLevel < (offer.requiredLevel ?? 1)) {
    return { ok: false, state: next, error: 'level-required' };
  }
  const total = offer.buyPrice * quantity;
  if (next.coins < total) return { ok: false, state: next, error: 'insufficient-coins' };
  if (offer.stock !== undefined && (next.stock[offerId] ?? offer.stock) < quantity) {
    return { ok: false, state: next, error: 'insufficient-stock' };
  }
  if (next.capacity !== undefined && itemCount(next) + quantity > next.capacity) {
    return { ok: false, state: next, error: 'inventory-full' };
  }
  next.coins -= total;
  next.items[offer.itemId] = (next.items[offer.itemId] ?? 0) + quantity;
  if (offer.stock !== undefined) {
    next.stock[offerId] = (next.stock[offerId] ?? offer.stock) - quantity;
  }
  return {
    ok: true,
    state: next,
    receipt: { itemId: offer.itemId, quantity, coinsChanged: -total, unitPrice: offer.buyPrice },
  };
}

export function sellItem(
  state: Readonly<ShopState>,
  itemId: string,
  quantity = 1,
): ShopResult {
  const next = snapshotShop(state);
  const offer = SHOP_CATALOG.find((candidate) => candidate.itemId === itemId);
  if (!offer || offer.sellPrice <= 0) return { ok: false, state: next, error: 'not-sellable' };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, state: next, error: 'invalid-quantity' };
  }
  if ((next.items[itemId] ?? 0) < quantity) {
    return { ok: false, state: next, error: 'insufficient-items' };
  }
  const total = offer.sellPrice * quantity;
  next.items[itemId] -= quantity;
  if (next.items[itemId] === 0) delete next.items[itemId];
  next.coins += total;
  if (offer.stock !== undefined) next.stock[offer.id] = (next.stock[offer.id] ?? 0) + quantity;
  return {
    ok: true,
    state: next,
    receipt: { itemId, quantity, coinsChanged: total, unitPrice: offer.sellPrice },
  };
}
