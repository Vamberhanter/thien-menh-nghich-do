import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  normalizeEmail,
  rememberedEmail,
  signIn,
  signOut,
  signUp,
  startAuth,
  subscribeAuth,
  type GameUser,
} from '../net/auth';
import { createAvatar, deleteAvatar, listMyAvatars, pickAvatar, type AvatarRecord } from '../net/avatarStore';
import { flushLeave, joinWorld, loadSavedJoin, peekSession, rememberJoin, setInputGated } from '../net/bind';
import { GameBus, GameEvent } from '../game/events';
import type { LobbyIdentity } from '../net/lobbyChat';
import { createRoom, listRooms, subscribeRooms, type RoomInfo } from '../net/rooms';
import type { NetCharacter } from '../net/types';
import { AuthGate, type AuthMode } from './lobby/AuthGate';
import { CharacterCreationPanel, type CreationMode } from './lobby/CharacterCreationPanel';
import { classOf, writeGender, type Gender } from './lobby/classes';
import { HeaderBar, type LobbyView } from './lobby/HeaderBar';
import { JoinGamePanel } from './lobby/JoinGamePanel';
import { MainMenuPanel } from './lobby/MainMenuPanel';
import { StatsPanel } from './lobby/StatsPanel';
import { useLobbyChat } from './lobby/useLobbyChat';

/**
 * Realm of Darkness front end: sign in, forge or load a hero, pick a room.
 *
 * The three columns are all mounted at once on a wide screen and the current
 * `view` only decides which plaque is lit; narrow screens fall back to
 * swapping them, driven by the `data-view` attribute in CSS.
 */
