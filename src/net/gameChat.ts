import { getSupabase } from './supabase';
import { parseNetCharacter, type NetCharacter } from './types';

/**
 * In-world public chat. Same broadcast pattern as lobby chat — nothing is
 * stored server-side. Scoped per room (`world` slug) so rooms stay separate.
 */

const MAX_TEXT = 240;

export interface GameChatLine {
  id: string;
  fromId: string;
  from: string;
  text: string;
  at: number;
}

export interface GameChatIdentity {
  id: string;
  name: string;
  character: NetCharacter;
  world: string;
}

export interface GameChatHandle {
  say(text: string): Promise<void>;
  update(identity: GameChatIdentity): void;
  close(): void;
}

function channelName(world: string): string {
  const slug = world.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48) || 'thien-menh';
  return `tmnd-game:${slug}`;
}

export function openGameChat(
  identity: GameChatIdentity,
  handlers: { onLine: (line: GameChatLine) => void },
): GameChatHandle {
  let me = identity;
  let live = false;

  const channel = getSupabase().channel(channelName(identity.world), {
    config: {
      broadcast: { self: true },
      presence: { key: identity.id },
    },
  });

  channel.on('broadcast', { event: 'say' }, ({ payload }) => {
    const line = readLine(payload);
    if (line) handlers.onLine(line);
  });

  void channel.subscribe((status) => {
    live = status === 'SUBSCRIBED';
    if (live) void channel.track(presenceOf(me));
  });

  return {
    async say(text) {
      const body = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!body || !live) return;
      await channel.send({
        type: 'broadcast',
        event: 'say',
        payload: {
          id: crypto.randomUUID(),
          fromId: me.id,
          from: me.name,
          text: body,
          at: Date.now(),
        } satisfies GameChatLine,
      });
    },
    update(next) {
      me = next;
      if (live) void channel.track(presenceOf(me));
    },
    close() {
      live = false;
      void getSupabase().removeChannel(channel);
    },
  };
}

function presenceOf(identity: GameChatIdentity) {
  return {
    id: identity.id,
    name: identity.name,
    character: identity.character,
  };
}

function readLine(raw: unknown): GameChatLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const text = typeof row.text === 'string' ? row.text.slice(0, MAX_TEXT) : '';
  const fromId = typeof row.fromId === 'string' ? row.fromId : '';
  if (!text || !fromId) return null;
  return {
    id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
    fromId,
    from: typeof row.from === 'string' ? row.from.slice(0, 24) : 'Ẩn danh',
    text,
    at: typeof row.at === 'number' ? row.at : Date.now(),
  };
}

/** Soft type guard so presence payloads stay usable if we show online later. */
export function readCharacter(raw: unknown): NetCharacter {
  return parseNetCharacter(raw);
}
