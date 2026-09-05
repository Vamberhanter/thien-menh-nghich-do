import { GameBus, GameEvent } from '../game/events';
import { currentAccessToken, currentUser } from './auth';
import { getSupabase, newPlayerId } from './supabase';
import type { InventoryState } from '../game/systems/Inventory';
import { emptyInventory } from '../game/systems/Inventory';
import type { ZoneId } from '../game/zones';
import { DEFAULT_ZONE } from '../game/zones';
import { clampPlayerName, parseNetCharacter, type NetCharacter } from './types';

export interface AvatarRecord {
  id: string;
  name: string;
  character: NetCharacter;
  level: number;
  xp: number;
  hp?: number;
  spiritualPower?: number;
  inventory: InventoryState;
  zone: ZoneId;
  x: number;
  y: number;
  spawn?: { zone: ZoneId; x: number; y: number };
  /** Zone ids whose huyết mạch has been visited. */
  warps?: ZoneId[];
  roomId?: string;
  userId?: string;
  updatedAt?: string;
}

export interface PersistResult {
  remote: boolean;
  error?: string;
}

const LOCAL_KEY = 'tmnd.avatar';

export function defaultAvatar(partial: Partial<AvatarRecord> = {}): AvatarRecord {
  return {
    id: newPlayerId(),
    name: 'Vô Danh',
    character: 'nhuyen',
    level: 1,
    xp: 0,
    inventory: emptyInventory(),
    zone: DEFAULT_ZONE,
    x: 1200,
    y: 940,
    warps: [DEFAULT_ZONE],
    ...partial,
  };
}

export async function loadAvatar(id: string): Promise<AvatarRecord | null> {
  const local = readLocal(id);
  try {
    const { data, error } = await loadAvatarRow(id);
    if (error) {
      console.warn('[avatar] load', error);
      return local;
    }
    if (!data) return local;
    const remote = normalize(data as Record<string, unknown>, id);
    if (!local) return remote;
    return newer(remote, local);
  } catch (err) {
    console.warn('[avatar] load failed', err);
    return local;
  }
}

