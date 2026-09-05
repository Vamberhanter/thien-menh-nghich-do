import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import type { WarpStatePayload } from '../game/events';
import { ZONE_ORDER, zoneOf } from '../game/zones';
import type { ZoneId } from '../game/zones';

export function WarpUI() {
  const [state, setState] = useState<WarpStatePayload>({
    open: false,
    current: 'ngoai-mon',
    unlocked: ['ngoai-mon'],
  });

  useEffect(() => {
    const onState = (next: WarpStatePayload) => {
      if (next && typeof next.open === 'boolean') setState(next);
    };
    GameBus.on(GameEvent.WarpState, onState);
    return () => {
      GameBus.off(GameEvent.WarpState, onState);
    };
  }, []);

  if (!state.open) return null;

  return (
    <div className="warp">
      <div className="warp__title">Điểm dịch chuyển · T đóng</div>
      <div className="warp__list">
        {ZONE_ORDER.map((id) => {
          const zone = zoneOf(id);
          const unlocked = state.unlocked.includes(id);
          const here = state.current === id;
          return (
            <button
              key={id}
              type="button"
              className={`warp__row${here ? ' is-here' : ''}${unlocked ? '' : ' is-locked'}`}
              disabled={!unlocked || here}
              onClick={() => GameBus.emit(GameEvent.WarpCommand, { action: 'travel', zone: id as ZoneId })}
            >
              <span>{zone.name}</span>
              <em>{here ? 'đang đứng' : unlocked ? 'đã đi' : 'chưa đến'}</em>
            </button>
          );
        })}
      </div>
      <div className="warp__hint">Chỉ dịch chuyển tới huyết mạch đã từng đặt chân</div>
      <button
        type="button"
        className="warp__close"
        onClick={() => GameBus.emit(GameEvent.WarpCommand, { action: 'close' })}
      >
        Đóng
      </button>
    </div>
  );
}
