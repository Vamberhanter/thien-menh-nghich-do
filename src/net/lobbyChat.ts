import { getSupabase } from './supabase';
import { parseNetCharacter, type NetCharacter } from './types';

/**
 * Lobby chat and the who-is-here list.
 *
 * Both ride one Realtime channel: messages are broadcasts (nothing is stored,
 * so no table or migration is needed) and the online list is the channel's
 * presence state. Whispers are ordinary broadcasts carrying a `to` id, which
 * every client filters — fine for a lobby, not a privacy guarantee.
 */

const CHANNEL = 'tmnd-lobby';
const MAX_TEXT = 240;

export interface ChatLine {
  id: string;
  fromId: string;
  from: string;
  /** Present on a whisper: the avatar id it was aimed at. */
  to?: string;
  text: string;
  at: number;
}

export interface LobbyUser {
  id: string;
  name: string;
  character: NetCharacter;
  /** Room the player is sitting in, when they have picked one. */
  room?: string;
}

export interface LobbyIdentity {
  id: string;
  name: string;
  character: NetCharacter;
  room?: string;
}

export interface LobbyHandle {
  say(text: string, to?: string): Promise<void>;
  /** Re-publishes presence after the player switches avatar or room. */
  update(identity: LobbyIdentity): void;
  close(): void;
}

export function openLobbyChannel(
  identity: LobbyIdentity,
  handlers: { onLine: (line: ChatLine) => void; onUsers: (users: LobbyUser[]) => void },
): LobbyHandle {
  let me = identity;
  let live = false;

  const channel = getSupabase().channel(CHANNEL, {
    config: {
      // `self: true` so the sender sees their own line without a local echo
      // path that could drift from what everyone else receives.
      broadcast: { self: true },
      presence: { key: identity.id },
    },
  });

  channel.on('broadcast', { event: 'say' }, ({ payload }) => {
    const line = readLine(payload);
    if (line) handlers.onLine(line);
  });

  channel.on('presence', { event: 'sync' }, () => {
    handlers.onUsers(readUsers(channel.presenceState()));
  });

  void channel.subscribe((status) => {
    live = status === 'SUBSCRIBED';
    if (live) void channel.track(me);
  });

  return {
    async say(text, to) {
      const body = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!body || !live) return;
      await channel.send({
        type: 'broadcast',
        event: 'say',
        payload: {
          id: crypto.randomUUID(),
          fromId: me.id,
          from: me.name,
          to,
          text: body,
          at: Date.now(),
        } satisfies ChatLine,
      });
    },
    update(next) {
      me = next;
      if (live) void channel.track(me);
    },
    close() {
      live = false;
      void getSupabase().removeChannel(channel);
    },
  };
}

/** Round trip to the Supabase edge, shown as the PING column. */
export async function measurePing(): Promise<number | null> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const started = performance.now();
  try {
    await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key },
      cache: 'no-store',
    });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

function readLine(raw: unknown): ChatLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const text = typeof row.text === 'string' ? row.text.slice(0, MAX_TEXT) : '';
  const fromId = typeof row.fromId === 'string' ? row.fromId : '';
  if (!text || !fromId) return null;
  return {
    id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
    fromId,
    from: typeof row.from === 'string' && row.from ? row.from : 'Vô Danh',
    to: typeof row.to === 'string' && row.to ? row.to : undefined,
    text,
    at: Number(row.at) || Date.now(),
  };
}

function readUsers(state: Record<string, unknown[]>): LobbyUser[] {
  const seen = new Map<string, LobbyUser>();
  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        id,
        name: typeof row.name === 'string' && row.name ? row.name : 'Vô Danh',
        character: parseNetCharacter(row.character),
        room: typeof row.room === 'string' && row.room ? row.room : undefined,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
