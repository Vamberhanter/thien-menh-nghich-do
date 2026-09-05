import { CHARACTER_NAME, type NetCharacter } from '../../net/types';
import type { AvatarRecord } from '../../net/avatarStore';
import { CLASSES, classOf, type Gender } from './classes';
import { OrnateButton, Panel } from './parts';

/** `create` forges a new hero, `load` picks one that is already saved. */
export type CreationMode = 'create' | 'load';

export function CharacterCreationPanel({
  mode,
  focused,
  pick,
  onPick,
  gender,
  onGender,
  name,
  onName,
  onForge,
  avatars,
  avatarId,
  onAvatar,
  onDeleteAvatar,
  busy,
}: {
  mode: CreationMode;
  focused: boolean;
  pick: NetCharacter;
  onPick: (id: NetCharacter) => void;
  gender: Gender;
  onGender: (gender: Gender) => void;
  name: string;
  onName: (name: string) => void;
  onForge: () => void;
  avatars: readonly AvatarRecord[];
  avatarId: string;
  onAvatar: (row: AvatarRecord) => void;
  onDeleteAvatar: (row: AvatarRecord) => void;
  busy: boolean;
}) {
  const loading = mode === 'load';

  return (
    <Panel
      title={loading ? 'Tải nhân vật' : 'Tạo nhân vật'}
      sub={loading ? 'Nhân vật đã lưu' : 'Chọn hệ phái'}
      state={focused ? 'focus' : 'idle'}
      grow
    >
      <div className="rod-panel__scroll">
        {loading ? (
          <Roster
            avatars={avatars}
            avatarId={avatarId}
            onAvatar={onAvatar}
            onDeleteAvatar={onDeleteAvatar}
            busy={busy}
          />
        ) : (
          <Forge
            pick={pick}
            onPick={onPick}
            gender={gender}
            onGender={onGender}
            name={name}
            onName={onName}
          />
        )}
      </div>

      {loading ? null : (
        <OrnateButton onClick={onForge} disabled={busy || name.trim().length === 0}>
          {busy ? 'Đang tạo…' : 'Tạo nhân vật'}
        </OrnateButton>
      )}
    </Panel>
  );
}

function Forge({
  pick,
  onPick,
  gender,
  onGender,
  name,
  onName,
}: {
  pick: NetCharacter;
  onPick: (id: NetCharacter) => void;
  gender: Gender;
  onGender: (gender: Gender) => void;
  name: string;
  onName: (name: string) => void;
}) {
  const chosen = classOf(pick);

  return (
    <>
      <div className="rod-classes">
        {CLASSES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={pick === entry.id}
            className={`rod-class${pick === entry.id ? ' is-on' : ''}`}
            onClick={() => onPick(entry.id)}
          >
            <div
              className="rod-class__art"
              style={{ backgroundImage: `url('${entry.portrait}')` }}
            />
            <div className="rod-class__name">
              <strong>{entry.archetype}</strong>
              <em>
                {entry.name} · {entry.sect}
              </em>
            </div>
          </button>
        ))}
      </div>

      <div className="rod-note">{chosen.blurb}</div>

      <div className="rod-field">
        <span className="rod-label">Giới tính</span>
        <div className="rod-seg">
          <OrnateButton size="sm" on={gender === 'male'} onClick={() => onGender('male')}>
            Nam
          </OrnateButton>
          <OrnateButton size="sm" on={gender === 'female'} onClick={() => onGender('female')}>
            Nữ
          </OrnateButton>
        </div>
      </div>

      <label className="rod-field">
        <span className="rod-label">Đạo hiệu</span>
        <input
          className="rod-input"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Nhập đạo hiệu"
          maxLength={16}
          autoComplete="nickname"
        />
      </label>
    </>
  );
}

function Roster({
  avatars,
  avatarId,
  onAvatar,
  onDeleteAvatar,
  busy,
}: {
  avatars: readonly AvatarRecord[];
  avatarId: string;
  onAvatar: (row: AvatarRecord) => void;
  onDeleteAvatar: (row: AvatarRecord) => void;
  busy: boolean;
}) {
  if (avatars.length === 0) {
    return (
      <div className="rod-empty">
        Chưa có nhân vật nào được lưu. Chọn «Tạo nhân vật» để rèn một vị.
      </div>
    );
  }

  return (
    <>
      {avatars.map((row) => (
        <div key={row.id} className="rod-pick-wrap">
          <button
            type="button"
            aria-pressed={avatarId === row.id}
            className={`rod-pick${avatarId === row.id ? ' is-on' : ''}`}
            onClick={() => onAvatar(row)}
          >
            <strong>{row.name}</strong>
            <em>
              {classOf(row.character).archetype} · {CHARACTER_NAME[row.character]} · Luyện Khí{' '}
              {row.level}
            </em>
          </button>
          <button
            type="button"
            className="rod-pick__del"
            aria-label={`Xóa ${row.name}`}
            title="Xóa nhân vật"
            disabled={busy}
            onClick={() => onDeleteAvatar(row)}
          >
            Xóa
          </button>
        </div>
      ))}
    </>
  );
}
