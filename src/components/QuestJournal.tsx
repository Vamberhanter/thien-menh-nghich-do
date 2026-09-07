import { useEffect, useState } from 'react';
import {
  GameBus,
  GameEvent,
  type QuestStatePayload,
  type QuestView,
} from '../game/events';

function actionFor(quest: QuestView): 'accept' | 'complete' | null {
  if (quest.status === 'available') return 'accept';
  if (quest.status === 'ready') return 'complete';
  return null;
}

export function QuestJournal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<QuestStatePayload>({ quests: [], tracked: [] });

  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    GameBus.on(GameEvent.QuestToggle, toggle);
    GameBus.on(GameEvent.QuestState, setState);
    return () => {
      GameBus.off(GameEvent.QuestToggle, toggle);
      GameBus.off(GameEvent.QuestState, setState);
    };
  }, []);

  if (!open) return null;

  return (
    <section className="rpg-panel quest-panel" aria-label="Nhật ký nhiệm vụ">
      <header className="rpg-panel__header">
        <div>
          <strong>Nhật ký nhiệm vụ</strong>
          <small>{state.quests.filter((quest) => quest.status === 'active' || quest.status === 'ready').length} đang làm</small>
        </div>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="quest-list">
        {state.quests.map((quest) => {
          const action = actionFor(quest);
          return (
            <article className={`quest-card is-${quest.status}`} key={quest.id}>
              <div className="quest-card__title">
                <strong>{quest.title}</strong>
                <small>Cấp {quest.minLevel}</small>
              </div>
              <p>{quest.summary}</p>
              <div className="quest-card__progress">{quest.progress}</div>
              <div className="quest-card__reward">{quest.reward}</div>
              <div className="quest-card__actions">
                {action ? (
                  <button
                    type="button"
                    onClick={() => GameBus.emit(GameEvent.QuestCommand, { action, id: quest.id })}
                  >
                    {action === 'accept' ? 'Nhận' : 'Trả nhiệm vụ'}
                  </button>
                ) : null}
                {quest.status === 'active' || quest.status === 'ready' ? (
                  <button
                    type="button"
                    onClick={() => GameBus.emit(GameEvent.QuestCommand, { action: 'track', id: quest.id })}
                  >
                    Theo dõi
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!state.quests.length ? <p className="rpg-panel__empty">Chưa có nhiệm vụ phù hợp.</p> : null}
      </div>
    </section>
  );
}
