import { GameBus, GameEvent } from '../game/events';
import { currentAccessToken, currentUser } from './auth';
import { getSupabase, newPlayerId } from './supabase';
import type { InventoryState } from '../game/systems/Inventory';
import { emptyInventory } from '../game/systems/Inventory';
import type { ZoneId } from '../game/zones';
import { DEFAULT_ZONE } from '../game/zones';
import { clampPlayerName, parseNetCharacter, type NetCharacter } from './types';
import { createAttributeState, type AttributeState } from '../game/systems/Attributes';
import { createSkillState, type SkillTreeState } from '../game/systems/SkillSystem';
import { createQuestState, type QuestState } from '../game/systems/QuestSystem';
import { createFarmState, ensureFarmPlots, DEFAULT_FARM_PLOTS, type FarmState } from '../game/systems/Farming';
import {
  createWorldState,
  mergeWorldState,
  migrateWorldState,
  type WorldState,
} from '../game/systems/WorldFlags';

export interface AvatarRecord {
  id: string;
  name: string;
  character: NetCharacter;
  level: number;
  xp: number;
  hp?: number;
  spiritualPower?: number;
  inventory: InventoryState;
  attributes?: AttributeState;
  skills?: SkillTreeState;
  quests?: QuestState;
  farm?: FarmState;
  trackedQuests?: string[];
  zone: ZoneId;
  x: number;
  y: number;
  spawn?: { zone: ZoneId; x: number; y: number };
  /** Zone ids whose huyết mạch has been visited. */
  warps?: ZoneId[];
  /**
   * Facts about the world rather than the character — chests opened, bosses
   * put down, one-shot triggers fired, zones seen. See `WorldFlags`.
   *
   * **Local only for now.** Every other field below maps to a named column on
   * the `avatars` row, and there is no column for this one; adding it is a
   * schema change and therefore the project owner's call, not a thing to do on
   * the way past. So it rides in `localStorage` — which `writeLocal` already
   * stores whole — and the row keeps ignoring it. `newer()` is where that
   * would have quietly bitten: it picks one record wholesale by `updatedAt`,
   * so a fresh remote row would have erased a world the device remembered.
   * It now merges this field instead.
   */
  world?: WorldState;
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
    world: createWorldState(),
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
    attributes: stamped.attributes ?? createAttributeState(),
    skills: stamped.skills ?? createSkillState(stamped.character),
    quest_state: stamped.quests ?? createQuestState(),
    farm_state: stamped.farm ?? createFarmState(DEFAULT_FARM_PLOTS),
    tracked_quests: stamped.trackedQuests ?? [],
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

/**
 * The later of two saves — except for the world, which is merged.
 *
 * The character is a snapshot and the newest one wins: taking the higher level
 * and the older bag would be worse than taking either whole. World facts are
 * not a snapshot, they are a log of things that happened, and none of them
 * un-happen. So a chest opened on this device stays opened even when the row
 * from the server is newer and has never heard of it.
 */
function newer(a: AvatarRecord, b: AvatarRecord): AvatarRecord {
  const at = Date.parse(a.updatedAt ?? '') || 0;
  const bt = Date.parse(b.updatedAt ?? '') || 0;
  const winner = at >= bt ? a : b;
  const world = mergeWorldState(
    a.world ?? createWorldState(),
    b.world ?? createWorldState(),
  );
  return { ...winner, world };
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

/**
 * Writes the local cache, never losing world state on the way.
 *
 * The merge is the whole point. `world` has no column on the remote row, so a
 * record built from one — which is what `listMyAvatars` returns and therefore
 * what the lobby hands to `pickAvatar` — always carries a *fresh* world. Before
 * this, selecting a character in the lobby wrote that blank straight over the
 * cache and erased every chest, flag and visit the device remembered. It was
 * not the autosave and it was not the load; it was the click that starts the
 * run, which is why it looked like the save had never worked at all.
 *
 * Merging here rather than at each caller makes the invariant hold by
 * construction: nothing that writes the cache can drop these facts. The price
 * is that world state cannot be *cleared* through this path — right for a log
 * of things that happened, and `deleteAvatar` still removes the key outright.
 */
function writeLocal(record: AvatarRecord): void {
  const cached = readRawLocal();
  const world =
    cached && cached.id === record.id
      ? mergeWorldState(
          migrateWorldState(cached.world),
          record.world ?? createWorldState(),
        )
      : (record.world ?? createWorldState());
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...record, world }));
}

