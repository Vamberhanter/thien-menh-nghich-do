import { useEffect, useMemo, useState } from 'react';
import {
  GameBus,
  GameEvent,
  type ShopStatePayload,
} from '../game/events';
import {
  itemOf,
  type InventoryState,
  emptyInventory,
} from '../game/systems/Inventory';

type ShopTab = 'buy' | 'sell';

export function ShopUI() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ShopTab>('buy');
  const [shop, setShop] = useState<ShopStatePayload>({
    merchant: 'Thương nhân Ngoại Môn',
    coins: 0,
    offers: [],
  });
  const [inv, setInv] = useState<InventoryState>(emptyInventory());

  useEffect(() => {
    const toggle = () => {
      setOpen((value) => !value);
      setTab('buy');
    };
    const onInv = (next: InventoryState) => {
      if (next?.bag) setInv(next);
    };
    GameBus.on(GameEvent.ShopToggle, toggle);
    GameBus.on(GameEvent.ShopState, setShop);
    GameBus.on(GameEvent.Inventory, onInv);
    return () => {
      GameBus.off(GameEvent.ShopToggle, toggle);
      GameBus.off(GameEvent.ShopState, setShop);
      GameBus.off(GameEvent.Inventory, onInv);
    };
  }, []);

  const sellables = useMemo(() => {
    const rows: Array<{
      index: number;
      name: string;
      quantity: number;
      unit: number;
      total: number;
      kind: string;
    }> = [];
    for (let index = 0; index < inv.bag.length; index += 1) {
      const item = itemOf(inv.bag[index]);
      if (!item?.sellValue) continue;
      const quantity = Math.max(1, inv.quantities?.[index] ?? 1);
      rows.push({
        index,
        name: item.name,
        quantity,
        unit: item.sellValue,
        total: item.sellValue * quantity,
        kind: item.kind,
      });
    }
    return rows;
  }, [inv]);

  if (!open) return null;

  return (
    <section className="rpg-panel shop-panel" aria-label="Cửa hàng">
      <header className="rpg-panel__header">
        <div>
          <strong>{shop.merchant}</strong>
          <small>{shop.coins} tiền đồng</small>
        </div>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>

      <div className="rpg-panel__tabs">
        <button
          type="button"
          className={tab === 'buy' ? 'is-active' : ''}
          onClick={() => setTab('buy')}
        >
          Mua
        </button>
        <button
          type="button"
          className={tab === 'sell' ? 'is-active' : ''}
          onClick={() => setTab('sell')}
        >
          Bán
        </button>
      </div>

      {tab === 'buy' ? (
        <div className="shop-list">
          {shop.offers.map((offer) => (
            <div className="shop-offer" key={offer.id}>
              <div>
                <strong>{offer.name}</strong>
                <small>Yêu cầu cấp {offer.minLevel}</small>
              </div>
              <span>{offer.price} đồng</span>
              <button
                type="button"
                disabled={!offer.available || shop.coins < offer.price}
                onClick={() => GameBus.emit(GameEvent.ShopCommand, { action: 'buy', id: offer.id })}
              >
                Mua
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="shop-sell-actions">
            <button
              type="button"
              className="rpg-panel__secondary"
              disabled={sellables.every((row) => row.kind !== 'consumable' && row.kind !== 'material')}
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
          <div className="shop-list">
            {sellables.length === 0 ? (
              <p className="rpg-panel__empty">Túi không có gì để bán.</p>
            ) : (
              sellables.map((row) => (
                <div className="shop-offer shop-offer--sell" key={`${row.index}-${row.name}`}>
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      ×{row.quantity} · {row.unit} đồng/cái
                    </small>
                  </div>
                  <span>{row.total} đồng</span>
                  <div className="shop-offer__sell-btns">
                    <button
                      type="button"
                      onClick={() =>
                        GameBus.emit(GameEvent.InventoryCommand, {
                          action: 'sell',
                          index: row.index,
                          quantity: 1,
                        })
                      }
                    >
                      Bán 1
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        GameBus.emit(GameEvent.InventoryCommand, {
                          action: 'sell',
                          index: row.index,
                          quantity: row.quantity,
                        })
                      }
                    >
                      Bán hết
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <p className="rpg-panel__hint">
        {tab === 'buy'
          ? 'Có bán nguyên liệu đột phá (Trúc Cơ đan, Kết Đan đan, linh cốt, yêu đan…).'
          : 'Bán 1 / Bán hết từng ô · Bán hết dược liệu · có bán linh thạch & kiếm.'}
      </p>
      <button
        type="button"
        className="rpg-panel__secondary shop-breakthrough-btn"
        onClick={() => {
          setOpen(false);
          GameBus.emit(GameEvent.CharacterPanelToggle, { tab: 'breakthrough', forceOpen: true });
        }}
      >
        Mở đột phá
      </button>
    </section>
  );
}
