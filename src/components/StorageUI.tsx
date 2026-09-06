import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import {
  BAG_SIZE,
  WAREHOUSE_SIZE,
  emptyInventory,
  itemOf,
  type InventoryState,
  type ItemDef,
} from '../game/systems/Inventory';

function ItemIcon({ item }: { item: ItemDef }) {
  if (item.icon) return <img className="bag__icon" src={item.icon} alt="" draggable={false} />;
  return <span className="bag__icon bag__icon--mono">{[...item.name][0]}</span>;
}

export function StorageUI() {
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState<InventoryState>(emptyInventory());

  useEffect(() => {
    const onToggle = (payload?: { forceOpen?: boolean }) => {
      if (payload?.forceOpen) setOpen(true);
      else setOpen((value) => !value);
    };
    const onInv = (next: InventoryState) => {
      if (next?.bag) setInv(next);
    };
    GameBus.on(GameEvent.StorageToggle, onToggle);
    GameBus.on(GameEvent.Inventory, onInv);
    return () => {
      GameBus.off(GameEvent.StorageToggle, onToggle);
      GameBus.off(GameEvent.Inventory, onInv);
    };
  }, []);

  if (!open) return null;

  const warehouse = inv.warehouse ?? { slots: [], quantities: [] };

  return (
    <section className="rpg-panel storage-panel" aria-label="Rương trữ đồ">
      <header className="rpg-panel__header">
        <div>
          <strong>Rương trữ đồ</strong>
          <small>Gần trụ hồi sinh · dùng chung mọi khu</small>
        </div>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>

      <div className="storage-columns">
        <div>
          <h3>Túi đồ</h3>
          <div className="storage-grid">
            {Array.from({ length: BAG_SIZE }, (_, index) => {
              const item = itemOf(inv.bag[index]);
              const quantity = Math.max(1, inv.quantities?.[index] ?? 1);
              return (
                <button
                  type="button"
                  key={`bag-${index}`}
                  className={`bag__slot${item ? '' : ' is-empty'}`}
                  disabled={!item}
                  title={item ? `${item.name} · gửi vào rương` : 'Trống'}
                  onClick={() =>
                    GameBus.emit(GameEvent.StorageCommand, {
                      action: 'deposit',
                      index,
                      quantity,
                    })
                  }
                >
                  {item ? (
                    <>
                      <ItemIcon item={item} />
                      {quantity > 1 ? <b>×{quantity}</b> : null}
                      <em>{item.name}</em>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3>Rương ({WAREHOUSE_SIZE} ô)</h3>
          <div className="storage-grid">
            {Array.from({ length: WAREHOUSE_SIZE }, (_, index) => {
              const item = itemOf(warehouse.slots[index]);
              const quantity = Math.max(1, warehouse.quantities?.[index] ?? 1);
              return (
                <button
                  type="button"
                  key={`wh-${index}`}
                  className={`bag__slot${item ? '' : ' is-empty'}`}
                  disabled={!item}
                  title={item ? `${item.name} · lấy ra túi` : 'Trống'}
                  onClick={() =>
                    GameBus.emit(GameEvent.StorageCommand, {
                      action: 'withdraw',
                      index,
                      quantity,
                    })
                  }
                >
                  {item ? (
                    <>
                      <ItemIcon item={item} />
                      {quantity > 1 ? <b>×{quantity}</b> : null}
                      <em>{item.name}</em>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="rpg-panel__hint">Bấm ô túi để gửi · bấm ô rương để lấy · F gần rương để mở.</p>
    </section>
  );
}
