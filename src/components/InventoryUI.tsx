import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import {
  BAG_SIZE,
  EQUIP_SLOTS,
  itemOf,
  type EquipSlot,
  type InventoryState,
  type ItemDef,
  emptyInventory,
} from '../game/systems/Inventory';

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: 'Vũ khí',
  armor: 'Áo',
  accessory: 'Phụ kiện',
  relic: 'Pháp bảo',
};

/**
 * Sprite for the items the art pack covers, and the item's initial for the rest,
 * so a mixed bag still reads as an even grid.
 */
function ItemIcon({ item }: { item: ItemDef }) {
  if (item.icon) return <img className="bag__icon" src={item.icon} alt="" draggable={false} />;
  return <span className="bag__icon bag__icon--mono">{[...item.name][0]}</span>;
}

export function InventoryUI() {
  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState<InventoryState>(emptyInventory());

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onInv = (next: InventoryState) => {
      if (next?.bag) setInv(next);
    };
    GameBus.on(GameEvent.InventoryToggle, onToggle);
    GameBus.on(GameEvent.Inventory, onInv);
    return () => {
      GameBus.off(GameEvent.InventoryToggle, onToggle);
      GameBus.off(GameEvent.Inventory, onInv);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="bag">
      <div className="bag__title">
        <span>Túi đồ · I đóng</span>
        <strong>{inv.coins ?? 0} tiền đồng</strong>
      </div>
      <div className="bag__equip">
        {EQUIP_SLOTS.map((slot) => {
          const item = itemOf(inv.equipped[slot]);
          return (
            <button
              key={slot}
              type="button"
              className="bag__slot bag__slot--equip"
              onClick={() => GameBus.emit(GameEvent.InventoryCommand, { action: 'unequip', slot })}
            >
              <em>{SLOT_LABEL[slot]}</em>
              {item ? <ItemIcon item={item} /> : null}
              <span>{item?.name ?? '—'}</span>
            </button>
          );
        })}
      </div>
      <div className="bag__grid">
        {Array.from({ length: BAG_SIZE }, (_, i) => {
          const item = itemOf(inv.bag[i]);
          return (
            <button
              key={i}
              type="button"
              className="bag__slot"
              title={item?.name ?? ''}
              onContextMenu={(event) => {
                event.preventDefault();
                if (item?.sellValue) {
                  GameBus.emit(GameEvent.InventoryCommand, { action: 'sell', index: i });
                }
              }}
              onClick={() => {
                if (!item) return;
                if (item.kind === 'consumable') {
                  GameBus.emit(GameEvent.InventoryCommand, { action: 'use', index: i });
                  return;
                }
                GameBus.emit(GameEvent.InventoryCommand, { action: 'equip', index: i });
              }}
            >
              {item ? (
                <>
                  <ItemIcon item={item} />
                  <span>{item.name}</span>
                  {item.sellValue ? <small>Bán {item.sellValue}</small> : null}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="bag__hint">
        Chuột trái: mặc / dùng · chuột phải: bán · bấm trang bị để tháo
      </div>
    </div>
  );
}
