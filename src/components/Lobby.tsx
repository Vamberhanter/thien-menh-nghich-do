import { useEffect, useState, type FormEvent } from 'react';
import { normalizeEmail, rememberedEmail, signIn, signOut, signUp, startAuth, subscribeAuth } from '../net/auth';
import { createAvatar, listMyAvatars, pickAvatar, type AvatarRecord } from '../net/avatarStore';
import { flushLeave, joinWorld, loadSavedJoin, peekSession, rememberJoin, setInputGated } from '../net/bind';
import { createRoom, listRooms, subscribeRooms, type RoomInfo } from '../net/rooms';
import { CHARACTER_NAME, type NetCharacter } from '../net/types';

const KITS: Array<{ id: NetCharacter; name: string; sect: string }> = [
  { id: 'nhuyen', name: 'Như Yên', sect: 'Băng Cung' },
  { id: 'lamuyen', name: 'Lâm Uyên', sect: 'Hư Vô Kiếm' },
  { id: 'huyetlang', name: 'Huyết Lang', sect: 'Tam Thủ Môn' },
];

const SECT: Record<NetCharacter, string> = {
  nhuyen: 'Băng Cung',
  lamuyen: 'Hư Vô Kiếm',
  huyetlang: 'Tam Thủ Môn',
};

/**
 * Auth → pick an owned avatar → pick a room.
 */
