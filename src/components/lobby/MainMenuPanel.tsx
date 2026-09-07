import type { AvatarRecord } from '../../net/avatarStore';
import { classOf } from './classes';
import type { CreationMode } from './CharacterCreationPanel';
import type { LobbyView } from './HeaderBar';
import { OrnateButton, Panel } from './parts';

export function MainMenuPanel({
  view,
  mode,
  busy,
  canSolo,
  avatars,
  avatarId,
  roomName,
  onAvatar,
  onDeleteAvatar,
  onNewCharacter,
  onJoinGame,
  onLoadGame,
  onExit,
  onSolo,
}: {
  view: LobbyView;
  mode: CreationMode;
  busy: boolean;
  canSolo: boolean;
  avatars: readonly AvatarRecord[];
  avatarId: string;
  roomName: string | null;
  onAvatar: (row: AvatarRecord, enterJoin?: boolean) => void;
  onDeleteAvatar: (row: AvatarRecord) => void;
  onNewCharacter: () => void;
  onJoinGame: () => void;
  onLoadGame: () => void;
  onExit: () => void;
  onSolo: () => void;
}) {
  const selected = avatars.find((row) => row.id === avatarId) ?? null;

  return (
    <Panel title="Menu chính" sub="Thiên Mệnh" state={view === 'menu' ? 'focus' : 'plain'} grow>
      <div className="rod-btns">
        <OrnateButton size="lg" on={view === 'join'} onClick={onJoinGame} disabled={busy}>
          {roomName ? `Tiếp tục · «${roomName}»` : 'Chọn phòng'}
        </OrnateButton>
        <div className="rod-btns rod-btns--row">
          <OrnateButton
            size="sm"
            on={view === 'create' && mode === 'create'}
            onClick={onNewCharacter}
          >
            Tạo nhân vật
          </OrnateButton>
          <OrnateButton size="sm" onClick={onSolo} disabled={busy || !canSolo}>
            Một mình
          </OrnateButton>
        </div>
      </div>

      <div className="rod-scene">
        <div className="rod-scene__shade" aria-hidden="true" />

        {avatars.length === 0 ? (
          <div className="rod-scene__empty">
            <p>Chưa có nhân vật của bạn.</p>
            <OrnateButton size="sm" onClick={onNewCharacter}>
              Tạo nhân vật
            </OrnateButton>
          </div>
        ) : (
          <div className="rod-scene__picks" role="list">
            {avatars.map((row) => {
              const kit = classOf(row.character);
              const on = row.id === avatarId;
              return (
                <div key={row.id} className="rod-hero-wrap" role="listitem">
                  <button
                    type="button"
                    aria-pressed={on}
                    className={`rod-hero${on ? ' is-on' : ''}`}
                    onClick={() => onAvatar(row, false)}
                    title={`${row.name} · ${kit.archetype}`}
                  >
                    <span
                      className="rod-hero__art"
                      style={{ backgroundImage: `url('${kit.portrait}')` }}
                    />
                    <span className="rod-hero__meta">
                      <strong>{row.name}</strong>
                      <em>
                        {kit.archetype} · Lv {row.level}
                      </em>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rod-hero__del"
                    aria-label={`Xóa ${row.name}`}
                    title="Xóa nhân vật"
                    disabled={busy}
                    onClick={() => onDeleteAvatar(row)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="rod-scene__caption">
          {selected ? (
            <>
              Đang chọn: <b>{selected.name}</b>
              {roomName ? (
                <>
                  {' · phòng: '}
                  <b>{roomName}</b>
                </>
              ) : (
                ' · chưa chọn phòng'
              )}
            </>
          ) : (
            'Chọn phòng trước, rồi chọn nhân vật'
          )}
        </div>
      </div>

      <div className="rod-btns rod-btns--row">
        <OrnateButton size="sm" on={view === 'create' && mode === 'load'} onClick={onLoadGame}>
          Tất cả nhân vật
        </OrnateButton>
        <OrnateButton size="sm" tone="blood" onClick={onExit} disabled={busy}>
          Đăng xuất
        </OrnateButton>
      </div>
    </Panel>
  );
}
