import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import {
  BAG_SIZE,
  EQUIP_SLOTS,
  itemOf,
  type EquipSlot,
  type InventoryState,
  emptyInventory,
} from '../game/systems/Inventory';

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: 'Vũ khí',
  armor: 'Áo',
  accessory: 'Phụ kiện',
  relic: 'Pháp bảo',
};

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
      <div className="bag__title">Túi đồ · I đóng</div>
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
              onClick={() => {
                if (!item) return;
                if (item.kind === 'consumable') {
                  GameBus.emit(GameEvent.InventoryCommand, { action: 'use', index: i });
                  return;
                }
                GameBus.emit(GameEvent.InventoryCommand, { action: 'equip', index: i });
              }}
            >
              {item?.name ?? ''}
            </button>
          );
        })}
      </div>
      <div className="bag__hint">Bấm ô túi để mặc / dùng · bấm ô trang bị để tháo</div>
    </div>
  );
}
