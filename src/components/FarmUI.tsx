import { useEffect, useState } from 'react';
import {
  GameBus,
  GameEvent,
  type FarmStatePayload,
} from '../game/events';

export function FarmUI() {
  const [open, setOpen] = useState(false);
  const [farm, setFarm] = useState<FarmStatePayload>({
    available: false,
    selectedSeed: 'spirit-herb-seed',
    seeds: [],
    plots: [],
  });
  const [seed, setSeed] = useState('spirit-herb-seed');

  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    const onState = (payload: FarmStatePayload) => {
      setFarm(payload);
      if (payload.selectedSeed) setSeed(payload.selectedSeed);
    };
    GameBus.on(GameEvent.FarmToggle, toggle);
    GameBus.on(GameEvent.FarmState, onState);
    return () => {
      GameBus.off(GameEvent.FarmToggle, toggle);
      GameBus.off(GameEvent.FarmState, onState);
    };
  }, []);

  if (!open) return null;

  return (
    <section className="rpg-panel farm-panel" aria-label="Linh điền">
      <header className="rpg-panel__header">
        <div>
          <strong>Linh Điền cá nhân</strong>
          <small>
            {farm.available
              ? 'Gieo → Tưới → Thu · F tại ô đất'
              : 'Hãy đến khu Linh Điền'}
          </small>
        </div>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>
      <label className="farm-seed">
        Hạt giống
        <select
          value={seed}
          onChange={(event) => {
            const next = event.target.value;
            setSeed(next);
            GameBus.emit(GameEvent.FarmSelectSeed, { seedId: next });
          }}
        >
          {farm.seeds.map((item) => (
            <option value={item.id} key={item.id}>{item.name} · {item.quantity}</option>
          ))}
        </select>
      </label>
      <div className="farm-grid farm-grid--plots">
        {farm.plots.map((plot) => {
          const needsWater = plot.status === 'growing' && !plot.watered;
          const action = plot.status === 'ready'
            ? 'harvest'
            : needsWater
              ? 'water'
              : plot.status === 'empty'
                ? 'plant'
                : null;
          return (
            <button
              type="button"
              key={plot.id}
              disabled={!farm.available || action === null}
              onClick={() => {
                if (!action) return;
                GameBus.emit(GameEvent.FarmCommand, {
                  action,
                  plotId: plot.id,
                  seedId: seed,
                });
              }}
            >
              <strong>{plot.crop || 'Đất trống'}</strong>
              <small>
                {plot.status === 'empty'
                  ? 'Gieo hạt'
                  : plot.status === 'ready'
                    ? 'Thu hoạch'
                    : needsWater
                      ? 'Tưới nước'
                      : `${Math.round(plot.progress * 100)}%`}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
