import { Inventory } from './Inventory';

export interface LootGrant {
  added: string[];
  leftover: string[];
}

/** Adds a reward as one transaction per item stack and reports overflow. */
export function grantLoot(inventory: Inventory, itemIds: readonly string[]): LootGrant {
  const added: string[] = [];
  const leftover: string[] = [];
  for (const id of itemIds) {
    if (inventory.add(id)) added.push(id);
    else leftover.push(id);
  }
  return { added, leftover };
}
