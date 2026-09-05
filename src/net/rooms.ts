import { getSupabase } from './supabase';
import { slugifyWorld, type NetCharacter } from './types';

const STALE_MS = 45_000;

export interface RoomMember {
  id: string;
  name: string;
  character: NetCharacter;
}

export interface RoomInfo {
  id: string;
  name: string;
  players: number;
  members: RoomMember[];
  updatedAt: string;
}

export interface RoomPresence {
  roomId: string;
  playerId: string;
  name: string;
  character: NetCharacter;
}

type RoomRow = {
  id: string;
  name: string;
  updated_at?: string;
  room_members?: Array<{
    player_id: string;
    name: string;
    character: string;
    last_seen: string;
  }>;
};

export async function listRooms(): Promise<RoomInfo[]> {
  const { data, error } = await getSupabase()
    .from('rooms')
    .select('id, name, updated_at, room_members(player_id, name, character, last_seen)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(explainRoomError(error.message));
  return ((data ?? []) as RoomRow[]).map(normalizeRoom);
}

export async function createRoom(rawName: string): Promise<RoomInfo> {
  const name = rawName.replace(/\s+/g, ' ').trim().slice(0, 24) || 'Phòng mới';
  let id = slugifyWorld(name);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await getSupabase()
      .from('rooms')
      .insert({ id, name })
      .select('id, name, updated_at')
      .maybeSingle();

    if (!error && data) {
      return { id: data.id, name: data.name, players: 0, members: [], updatedAt: data.updated_at ?? '' };
    }

    if (error?.code === '23505' || /duplicate|unique/i.test(error?.message ?? '')) {
      const existing = await getRoom(id);
      if (existing) return existing;
      id = `${slugifyWorld(name)}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }

    throw new Error(explainRoomError(error?.message ?? 'Không tạo được phòng'));
  }

  throw new Error('Không tạo được phòng');
}

export async function getRoom(id: string): Promise<RoomInfo | null> {
  const { data, error } = await getSupabase()
    .from('rooms')
    .select('id, name, updated_at, room_members(player_id, name, character, last_seen)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(explainRoomError(error.message));
  return data ? normalizeRoom(data as RoomRow) : null;
}

export async function enterRoom(presence: RoomPresence): Promise<void> {
  const { error } = await getSupabase().from('room_members').upsert(
    {
      room_id: presence.roomId,
      player_id: presence.playerId,
      name: presence.name,
      character: presence.character,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'room_id,player_id' },
  );
  if (error) throw new Error(explainRoomError(error.message));
  await getSupabase().from('rooms').update({ updated_at: new Date().toISOString() }).eq('id', presence.roomId);
}

export async function leaveRoom(roomId: string, playerId: string, keepalive = false): Promise<void> {
  if (keepalive) {
    leaveKeepalive(roomId, playerId);
    return;
  }
  await getSupabase().from('room_members').delete().eq('room_id', roomId).eq('player_id', playerId);
}

export function subscribeRooms(onChange: () => void): () => void {
  let timer = 0;
  const bump = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 280);
  };

  const channel = getSupabase()
    .channel('tmnd-lobby-rooms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, bump)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, bump)
    .subscribe();

  return () => {
    window.clearTimeout(timer);
    void getSupabase().removeChannel(channel);
  };
}

function normalizeRoom(row: RoomRow): RoomInfo {
  const cutoff = Date.now() - STALE_MS;
  const members = (row.room_members ?? [])
    .filter((member) => Date.parse(member.last_seen) >= cutoff)
    .map((member) => ({
      id: member.player_id,
      name: member.name,
      character: member.character as NetCharacter,
    }));
  return {
    id: row.id,
    name: row.name,
    players: members.length,
    members,
    updatedAt: row.updated_at ?? '',
  };
}

function leaveKeepalive(roomId: string, playerId: string): void {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  void fetch(
    `${url}/rest/v1/room_members?room_id=eq.${encodeURIComponent(roomId)}&player_id=eq.${encodeURIComponent(playerId)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      keepalive: true,
    },
  );
}

export function explainRoomError(message: string): string {
  if (/does not exist|PGRST205|schema cache/i.test(message)) {
    return 'Chưa có bảng phòng trên Supabase. Chạy supabase/migrations/002_rooms.sql trong SQL Editor.';
  }
  return message;
}
