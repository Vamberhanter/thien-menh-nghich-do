import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AvatarRecord } from '../../net/avatarStore';
import type { RoomInfo } from '../../net/rooms';
import { CHARACTER_NAME } from '../../net/types';
import { classOf } from './classes';
import { OrnateButton, Panel, Rule } from './parts';
import type { LobbyChat } from './useLobbyChat';

type ChatTab = 'chat' | 'whispers';

/**
 * Linear join flow: 1) pick a room → 2) pick your character → 3) enter.
 * Occupants of the selected room are shown so you know who is already inside.
 */
export function JoinGamePanel({
  focused,
  rooms,
  roomId,
  onRoom,
  newRoom,
  onNewRoom,
  onCreateRoom,
  onJoin,
  onCreateCharacter,
  avatars,
  avatarId,
  onAvatar,
  onDeleteAvatar,
  chat,
  meId,
  busy,
}: {
  focused: boolean;
  rooms: readonly RoomInfo[];
  roomId: string;
  onRoom: (id: string) => void;
  newRoom: string;
  onNewRoom: (name: string) => void;
  /** Creates a room only (does not enter) so the player still picks a character. */
  onCreateRoom: () => void;
  onJoin: () => void;
  onCreateCharacter: () => void;
  avatars: readonly AvatarRecord[];
  avatarId: string;
  onAvatar: (row: AvatarRecord) => void;
  onDeleteAvatar: (row: AvatarRecord) => void;
  chat: LobbyChat;
  meId: string;
  busy: boolean;
}) {
  const [showChat, setShowChat] = useState(false);
  const [tab, setTab] = useState<ChatTab>('chat');
  const [draft, setDraft] = useState('');
  const [whisperTo, setWhisperTo] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;
  const selectedAvatar = avatars.find((row) => row.id === avatarId) ?? null;
  const hasRoom = Boolean(selectedRoom);
  const hasAvatar = Boolean(selectedAvatar);
  const ready = hasRoom && hasAvatar;

  const joinLabel = busy
    ? 'Đang vào…'
    : !hasRoom
      ? '① Chọn phòng trước'
      : !hasAvatar
        ? '② Chọn nhân vật bên dưới'
        : `③ Vào «${selectedRoom!.name}»`;

  const nameOf = useMemo(() => {
    const map = new Map(chat.users.map((user) => [user.id, user.name]));
    return (id: string) => map.get(id) ?? 'ai đó';
  }, [chat.users]);

  const shown = chat.lines.filter((line) =>
    tab === 'chat' ? !line.to : Boolean(line.to) && (line.to === meId || line.fromId === meId),
  );

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [shown.length, tab]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setNotice('');

    const slash = /^\/w\s+(\S+)\s+([\s\S]+)$/.exec(text);
    if (slash) {
      const target = chat.users.find((user) => user.name.toLowerCase() === slash[1].toLowerCase());
      if (!target) {
        setNotice(`Không thấy ai tên “${slash[1]}” trong sảnh.`);
        return;
      }
      setWhisperTo({ id: target.id, name: target.name });
      setTab('whispers');
      chat.say(slash[2], target.id);
    } else if (tab === 'whispers') {
      if (!whisperTo) {
        setNotice('Chọn một người ở cột Online, hoặc gõ /w <tên> <lời nhắn>.');
        return;
      }
      chat.say(text, whisperTo.id);
    } else {
      chat.say(text);
    }
    setDraft('');
  };

  return (
    <Panel title="Vào phòng" sub="Phòng → Nhân vật → Vào" state={focused ? 'focus' : 'idle'} grow>
      <ol className="rod-guide">
        <li className={hasRoom ? 'is-done' : 'is-now'}>
          <b>1</b>
          <span>
            {hasRoom ? (
              <>
                Phòng: <em>{selectedRoom!.name}</em>
              </>
            ) : (
              'Chọn phòng'
            )}
          </span>
        </li>
        <li className={!hasRoom ? '' : hasAvatar ? 'is-done' : 'is-now'}>
          <b>2</b>
          <span>
            {hasAvatar ? (
              <>
                Nhân vật: <em>{selectedAvatar!.name}</em>
              </>
            ) : (
              'Chọn nhân vật của bạn'
            )}
          </span>
        </li>
        <li className={ready ? 'is-now' : ''}>
          <b>3</b>
          <span>Vào phòng</span>
        </li>
      </ol>

      {/* —— Bước 1: phòng —— */}
      <div className="rod-label">① Danh sách phòng</div>
      <div className="rod-table">
        <div className="rod-table__row rod-table__row--slim rod-table__head">
          <div>Tên phòng</div>
          <div>Người</div>
        </div>
        <div className="rod-table__body">
          {rooms.length === 0 ? (
            <div className="rod-empty">Chưa có phòng. Tạo một phòng bên dưới.</div>
          ) : (
            rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                aria-pressed={roomId === room.id}
                className={`rod-room rod-table__row rod-table__row--slim${
                  roomId === room.id ? ' is-on' : ''
                }`}
                onClick={() => onRoom(room.id)}
                title={
                  room.members.length > 0
                    ? room.members.map((m) => `${m.name} (${CHARACTER_NAME[m.character]})`).join(', ')
                    : 'Phòng trống'
                }
              >
                <strong>{room.name}</strong>
                <span>{room.players}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rod-create-row">
        <input
          className="rod-input"
          value={newRoom}
          onChange={(event) => onNewRoom(event.target.value)}
          placeholder="Tên phòng mới"
          maxLength={24}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!busy) onCreateRoom();
            }
          }}
        />
        <OrnateButton size="sm" onClick={onCreateRoom} disabled={busy}>
          Tạo phòng
        </OrnateButton>
      </div>

      {/* Ai đang trong phòng đã chọn */}
      {hasRoom ? (
        <div className="rod-room-peek">
          <div className="rod-label">
            Trong «{selectedRoom!.name}» · {selectedRoom!.players} người
          </div>
          {selectedRoom!.members.length === 0 ? (
            <div className="rod-empty">Phòng trống — bạn sẽ là người đầu tiên.</div>
          ) : (
            <div className="rod-room-peek__list">
              {selectedRoom!.members.map((member) => {
                const kit = classOf(member.character);
                return (
                  <div key={member.id} className="rod-occupant" title={`${member.name} · ${kit.sect}`}>
                    <span
                      className="rod-occupant__art"
                      style={{ backgroundImage: `url('${kit.portrait}')` }}
                    />
                    <span className="rod-occupant__meta">
                      <strong>{member.name}</strong>
                      <em>
                        {kit.archetype} · {CHARACTER_NAME[member.character]}
                      </em>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* —— Bước 2: nhân vật của bạn —— */}
      <div className="rod-label">② Nhân vật của bạn</div>
      {avatars.length === 0 ? (
        <div className="rod-empty rod-empty--action">
          <span>Chưa có nhân vật.</span>
          <OrnateButton size="sm" onClick={onCreateCharacter}>
            Tạo nhân vật
          </OrnateButton>
        </div>
      ) : (
        <div className="rod-pick-row">
          {avatars.map((row) => {
            const kit = classOf(row.character);
            const on = row.id === avatarId;
            return (
              <div key={row.id} className="rod-hero-wrap">
                <button
                  type="button"
                  aria-pressed={on}
                  className={`rod-hero rod-hero--sm${on ? ' is-on' : ''}`}
                  onClick={() => onAvatar(row)}
                  disabled={!hasRoom}
                  title={
                    hasRoom
                      ? `${row.name} · ${kit.archetype}`
                      : 'Chọn phòng trước, rồi chọn nhân vật'
                  }
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
          <button type="button" className="rod-hero rod-hero--add" onClick={onCreateCharacter}>
            <span>+ Tạo mới</span>
          </button>
        </div>
      )}

      {/* —— Bước 3: vào —— */}
      <OrnateButton size="lg" onClick={onJoin} disabled={busy || !ready}>
        {joinLabel}
      </OrnateButton>

      <Rule />

      <button type="button" className="rod-chat-toggle" onClick={() => setShowChat((v) => !v)}>
        {showChat ? 'Ẩn trò chuyện' : `Trò chuyện · ${chat.users.length} online`}
        {chat.ping != null ? ` · ${chat.ping}ms` : ''}
      </button>

      {showChat ? (
        <div className="rod-split">
          <div className="rod-chat">
            <div className="rod-chat__tabs">
              <OrnateButton size="sm" on={tab === 'chat'} onClick={() => setTab('chat')}>
                Chung
              </OrnateButton>
              <OrnateButton size="sm" on={tab === 'whispers'} onClick={() => setTab('whispers')}>
                Riêng
              </OrnateButton>
            </div>

            <div className="rod-chat__log" ref={logRef}>
              {shown.length === 0 ? (
                <div className="rod-chat__line is-system">
                  {tab === 'chat' ? 'Sảnh đang im lặng.' : 'Chưa có lời nhắn riêng nào.'}
                </div>
              ) : (
                shown.map((line) => (
                  <div
                    key={line.id}
                    className={`rod-chat__line${line.fromId === meId ? ' is-self' : ''}${
                      line.to ? ' is-whisper' : ''
                    }`}
                  >
                    <b>{line.from}</b>
                    {line.to ? (
                      <>
                        {' '}
                        → <b>{nameOf(line.to)}</b>
                      </>
                    ) : null}{' '}
                    {line.text}
                  </div>
                ))
              )}
            </div>

            <form className="rod-field" onSubmit={send}>
              <input
                className="rod-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={tab === 'chat' ? 'Gõ lời nhắn…' : 'Lời nhắn riêng'}
                maxLength={240}
              />
            </form>

            {notice ? <div className="rod-note">{notice}</div> : null}
          </div>

          <div className="rod-side rod-side--users">
            <span className="rod-label">Online</span>
            <div className="rod-users">
              {chat.users.length === 0 ? (
                <div className="rod-empty">Trống</div>
              ) : (
                chat.users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`rod-user${user.id === meId ? ' is-self' : ''}`}
                    title={`${classOf(user.character).archetype} · ${CHARACTER_NAME[user.character]}`}
                    onClick={() => {
                      if (user.id === meId) return;
                      setWhisperTo({ id: user.id, name: user.name });
                      setTab('whispers');
                    }}
                  >
                    <span className="rod-user__name">{user.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
