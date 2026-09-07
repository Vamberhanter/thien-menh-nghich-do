import type { Inventory } from './Inventory';
import { ITEM_CATALOG, itemOf } from './Inventory';

export interface AlchemyCost {
  id: string;
  quantity: number;
}

export interface AlchemyRecipe {
  id: string;
  name: string;
  outputId: string;
  outputQty: number;
  costs: readonly AlchemyCost[];
  /** Minimum cultivation level to craft. */
  minLevel: number;
  description: string;
}

export const ALCHEMY_RECIPES: readonly AlchemyRecipe[] = [
  {
    id: 'hoi-huyen-dan',
    name: 'Hồi Huyền đan',
    outputId: 'blood-berry',
    outputQty: 2,
    costs: [
      { id: 'spirit-herb', quantity: 2 },
      { id: 'spirit-stone', quantity: 1 },
    ],
    minLevel: 1,
    description: 'Ngưng thảo dược thành huyết quả.',
  },
  {
    id: 'tinh-khi-dan',
    name: 'Tinh Khí đan',
    outputId: 'spirit-stone',
    outputQty: 3,
    costs: [
      { id: 'spirit-herb', quantity: 3 },
      { id: 'earth-fruit', quantity: 1 },
    ],
    minLevel: 2,
    description: 'Luyện linh thạch từ thảo và quả.',
  },
  {
    id: 'boc-cot-dan',
    name: 'Bổ Cốt đan',
    outputId: 'essence-root',
    outputQty: 1,
    costs: [
      { id: 'earth-fruit', quantity: 2 },
      { id: 'blood-berry', quantity: 2 },
    ],
    minLevel: 4,
    description: 'Ngưng căn linh bổ thể.',
  },
  {
    id: 'yeu-huyet-dan',
    name: 'Ngưng Yêu Huyết',
    outputId: 'yeu-huyet',
    outputQty: 1,
    costs: [
      { id: 'blood-berry', quantity: 4 },
      { id: 'spirit-stone', quantity: 2 },
    ],
    minLevel: 5,
    description: 'Chưng yêu huyết từ huyết quả.',
  },
  {
    id: 'linh-cot-dan',
    name: 'Ngưng Linh Cốt',
    outputId: 'linh-cot-ha',
    outputQty: 1,
    costs: [
      { id: 'essence-root', quantity: 2 },
      { id: 'yeu-huyet', quantity: 1 },
    ],
    minLevel: 7,
    description: 'Luyện linh cốt hạ phẩm.',
  },
  {
    id: 'phu-truc-co',
    name: 'Phụ Trúc Cơ tán',
    outputId: 'truc-co-dan',
    outputQty: 1,
    costs: [
      { id: 'linh-cot-ha', quantity: 2 },
      { id: 'yeu-huyet', quantity: 2 },
      { id: 'wood-stone', quantity: 1 },
    ],
    minLevel: 9,
    description: 'Phụ đan hỗ trợ đột phá Trúc Cơ (không thay Trúc Cơ đan mua).',
  },
  {
    id: 'ngung-yeu-dan',
    name: 'Ngưng Yêu Đan',
    outputId: 'yeu-dan',
    outputQty: 1,
    costs: [
      { id: 'yeu-huyet', quantity: 3 },
      { id: 'fire-stone', quantity: 1 },
    ],
    minLevel: 12,
    description: 'Chưng yêu đan cho đột phá Kết Đan.',
  },
  {
    id: 'phu-ket-dan',
    name: 'Phụ Kết Đan tán',
    outputId: 'linh-cot-trung',
    outputQty: 1,
    costs: [
      { id: 'linh-cot-ha', quantity: 3 },
      { id: 'void-stone', quantity: 1 },
    ],
    minLevel: 14,
    description: 'Luyện linh cốt trung phẩm.',
  },
];

export const ALCHEMY_BY_ID: Readonly<Record<string, AlchemyRecipe>> = Object.freeze(
  Object.fromEntries(ALCHEMY_RECIPES.map((recipe) => [recipe.id, recipe])),
);

export type AlchemyError = 'unknown' | 'level' | 'missing' | 'full';

export function craftAlchemy(
  bag: Inventory,
  recipeId: string,
  playerLevel: number,
): { ok: true; recipe: AlchemyRecipe } | { ok: false; error: AlchemyError; missing?: AlchemyCost[] } {
  const recipe = ALCHEMY_BY_ID[recipeId];
  if (!recipe || !ITEM_CATALOG[recipe.outputId]) return { ok: false, error: 'unknown' };
  if (playerLevel < recipe.minLevel) return { ok: false, error: 'level' };
  const missing = recipe.costs
    .map((cost) => ({
      id: cost.id,
      quantity: Math.max(0, cost.quantity - bag.count(cost.id)),
    }))
    .filter((cost) => cost.quantity > 0);
  if (missing.length) return { ok: false, error: 'missing', missing };
  if (!bag.canAdd(recipe.outputId, recipe.outputQty)) return { ok: false, error: 'full' };
  for (const cost of recipe.costs) {
    if (!bag.take(cost.id, cost.quantity)) return { ok: false, error: 'missing' };
  }
  if (!bag.add(recipe.outputId, recipe.outputQty)) return { ok: false, error: 'full' };
  return { ok: true, recipe };
}

export function alchemyCostLabel(cost: AlchemyCost): string {
  return `${itemOf(cost.id)?.name ?? cost.id} ×${cost.quantity}`;
}