export function Lobby() {
  const saved = loadSavedJoin();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState(() => rememberedEmail());
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState<GameUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [avatars, setAvatars] = useState<AvatarRecord[]>([]);
  const [avatarId, setAvatarId] = useState(localStorage.getItem('tmnd.pid') ?? '');
  const [newName, setNewName] = useState(saved.name);
  const [newKit, setNewKit] = useState<NetCharacter>(saved.character);
  const [gender, setGender] = useState<Gender>(() => classOf(saved.character).gender);

  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomId, setRoomId] = useState(saved.world);
  const [newRoom, setNewRoom] = useState('');

  const [view, setView] = useState<LobbyView>('join');
  const [creation, setCreation] = useState<CreationMode>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(() => peekSession() !== null);

  const selectedAvatar = avatars.find((row) => row.id === avatarId) ?? null;
  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;

  const identity = useMemo<LobbyIdentity | null>(() => {
    if (!account || joined) return null;
    return {
      id: selectedAvatar?.id ?? account.id,
      name: selectedAvatar?.name ?? account.email.split('@')[0],
      character: selectedAvatar?.character ?? newKit,
      room: selectedRoom?.id,
    };
  }, [account, joined, selectedAvatar, selectedRoom, newKit]);

  const chat = useLobbyChat(identity);

  const refreshRooms = useCallback(async () => {
    const next = await listRooms();
    setRooms(next);
    setRoomId((current) => (next.some((room) => room.id === current) ? current : next[0]?.id ?? current));
  }, []);

  useEffect(() => {
    startAuth();
    const onUnload = () => flushLeave();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // Re-open the lobby when the player leaves a room (or solo session).
  useEffect(() => {
    const onSession = (session: unknown) => {
      if (session == null) setJoined(false);
    };
    GameBus.on(GameEvent.NetSession, onSession);
    return () => {
      GameBus.off(GameEvent.NetSession, onSession);
    };
  }, []);

  useEffect(() => {
    return subscribeAuth((user) => {
      setAccount(user);
      if (user?.email) setEmail(user.email);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!account || joined) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listMyAvatars();
        if (cancelled) return;
        setAvatars(rows);
        setAvatarId((current) => (rows.some((row) => row.id === current) ? current : rows[0]?.id ?? ''));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được nhân vật');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [account, joined]);

  useEffect(() => {
    if (!account || joined) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        await refreshRooms();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được phòng');
      }
    };
    void refresh();
    const stop = subscribeRooms(() => void refresh());
    return () => {
      cancelled = true;
      stop();
    };
  }, [account, joined, refreshRooms]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'register' ? await signUp(email, password) : await signIn(email, password);
      setAccount(user);
      setPassword('');
      setView('join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng nhập được');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      setAccount(null);
      setAvatars([]);
      setAvatarId('');
      setView('menu');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng xuất được');
    } finally {
      setBusy(false);
    }
  };

  const pickClass = (id: NetCharacter) => {
    setNewKit(id);
    setGender(classOf(id).gender);
  };

  const forgeAvatar = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createAvatar({ name: newName, character: newKit });
      writeGender(created.id, gender);
      setAvatars((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      setAvatarId(created.id);
      setCreation('load');
      // Back to room flow: room is already chosen (or will be), character is ready.
      setView('join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được nhân vật');
    } finally {
      setBusy(false);
    }
  };

  const chooseAvatar = (row: AvatarRecord, enterJoin = true) => {
    setAvatarId(row.id);
    pickAvatar(row);
    if (enterJoin) setView('join');
  };

  const removeAvatar = async (row: AvatarRecord) => {
    if (!window.confirm(`Xóa nhân vật «${row.name}»? Không hoàn tác được.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAvatar(row.id);
      const next = avatars.filter((item) => item.id !== row.id);
      setAvatars(next);
      if (avatarId === row.id) {
        const fall = next[0];
        if (fall) {
          setAvatarId(fall.id);
          pickAvatar(fall);
        } else {
          setAvatarId('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được nhân vật');
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = async (room: RoomInfo) => {
    if (!selectedAvatar) {
      setError('Chọn nhân vật của bạn trước khi vào phòng.');
      setView('join');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      pickAvatar(selectedAvatar);
      await joinWorld({
        name: selectedAvatar.name,
        character: selectedAvatar.character,
        world: room.id,
        roomName: room.name,
        avatarId: selectedAvatar.id,
      });
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không vào được phòng');
    } finally {
      setBusy(false);
    }
  };

  const enterSelected = () => {
    if (!selectedRoom) {
      setError('Bước 1: chọn một phòng trong danh sách.');
      setView('join');
      return;
    }
    if (!selectedAvatar) {
      setError('Bước 2: chọn nhân vật của bạn, rồi bấm Vào.');
      setView('join');
      return;
    }
    void enterRoom(selectedRoom);
  };

  /** Creates a room and selects it — player still picks a character, then enters. */
  const makeRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(newRoom);
      setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
      setRoomId(room.id);
      setNewRoom('');
      setView('join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được phòng');
    } finally {
      setBusy(false);
    }
  };

  const playSolo = () => {
    if (!selectedAvatar) {
      setError('Tạo hoặc chọn một nhân vật trước.');
      setView('create');
      return;
    }
    pickAvatar(selectedAvatar);
    rememberJoin({
      name: selectedAvatar.name,
      character: selectedAvatar.character,
      world: roomId,
      roomName: selectedRoom?.name,
    });
    setInputGated(false);
    setJoined(true);
  };

  if (joined) return null;

  if (!authReady) {
    return (
      <div className="rod rod--gate">
        <div className="rod-auth rod-auth--loading">
          <div className="rod-auth__panel rod-frame">
            <div className="rod-auth__crest rod-auth__crest--solo" />
            <div className="rod-gate__title">Thiên Mệnh Nghịch Đồ</div>
            <div className="rod-gate__sub">Đang kiểm tra tài khoản…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <AuthGate
        mode={mode}
        onMode={setMode}
        email={email}
        onEmail={setEmail}
        onEmailBlur={() => setEmail((current) => normalizeEmail(current))}
        password={password}
        onPassword={setPassword}
        onSubmit={(event) => void authenticate(event)}
        busy={busy}
        error={error}
      />
    );
  }

  const statSource =
    creation === 'create' || !selectedAvatar
      ? { character: newKit, level: 1, xp: 0 }
      : { character: selectedAvatar.character, level: selectedAvatar.level, xp: selectedAvatar.xp };

  return (
    <div className="rod">
      <HeaderBar view={view} onView={setView} account={account.email} ping={chat.ping} />

      {/* Banner rather than in-panel, so it survives a hidden column. */}
      {error ? <div className="rod-error rod__alert">{error}</div> : null}

      <div className="rod__body" data-view={view}>
        <div className="rod-col rod-col--side rod-col--create">
          <CharacterCreationPanel
            mode={creation}
            focused={view === 'create'}
            pick={newKit}
            onPick={pickClass}
            gender={gender}
            onGender={setGender}
            name={newName}
            onName={setNewName}
            onForge={() => void forgeAvatar()}
            avatars={avatars}
            avatarId={avatarId}
            onAvatar={chooseAvatar}
            onDeleteAvatar={(row) => void removeAvatar(row)}
            busy={busy}
          />
          <StatsPanel
            character={statSource.character}
            level={statSource.level}
            xp={statSource.xp}
          />
        </div>

        <div className="rod-col rod-col--menu">
          <MainMenuPanel
            view={view}
            mode={creation}
            busy={busy}
            canSolo={Boolean(selectedAvatar)}
            avatars={avatars}
            avatarId={avatarId}
            roomName={selectedRoom?.name ?? null}
            onAvatar={chooseAvatar}
            onDeleteAvatar={(row) => void removeAvatar(row)}
            onNewCharacter={() => {
              setCreation('create');
              setView('create');
            }}
            onJoinGame={() => setView('join')}
            onLoadGame={() => {
              setCreation('load');
              setView('create');
            }}
            onExit={() => void logout()}
            onSolo={playSolo}
          />
        </div>

        <div className="rod-col rod-col--side rod-col--join">
          <JoinGamePanel
            focused={view === 'join'}
            rooms={rooms}
            roomId={roomId}
            onRoom={setRoomId}
            newRoom={newRoom}
            onNewRoom={setNewRoom}
            onCreateRoom={() => void makeRoom()}
            onJoin={enterSelected}
            onCreateCharacter={() => {
              setCreation('create');
              setView('create');
            }}
            avatars={avatars}
            avatarId={avatarId}
            onAvatar={(row) => chooseAvatar(row, false)}
            onDeleteAvatar={(row) => void removeAvatar(row)}
            chat={chat}
            meId={identity?.id ?? ''}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
}