export function Lobby() {
  const saved = loadSavedJoin();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(() => rememberedEmail());
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [avatars, setAvatars] = useState<AvatarRecord[]>([]);
  const [avatarId, setAvatarId] = useState(localStorage.getItem('tmnd.pid') ?? '');
  const [newName, setNewName] = useState(saved.name);
  const [newKit, setNewKit] = useState<NetCharacter>(saved.character);

  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomId, setRoomId] = useState(saved.world);
  const [newRoom, setNewRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(() => peekSession() !== null);

  const selectedAvatar = avatars.find((row) => row.id === avatarId) ?? null;
  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;

  useEffect(() => {
    startAuth();
    const onUnload = () => {
      flushLeave();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => {
    return subscribeAuth((user) => {
      setAccount(user?.email ?? null);
      if (user?.email) setEmail(user.email);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!account || joined) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listMyAvatars();
        if (cancelled) return;
        setAvatars(rows);
        setAvatarId((current) => {
          if (rows.some((row) => row.id === current)) return current;
          return rows[0]?.id ?? '';
        });
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
    if (!account || joined) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await listRooms();
        if (cancelled) return;
        setRooms(next);
        setRoomId((current) => {
          if (next.some((room) => room.id === current)) return current;
          return next[0]?.id ?? current;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được phòng');
      }
    };
    void refresh();
    const stop = subscribeRooms(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [account, joined]);

  if (joined) return null;

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'register' ? await signUp(email, password) : await signIn(email, password);
      setAccount(user.email ?? email);
      setPassword('');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng xuất được');
    } finally {
      setBusy(false);
    }
  };

  const makeAvatar = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createAvatar({ name: newName, character: newKit });
      setAvatars((current) => [created, ...current.filter((row) => row.id !== created.id)]);
      setAvatarId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được nhân vật');
    } finally {
      setBusy(false);
    }
  };

  const chooseAvatar = (row: AvatarRecord) => {
    setAvatarId(row.id);
    pickAvatar(row);
  };

  const makeRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(newRoom);
      setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
      setRoomId(room.id);
      setNewRoom('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được phòng');
    } finally {
      setBusy(false);
    }
  };

  const enter = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedAvatar) {
      setError('Tạo hoặc chọn một nhân vật trước.');
      return;
    }
    if (!selectedRoom) {
      setError('Chọn một phòng trước khi nhập.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      pickAvatar(selectedAvatar);
      await joinWorld({
        name: selectedAvatar.name,
        character: selectedAvatar.character,
        world: selectedRoom.id,
        roomName: selectedRoom.name,
        avatarId: selectedAvatar.id,
      });
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không vào được phòng');
    } finally {
      setBusy(false);
    }
  };

  const playSolo = () => {
    if (!selectedAvatar) {
      setError('Tạo hoặc chọn một nhân vật trước.');
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

  if (!authReady) {
    return (
      <div className="lobby">
        <div className="lobby__panel">
          <div className="lobby__title">THIÊN MỆNH NGHỊCH ĐỒ</div>
          <div className="lobby__sub">Đang kiểm tra tài khoản…</div>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="lobby">
        <form className="lobby__panel" onSubmit={(e) => void authenticate(e)}>
          <div className="lobby__title">THIÊN MỆNH NGHỊCH ĐỒ</div>
          <div className="lobby__sub">Đăng nhập bằng email</div>

          <div className="lobby__tabs">
            <button
              type="button"
              className={`lobby__tab${mode === 'login' ? ' is-on' : ''}`}
              onClick={() => setMode('login')}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              className={`lobby__tab${mode === 'register' ? ' is-on' : ''}`}
              onClick={() => setMode('register')}
            >
              Đăng ký
            </button>
          </div>

          <label className="lobby__field">
            <span>Email</span>
            <input
              type="text"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail((current) => normalizeEmail(current))}
              placeholder=""
              autoComplete="email"
              required
            />
          </label>
          <label className="lobby__field">
            <span>Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </label>

          {error && <div className="lobby__error">{error}</div>}

          <button className="lobby__go" type="submit" disabled={busy}>
            {busy ? 'Đang xử lý…' : mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="lobby">
      <form className="lobby__panel" onSubmit={(e) => void enter(e)}>
        <div className="lobby__title">THIÊN MỆNH NGHỊCH ĐỒ</div>
        <div className="lobby__who">
          <span>{account}</span>
          <button type="button" onClick={() => void logout()} disabled={busy}>
            Đăng xuất
          </button>
        </div>

        <div className="lobby__field">
          <span>Nhân vật đã tạo</span>
          <div className="lobby__rooms">
            {avatars.length === 0 && <div className="lobby__empty">Chưa có nhân vật. Tạo một nhân vật bên dưới.</div>}
            {avatars.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`lobby__room${avatarId === row.id ? ' is-on' : ''}`}
                onClick={() => chooseAvatar(row)}
              >
                <strong>{row.name}</strong>
                <em>
                  {CHARACTER_NAME[row.character]} · {SECT[row.character]} · Luyện Khí {row.level}
                </em>
              </button>
            ))}
          </div>
        </div>

        <div className="lobby__field">
          <span>Tạo nhân vật mới</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Đạo hiệu"
            maxLength={16}
            autoComplete="nickname"
          />
        </div>
        <div className="lobby__picks">
          {KITS.map((pick) => (
            <button
              key={pick.id}
              type="button"
              className={`lobby__pick${newKit === pick.id ? ' is-on' : ''}`}
              onClick={() => setNewKit(pick.id)}
            >
              <strong>{pick.name}</strong>
              <em>{pick.sect}</em>
            </button>
          ))}
        </div>
        <button className="lobby__solo" type="button" onClick={() => void makeAvatar()} disabled={busy}>
          Tạo nhân vật
        </button>

        <div className="lobby__field">
          <span>Phòng</span>
          <div className="lobby__rooms">
            {rooms.length === 0 && <div className="lobby__empty">Đang tải phòng…</div>}
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className={`lobby__room${roomId === room.id ? ' is-on' : ''}`}
                onClick={() => setRoomId(room.id)}
              >
                <strong>{room.name}</strong>
                <em>
                  {room.players} tu tiên
                  {room.members[0] ? ` · ${room.members.map((m) => m.name).slice(0, 3).join(', ')}` : ''}
                </em>
              </button>
            ))}
          </div>
        </div>

        <div className="lobby__create">
          <input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder="Tên phòng mới"
            maxLength={24}
          />
          <button type="button" onClick={() => void makeRoom()} disabled={busy}>
            Tạo
          </button>
        </div>

        {error && <div className="lobby__error">{error}</div>}

        <button className="lobby__go" type="submit" disabled={busy || !selectedAvatar || !selectedRoom}>
          {busy
            ? 'Đang kết nối…'
            : selectedAvatar && selectedRoom
              ? `Vào phòng · ${selectedAvatar.name}`
              : 'Chọn nhân vật và phòng'}
        </button>
        <button className="lobby__solo" type="button" onClick={playSolo} disabled={busy || !selectedAvatar}>
          Chơi một mình
        </button>
      </form>
    </div>
  );
}