export async function saveAvatar(record: AvatarRecord, keepalive = false): Promise<PersistResult> {
  const user = record.userId ? { id: record.userId } : await currentUser();
  const stamped = { ...record, userId: user?.id, updatedAt: new Date().toISOString() };
  writeLocal(stamped);
  const row = {
    id: stamped.id,
    name: stamped.name,
    character: stamped.character,
    level: stamped.level,
    xp: stamped.xp,
    hp: stamped.hp ?? null,
    spiritual_power: stamped.spiritualPower ?? null,
    inventory: stamped.inventory,
    zone: stamped.zone,
    x: Math.round(stamped.x),
    y: Math.round(stamped.y),
    spawn: stamped.spawn ?? null,
    warps: stamped.warps ?? [stamped.zone],
    room_id: stamped.roomId ?? null,
    user_id: stamped.userId ?? null,
    updated_at: stamped.updatedAt,
  };

  if (keepalive) {
    return saveKeepalive(row);
  }

  try {
    const error = await upsertAvatar(row);
    if (error) {
      console.warn('[avatar] save', error);
      return { remote: false, error };
    }
    return { remote: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'offline';
    console.warn('[avatar] save failed', message);
    return { remote: false, error: message };
  }
}

function saveKeepalive(row: Record<string, unknown>): PersistResult {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return { remote: false, error: 'missing env' };
    const token = currentAccessToken() ?? key;
    void fetch(`${url}/rest/v1/avatars?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
      keepalive: true,
    });
    return { remote: true };
  } catch (err) {
    return { remote: false, error: err instanceof Error ? err.message : 'offline' };
  }
}

function newer(a: AvatarRecord, b: AvatarRecord): AvatarRecord {
  const at = Date.parse(a.updatedAt ?? '') || 0;
  const bt = Date.parse(b.updatedAt ?? '') || 0;
  return at >= bt ? a : b;
}

function readLocal(id: string): AvatarRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.id !== id) return null;
    return normalize(parsed, id);
  } catch {
    return null;
  }
}

function writeLocal(record: AvatarRecord): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(record));
}

function normalize(raw: Record<string, unknown>, id: string): AvatarRecord {
  const inventory =
    raw.inventory && typeof raw.inventory === 'object'
      ? (raw.inventory as InventoryState)
      : emptyInventory();
  const spiritual =
    raw.spiritualPower ?? raw.spiritual_power;
  return defaultAvatar({
    id,
    name: String(raw.name ?? 'Vô Danh'),
    character: parseNetCharacter(raw.character),
    level: Number(raw.level) || 1,
    xp: Number(raw.xp) || 0,
    hp: raw.hp == null ? undefined : Number(raw.hp),
    spiritualPower: spiritual == null ? undefined : Number(spiritual),
    inventory,
    zone: (raw.zone as ZoneId) || DEFAULT_ZONE,
    x: Number(raw.x) || 1200,
    y: Number(raw.y) || 940,
    spawn: readSpawn(raw.spawn),
    warps: readWarps(raw.warps, (raw.zone as ZoneId) || DEFAULT_ZONE),
    roomId: typeof raw.roomId === 'string' ? raw.roomId : typeof raw.room_id === 'string' ? raw.room_id : undefined,
    userId: typeof raw.userId === 'string' ? raw.userId : typeof raw.user_id === 'string' ? raw.user_id : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : String(raw.updated_at ?? ''),
  });
}

const AVATAR_COLS =
  'id, name, character, level, xp, hp, spiritual_power, inventory, zone, x, y, spawn, warps, room_id, user_id, updated_at';

export async function listMyAvatars(): Promise<AvatarRecord[]> {
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await getSupabase()
    .from('avatars')
    .select(AVATAR_COLS)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const raw = row as Record<string, unknown>;
    return normalize(raw, String(raw.id));
  });
}

export async function createAvatar(input: { name: string; character: NetCharacter }): Promise<AvatarRecord> {
  const user = await currentUser();
  if (!user) throw new Error('Cần đăng nhập trước');
  const record = defaultAvatar({
    id: crypto.randomUUID(),
    name: clampPlayerName(input.name),
    character: input.character,
    userId: user.id,
  });
  const saved = await saveAvatar(record);
  if (!saved.remote) throw new Error(saved.error ?? 'Không tạo được nhân vật');
  pickAvatar(record);
  return record;
}

/** Deletes a hero owned by the signed-in user (remote + local cache). */
export async function deleteAvatar(id: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('Cần đăng nhập trước');
  const { error } = await getSupabase().from('avatars').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw new Error(error.message);

  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string };
      if (parsed.id === id) localStorage.removeItem(LOCAL_KEY);
    }
  } catch {
    /* ignore corrupt local cache */
  }
  if (localStorage.getItem('tmnd.pid') === id) localStorage.removeItem('tmnd.pid');

  try {
    const raw = localStorage.getItem('tmnd.gender');
    if (raw) {
      const map = JSON.parse(raw) as Record<string, unknown>;
      if (id in map) {
        delete map[id];
        localStorage.setItem('tmnd.gender', JSON.stringify(map));
      }
    }
  } catch {
    /* ignore */
  }
}

export function pickAvatar(record: AvatarRecord): void {
  localStorage.setItem('tmnd.pid', record.id);
  localStorage.setItem('tmnd.name', record.name);
  localStorage.setItem('tmnd.character', record.character);
  writeLocal(record);
  GameBus.emit(GameEvent.AvatarChosen, {
    id: record.id,
    character: record.character,
    name: record.name,
  });
}

async function loadAvatarRow(id: string): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  const first = await getSupabase().from('avatars').select(AVATAR_COLS).eq('id', id).maybeSingle();
  if (!first.error) return { data: (first.data as Record<string, unknown> | null) ?? null };
  if (!/spawn|warps|room_id|PGRST204/i.test(first.error.message)) return { data: null, error: first.error.message };
  const legacy = await getSupabase()
    .from('avatars')
    .select('id, name, character, level, xp, hp, spiritual_power, inventory, zone, x, y, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (legacy.error) return { data: null, error: legacy.error.message };
  return { data: (legacy.data as Record<string, unknown> | null) ?? null };
}

async function upsertAvatar(row: Record<string, unknown>): Promise<string | undefined> {
  const first = await getSupabase().from('avatars').upsert(row, { onConflict: 'id' });
  if (!first.error) return undefined;
  if (!/spawn|warps|room_id|user_id|PGRST204/i.test(first.error.message)) return first.error.message;
  const { spawn: _spawn, warps: _warps, room_id: _room, user_id: _user, ...legacy } = row;
  const retry = await getSupabase().from('avatars').upsert(legacy, { onConflict: 'id' });
  return retry.error?.message;
}

function readWarps(raw: unknown, fallback: ZoneId): ZoneId[] {
  const ids = Array.isArray(raw) ? raw.filter((id): id is ZoneId => typeof id === 'string') : [];
  if (!ids.includes(fallback)) ids.unshift(fallback);
  return [...new Set(ids)];
}

function readSpawn(raw: unknown): AvatarRecord['spawn'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const spawn = raw as Record<string, unknown>;
  const zone = spawn.zone;
  if (typeof zone !== 'string') return undefined;
  return {
    zone: zone as ZoneId,
    x: Number(spawn.x) || 1200,
    y: Number(spawn.y) || 940,
  };
}
