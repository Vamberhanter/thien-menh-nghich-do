import type { Inventory } from './Inventory';
import { ITEM_CATALOG } from './Inventory';
import {
  MAX_LEVEL,
  REALM_SIZE,
  realmName,
  realmOf,
  type Progression,
} from './Progression';

export interface BreakthroughCost {
  id: string;
  quantity: number;
}

export interface BreakthroughRecipe {
  id: string;
  name: string;
  /** Global level that must already be reached (realm peak). */
  fromLevel: number;
  /** Global level after a successful ritual. */
  toLevel: number;
  costs: readonly BreakthroughCost[];
}

export type BreakthroughError =
  | 'not-at-peak'
  | 'absolute-cap'
  | 'no-recipe'
  | 'missing-materials';

export type BreakthroughResult =
  | {
      ok: true;
      fromLevel: number;
      toLevel: number;
      title: string;
      consumed: readonly BreakthroughCost[];
    }
  | { ok: false; error: BreakthroughError; missing?: readonly BreakthroughCost[] };

/**
 * Realm breakthroughs. Trúc Cơ 9 → Kết Đan 1 needs Kết Đan đan.
 */
export const BREAKTHROUGH_CATALOG: Readonly<Record<string, BreakthroughRecipe>> = Object.freeze({
  'luyen-khi-to-truc-co': {
    id: 'luyen-khi-to-truc-co',
    name: 'Đột phá Trúc Cơ',
    fromLevel: REALM_SIZE,
    toLevel: REALM_SIZE + 1,
    costs: [
      { id: 'linh-cot-ha', quantity: 3 },
      { id: 'yeu-huyet', quantity: 2 },
      { id: 'truc-co-dan', quantity: 1 },
    ],
  },
  'truc-co-to-ket-dan': {
    id: 'truc-co-to-ket-dan',
    name: 'Đột phá Kết Đan',
    fromLevel: REALM_SIZE * 2,
    toLevel: REALM_SIZE * 2 + 1,
    costs: [
      { id: 'linh-cot-trung', quantity: 3 },
      { id: 'yeu-dan', quantity: 2 },
      { id: 'ket-dan-dan', quantity: 1 },
    ],
  },
});

export function recipeForLevel(level: number): BreakthroughRecipe | null {
  return Object.values(BREAKTHROUGH_CATALOG).find((recipe) => recipe.fromLevel === level) ?? null;
}

export function missingCosts(
  inventory: Inventory,
  costs: readonly BreakthroughCost[],
): BreakthroughCost[] {
  return costs
    .map((cost) => ({
      id: cost.id,
      quantity: Math.max(0, cost.quantity - inventory.count(cost.id)),
    }))
    .filter((cost) => cost.quantity > 0);
}

export function canBreakThrough(
  progress: Readonly<Progression>,
  inventory: Inventory,
): BreakthroughResult {
  if (progress.level >= MAX_LEVEL) return { ok: false, error: 'absolute-cap' };
  if (!progress.atRealmCap) return { ok: false, error: 'not-at-peak' };
  const recipe = recipeForLevel(progress.level);
  if (!recipe) return { ok: false, error: 'no-recipe' };
  const missing = missingCosts(inventory, recipe.costs);
  if (missing.length) return { ok: false, error: 'missing-materials', missing };
  return {
    ok: true,
    fromLevel: recipe.fromLevel,
    toLevel: recipe.toLevel,
    title: recipe.name,
    consumed: recipe.costs,
  };
}

/**
 * Consumes breakthrough mats and advances global level by one realm step.
 * Mutates `progress` and `inventory` only on success.
 */
export function breakThrough(progress: Progression, inventory: Inventory): BreakthroughResult {
  const check = canBreakThrough(progress, inventory);
  if (!check.ok) return check;
  const recipe = recipeForLevel(progress.level);
  if (!recipe) return { ok: false, error: 'no-recipe' };

  for (const cost of recipe.costs) {
    if (!inventory.take(cost.id, cost.quantity)) {
      return { ok: false, error: 'missing-materials', missing: missingCosts(inventory, recipe.costs) };
    }
  }
  if (!progress.applyBreakthrough(recipe.toLevel)) {
    return { ok: false, error: 'no-recipe' };
  }
  const toRealm = realmOf(recipe.toLevel);
  const toRank = recipe.toLevel - (toRealm === 'luyen-khi' ? 0 : toRealm === 'truc-co' ? REALM_SIZE : REALM_SIZE * 2);
  return {
    ok: true,
    fromLevel: recipe.fromLevel,
    toLevel: recipe.toLevel,
    title: `${realmName(toRealm)} ${toRank}`,
    consumed: recipe.costs,
  };
}

export function costLabel(cost: BreakthroughCost): string {
  const item = ITEM_CATALOG[cost.id];
  return `${item?.name ?? cost.id} ×${cost.quantity}`;
}
