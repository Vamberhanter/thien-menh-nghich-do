import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import {
  ALCHEMY_RECIPES,
  type AlchemyRecipe,
} from '../game/systems/AlchemySystem';
import { itemOf, type InventoryState, emptyInventory } from '../game/systems/Inventory';

export function AlchemyUI() {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(1);
  const [inv, setInv] = useState<InventoryState>(emptyInventory());

  useEffect(() => {
    const toggle = (payload?: { forceOpen?: boolean }) => {
      if (payload?.forceOpen) setOpen(true);
      else setOpen((value) => !value);
    };
    const onInv = (next: InventoryState) => {
      if (next?.bag) setInv(next);
    };
    const onProgress = (payload: { level?: number }) => {
      if (typeof payload?.level === 'number') setLevel(payload.level);
    };
    GameBus.on(GameEvent.AlchemyToggle, toggle);
    GameBus.on(GameEvent.Inventory, onInv);
    GameBus.on(GameEvent.Progression, onProgress);
    return () => {
      GameBus.off(GameEvent.AlchemyToggle, toggle);
      GameBus.off(GameEvent.Inventory, onInv);
      GameBus.off(GameEvent.Progression, onProgress);
    };
  }, []);

  if (!open) return null;

  const count = (id: string) =>
    inv.bag.reduce(
      (total, slot, index) => total + (slot === id ? Math.max(1, inv.quantities?.[index] ?? 1) : 0),
      0,
    );

  return (
    <section className="rpg-panel alchemy-panel" aria-label="Luyện đan">
      <header className="rpg-panel__header">
        <div>
          <strong>Luyện Đan Đỉnh</strong>
          <small>Ngưng luyện từ thảo dược · cấp {level}</small>
        </div>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="shop-list">
        {ALCHEMY_RECIPES.map((recipe) => (
          <AlchemyRow
            key={recipe.id}
            recipe={recipe}
            level={level}
            have={count}
            onCraft={() => GameBus.emit(GameEvent.AlchemyCommand, { id: recipe.id })}
          />
        ))}
      </div>
      <p className="rpg-panel__hint">Bấm luyện để trừ nguyên liệu và nhận thành phẩm vào túi.</p>
    </section>
  );
}

function AlchemyRow({
  recipe,
  level,
  have,
  onCraft,
}: {
  recipe: AlchemyRecipe;
  level: number;
  have: (id: string) => number;
  onCraft: () => void;
}) {
  const ready =
    level >= recipe.minLevel &&
    recipe.costs.every((cost) => have(cost.id) >= cost.quantity);
  const out = itemOf(recipe.outputId);
  return (
    <div className="shop-offer">
      <div>
        <strong>{recipe.name}</strong>
        <small>
          {recipe.description} · ra {out?.name ?? recipe.outputId} ×{recipe.outputQty}
        </small>
        <small>
          {recipe.costs
            .map((cost) => `${itemOf(cost.id)?.name ?? cost.id} ${have(cost.id)}/${cost.quantity}`)
            .join(' · ')}
        </small>
      </div>
      <span>Cấp {recipe.minLevel}</span>
      <button type="button" disabled={!ready} onClick={onCraft}>
        Luyện
      </button>
    </div>
  );
}
