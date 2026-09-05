import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY trong .env',
    );
  }

  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'tmnd.auth',
    },
    realtime: {
      params: { eventsPerSecond: 40 },
    },
  });
  return client;
}

/** Stable across tabs and reloads so progress stays on the same row. */
export function newPlayerId(): string {
  const existing = localStorage.getItem('tmnd.pid');
  if (existing) return existing;
  const legacy = sessionStorage.getItem('tmnd.pid');
  const id = legacy || crypto.randomUUID();
  localStorage.setItem('tmnd.pid', id);
  return id;
}
