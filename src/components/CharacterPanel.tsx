import { useEffect, useState } from 'react';
import {
  GameBus,
  GameEvent,
  type CharacterBuildPayload,
} from '../game/events';
import { SKILL_CATALOG, type SkillClass } from '../game/systems/SkillSystem';
import { kitBindHint } from '../game/systems/SkillKit';
import { GEM_CATALOG } from '../game/systems/GemSystem';

const ATTRIBUTE_LABELS: Record<string, string> = {
  thePhach: 'Thể Phách',
  lucDao: 'Lực Đạo',
  linhLuc: 'Linh Lực',
  thanPhap: 'Thân Pháp',
  canCot: 'Căn Cốt',
};

export function CharacterPanel() {
  const [open, setOpen] = useState(false);
  const [build, setBuild] = useState<CharacterBuildPayload | null>(null);
  const [tab, setTab] = useState<'attributes' | 'skills' | 'gems' | 'breakthrough'>('attributes');

  useEffect(() => {
    const onToggle = (payload?: { tab?: 'attributes' | 'skills' | 'gems' | 'breakthrough'; forceOpen?: boolean }) => {
      if (payload?.tab) setTab(payload.tab);
      if (payload?.forceOpen) setOpen(true);
      else setOpen((value) => !value);
    };
    const update = (payload: CharacterBuildPayload) => setBuild(payload);
    GameBus.on(GameEvent.CharacterPanelToggle, onToggle);
    GameBus.on(GameEvent.CharacterBuild, update);
    return () => {
      GameBus.off(GameEvent.CharacterPanelToggle, onToggle);
      GameBus.off(GameEvent.CharacterBuild, update);
    };
  }, []);

  if (!open) return null;

  return (
    <section className="rpg-panel character-panel" aria-label="Phát triển nhân vật">
      <header className="rpg-panel__header">
        <div>
          <strong>Tu luyện nhân vật</strong>
          <small>{build?.title ?? `Luyện Khí ${build?.level ?? 1}`}</small>
        </div>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>
      <nav className="rpg-panel__tabs">
        <button className={tab === 'attributes' ? 'is-active' : ''} onClick={() => setTab('attributes')}>
          Chỉ số
        </button>
        <button className={tab === 'skills' ? 'is-active' : ''} onClick={() => setTab('skills')}>
          Kỹ năng
        </button>
        <button className={tab === 'gems' ? 'is-active' : ''} onClick={() => setTab('gems')}>
          Ngọc
        </button>
        <button
          className={tab === 'breakthrough' ? 'is-active' : ''}
          onClick={() => setTab('breakthrough')}
        >
          Đột phá
        </button>
      </nav>

      {!build ? <p className="rpg-panel__empty">Đang tải dữ liệu nhân vật…</p> : null}
      {build && tab === 'attributes' ? (
        <>
          <div className="rpg-panel__currency">Điểm chỉ số: {build.attributePoints}</div>
          <div className="build-list">
            {Object.entries(build.attributes).map(([id, value]) => (
              <div className="build-row" key={id}>
                <span>{ATTRIBUTE_LABELS[id] ?? id}</span>
                <strong>{value}</strong>
                <button
                  type="button"
                  disabled={build.attributePoints < 1}
                  onClick={() => GameBus.emit(GameEvent.CharacterBuildCommand, { action: 'attribute', id })}
                >
                  +
                </button>
              </div>
            ))}
          </div>
          <button
            className="rpg-panel__secondary"
            type="button"
            onClick={() => GameBus.emit(GameEvent.CharacterBuildCommand, { action: 'reset-attributes' })}
          >
            Tẩy điểm (cần tiền)
          </button>
        </>
      ) : null}

      {build && tab === 'skills' ? (
        <>
          <div className="rpg-panel__currency">Điểm kỹ năng: {build.skillPoints}</div>
          <div className="skill-tree">
            {Object.entries(build.skills).map(([id, rank]) => (
              <button
                type="button"
                className="skill-node"
                key={id}
                disabled={build.skillPoints < 1}
                onClick={() => GameBus.emit(GameEvent.CharacterBuildCommand, { action: 'skill', id })}
              >
                <strong>{SKILL_CATALOG[id]?.name ?? id.replace(/-/g, ' ')}</strong>
                <small>
                  Cấp {rank}/{SKILL_CATALOG[id]?.maxRank ?? 1} · yêu cầu cấp{' '}
                  {SKILL_CATALOG[id]?.requiredLevel ?? 1}
                  {kitBindHint(id, (build.character as SkillClass) ?? 'nhuyen')
                    ? ` · phím ${kitBindHint(id, (build.character as SkillClass) ?? 'nhuyen')}`
                    : ''}
                </small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {build && tab === 'gems' ? (
        <div className="gem-catalog">
          <p className="rpg-panel__hint">Chọn ngọc trong túi, sau đó bấm trang bị có ô trống để khảm.</p>
          {Object.values(GEM_CATALOG).map((gem) => (
            <div className={`gem-row is-tier-${gem.tier}`} key={gem.id}>
              <strong>{gem.name}</strong>
              <small>
                {Object.entries(gem.bonus).map(([stat, value]) => `${stat} +${value}`).join(' · ')}
              </small>
            </div>
          ))}
        </div>
      ) : null}

      {build && tab === 'breakthrough' ? (
        <div className="breakthrough-panel">
          <p className="rpg-panel__hint">
            {build.breakthrough.recipeName
              ? build.breakthrough.recipeName
              : 'Thu thập nguyên liệu từ quái và boss để đột phá cảnh giới.'}
          </p>
          {build.breakthrough.lockedReason ? (
            <div className="rpg-panel__currency">{build.breakthrough.lockedReason}</div>
          ) : null}
          <div className="build-list">
            {build.breakthrough.costs.map((cost) => (
              <div className="build-row" key={cost.id}>
                <span className="breakthrough-cost">
                  {cost.icon ? (
                    <img className="bag__icon" src={cost.icon} alt="" draggable={false} />
                  ) : null}
                  {cost.name}
                </span>
                <strong className={cost.have >= cost.need ? 'is-ready' : 'is-short'}>
                  {cost.have}/{cost.need}
                </strong>
              </div>
            ))}
          </div>
          {!build.breakthrough.costs.length ? (
            <p className="rpg-panel__empty">Chưa có công pháp đột phá cho cảnh giới này.</p>
          ) : null}
          <button
            className="rpg-panel__secondary"
            type="button"
            disabled={!build.breakthrough.available}
            onClick={() => GameBus.emit(GameEvent.CharacterBuildCommand, { action: 'breakthrough' })}
          >
            Đột phá
          </button>
        </div>
      ) : null}
    </section>
  );
}
