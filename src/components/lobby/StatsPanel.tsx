import { MAX_LEVEL, Progression } from '../../game/systems/Progression';
import type { NetCharacter } from '../../net/types';
import { classOf } from './classes';
import { Panel } from './parts';

/**
 * The numbers the kit will actually spawn with, read straight off
 * `Progression` so the panel cannot drift from the live game.
 */
export function StatsPanel({
  character,
  level,
  xp,
}: {
  character: NetCharacter;
  level: number;
  xp: number;
}) {
  const progression = new Progression();
  progression.restore({ level, xp });
  const stats = progression.derive(character);
  const entry = classOf(character);
  const capped = level >= MAX_LEVEL;

  return (
    <Panel title="Chỉ số" sub="Căn cơ">
      <div className="rod-stats">
        <Stat label="Cấp" value={String(level)} highlight />
        <Stat label="KN" value={capped ? 'đỉnh' : `${xp}/${progression.need}`} />
        <Stat label="Máu" value={String(stats.maxHp)} />
        <Stat label="Linh" value={String(stats.maxSpiritualPower)} />
        <Stat label="Công" value={String(stats.attack)} />
        <Stat label="Thủ" value={String(stats.defense)} />
        <Stat label="Tốc" value={String(stats.speed)} wide />
      </div>
      <div className="rod-note">
        {entry.archetype} · {entry.name} · {entry.sect}
      </div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  wide = false,
  highlight = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  highlight?: boolean;
}) {
  const classes = ['rod-stat', wide ? 'rod-stat--wide' : '', highlight ? 'rod-stat--hi' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <span className="rod-stat__key">{label}</span>
      <span className="rod-stat__dots" />
      <span className="rod-stat__value">{value}</span>
    </div>
  );
}
