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
  const [selectedGem, setSelectedGem] = useState<number | null>(null);
  const [sellMode, setSellMode] = useState(false);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => !v);
      setSellMode(false);
      setSelectedGem(null);
    };
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
        <span>Túi đồ · máu/linh tối đa 20/ô · I đóng</span>
        <strong>{inv.coins ?? 0} tiền đồng</strong>
      </div>
      <div className="bag__toolbar">
        <button
          type="button"
          className={`bag__mode${sellMode ? ' is-on' : ''}`}
          onClick={() => {
            setSellMode((on) => !on);
            setSelectedGem(null);
          }}
        >
          {sellMode ? 'Đang bán · bấm ô để bán hết' : 'Chế độ bán'}
        </button>
        <button
          type="button"
          className="bag__mode"
          onClick={() =>
            GameBus.emit(GameEvent.InventoryCommand, {
              action: 'sell-all',
              kinds: ['consumable', 'material'],
            })
          }
        >
          Bán hết dược liệu
        </button>
      </div>
      <div className="bag__equip">
        {EQUIP_SLOTS.map((slot) => {
          const item = itemOf(inv.equipped[slot]);
          return (
            <button
              key={slot}
              type="button"
              className="bag__slot bag__slot--equip"
              onClick={() => {
                if (selectedGem !== null) {
                  GameBus.emit(GameEvent.InventoryCommand, { action: 'socket', slot, index: selectedGem });
                  setSelectedGem(null);
                  return;
                }
                GameBus.emit(GameEvent.InventoryCommand, { action: 'unequip', slot });
              }}
            >
              <em>{SLOT_LABEL[slot]}</em>
              {item ? <ItemIcon item={item} /> : null}
              <span>{item?.name ?? '—'}</span>
              {inv.sockets?.[slot]?.gems.map((gem, socketIndex) => (
                <small
                  key={`${slot}-${socketIndex}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (gem) {
                      GameBus.emit(GameEvent.InventoryCommand, {
                        action: 'unsocket',
                        slot,
                        socketIndex,
                      });
                    }
                  }}
                >
                  {gem ? `◆ ${itemOf(gem)?.name ?? gem}` : '◇ ô ngọc'}
                </small>
              ))}
            </button>
          );
        })}
      </div>
      <div className="bag__grid">
        {Array.from({ length: BAG_SIZE }, (_, i) => {
          const item = itemOf(inv.bag[i]);
          const qty = inv.quantities?.[i] ?? 1;
          return (
            <button
              key={i}
              type="button"
              className={`bag__slot${selectedGem === i ? ' is-selected' : ''}${
                item?.rarity ? ` is-${item.rarity}` : ''
              }${sellMode && item?.sellValue ? ' is-sellable' : ''}`}
              title={item ? `${item.name} · yêu cầu cấp ${item.requiredLevel ?? 1}` : ''}
              onContextMenu={(event) => {
                event.preventDefault();
                if (item?.sellValue) {
                  GameBus.emit(GameEvent.InventoryCommand, {
                    action: 'sell',
                    index: i,
                    quantity: qty,
                  });
                }
              }}
              onClick={() => {
                if (!item) return;
                if (sellMode) {
                  if (item.sellValue) {
                    GameBus.emit(GameEvent.InventoryCommand, {
                      action: 'sell',
                      index: i,
                      quantity: qty,
                    });
                  }
                  return;
                }
                if (item.kind === 'gem') {
                  setSelectedGem((current) => (current === i ? null : i));
                  return;
                }
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
                  {qty > 1 ? <b>×{qty}</b> : null}
                  {item.sellValue ? <small>Bán {item.sellValue}</small> : null}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="bag__hint">
        {sellMode
          ? 'Chế độ bán: bấm ô để bán cả stack · chuột phải cũng bán'
          : selectedGem !== null
            ? 'Đã chọn ngọc · bấm trang bị có ô trống để khảm'
            : 'Trái: mặc / dùng · phải: bán hết ô · hoặc bật Chế độ bán'}
      </div>
    </div>
  );
}
