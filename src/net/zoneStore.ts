import { getSupabase } from './supabase';
import type { WorldSnap } from './types';

export async function saveZoneSnap(roomId: string, snap: WorldSnap): Promise<void> {
  const { error } = await getSupabase().from('zone_states').upsert(
    {
      room_id: roomId,
      zone: snap.zone,
      snap,
      host_id: snap.host,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id,zone' },
  );
  if (error) console.warn('[zone] save', error.message);
}

export async function loadZoneSnap(roomId: string, zone: string): Promise<WorldSnap | null> {
  const { data, error } = await getSupabase()
    .from('zone_states')
    .select('snap')
    .eq('room_id', roomId)
    .eq('zone', zone)
    .maybeSingle();
  if (error) {
    console.warn('[zone] load', error.message);
    return null;
  }
  const snap = data?.snap as WorldSnap | undefined;
  return snap?.zone ? snap : null;
}