/** The cached record as stored, without normalising — `writeLocal`'s own read. */
function readRawLocal(): (Record<string, unknown> & { id?: string }) | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalize(raw: Record<string, unknown>, id: string): AvatarRecord {
  const inventory =
    raw.inventory && typeof raw.inventory === 'object'
      ? ({ ...(raw.inventory as InventoryState) } as InventoryState)
      : emptyInventory();
  if (raw.coins != null) inventory.coins = Math.max(0, Number(raw.coins) || 0);
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
    attributes:
      raw.attributes && typeof raw.attributes === 'object'
        ? (raw.attributes as unknown as AttributeState)
        : undefined,
    skills:
      raw.skills && typeof raw.skills === 'object'
        ? (raw.skills as unknown as SkillTreeState)
        : undefined,
    quests:
      raw.quests && typeof raw.quests === 'object'
        ? (raw.quests as unknown as QuestState)
        : raw.quest_state && typeof raw.quest_state === 'object'
          ? (raw.quest_state as unknown as QuestState)
          : undefined,
    farm: (() => {
      const rawFarm =
        raw.farm && typeof raw.farm === 'object'
          ? (raw.farm as unknown as FarmState)
          : raw.farm_state && typeof raw.farm_state === 'object'
            ? (raw.farm_state as unknown as FarmState)
            : undefined;
      return rawFarm ? ensureFarmPlots(rawFarm, DEFAULT_FARM_PLOTS) : undefined;
    })(),
    trackedQuests: Array.isArray(raw.trackedQuests)
      ? raw.trackedQuests.filter((value): value is string => typeof value === 'string')
      : Array.isArray(raw.tracked_quests)
        ? raw.tracked_quests.filter((value): value is string => typeof value === 'string')
        : undefined,
    zone: (raw.zone as ZoneId) || DEFAULT_ZONE,
    x: Number(raw.x) || 1200,
    y: Number(raw.y) || 940,
    spawn: readSpawn(raw.spawn),
    warps: readWarps(raw.warps, (raw.zone as ZoneId) || DEFAULT_ZONE),
    // Absent on every save written before world state existed, which
    // `migrateWorldState` reads as a fresh world rather than as a failure.
    world: migrateWorldState(raw.world),
    roomId: typeof raw.roomId === 'string' ? raw.roomId : typeof raw.room_id === 'string' ? raw.room_id : undefined,
    userId: typeof raw.userId === 'string' ? raw.userId : typeof raw.user_id === 'string' ? raw.user_id : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : String(raw.updated_at ?? ''),
  });
}

const AVATAR_COLS =
  'id, name, character, level, xp, hp, spiritual_power, inventory, coins, attributes, skills, quest_state, farm_state, tracked_quests, zone, x, y, spawn, warps, room_id, user_id, updated_at';

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
  if (!/spawn|warps|room_id|attributes|skills|quest_state|farm_state|tracked_quests|PGRST204/i.test(first.error.message)) return { data: null, error: first.error.message };
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
  if (!/spawn|warps|room_id|user_id|attributes|skills|quest_state|farm_state|tracked_quests|PGRST204/i.test(first.error.message)) return first.error.message;
  const {
    spawn: _spawn,
    warps: _warps,
    room_id: _room,
    user_id: _user,
    attributes: _attributes,
    skills: _skills,
    quest_state: _quests,
    farm_state: _farm,
    tracked_quests: _tracked,
    ...legacy
  } = row;
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
