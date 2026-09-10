import { getSupabase } from './supabase';

/**
 * `MapEditor`'s save/load, same shape as `zoneStore.ts` — one row per map id,
 * the payload an opaque JSON blob neither side needs to know the shape of
 * beyond "whatever `MapEditor` last wrote there".
 */
/** `null` on success — the message on failure, so a caller can actually tell the difference instead of assuming a write that never landed. */
export async function saveMapDraft(id: string, data: unknown): Promise<string | null> {
  const { error } = await getSupabase()
    .from('map_drafts')
    .upsert({ id, data, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[map-draft] save', error.message);
  return error?.message ?? null;
}

export async function loadMapDraft<T = unknown>(id: string): Promise<T | null> {
  const { data, error } = await getSupabase().from('map_drafts').select('data').eq('id', id).maybeSingle();
  if (error) {
    console.warn('[map-draft] load', error.message);
    return null;
  }
  return (data?.data as T | undefined) ?? null;
}

export interface MapDraftSummary {
  id: string;
  name: string;
  updatedAt: string;
}

/** Every saved map, newest first — for the "Mở map đã lưu" list rather than a blind id field. */
export async function listMapDrafts(): Promise<MapDraftSummary[]> {
  const { data, error } = await getSupabase()
    .from('map_drafts')
    .select('id, data, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('[map-draft] list', error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: ((row.data as { name?: string } | null)?.name as string | undefined) ?? row.id,
    updatedAt: row.updated_at as string,
  }));
}
