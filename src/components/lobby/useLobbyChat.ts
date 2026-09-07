import { useCallback, useEffect, useRef, useState } from 'react';
import {
  measurePing,
  openLobbyChannel,
  type ChatLine,
  type LobbyHandle,
  type LobbyIdentity,
  type LobbyUser,
} from '../../net/lobbyChat';

/** Broadcast chat is not persisted, so the log only keeps a session's worth. */
const KEEP = 120;
const PING_MS = 15_000;

export interface LobbyChat {
  lines: readonly ChatLine[];
  users: readonly LobbyUser[];
  ping: number | null;
  say: (text: string, to?: string) => void;
}

/**
 * Holds the lobby channel open for as long as the player is signed in and out
 * of the world. The channel is opened once; later avatar or room changes are
 * pushed through `update` so switching hero does not drop the chat log.
 */
export function useLobbyChat(identity: LobbyIdentity | null): LobbyChat {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [users, setUsers] = useState<LobbyUser[]>([]);
  const [ping, setPing] = useState<number | null>(null);

  const handle = useRef<LobbyHandle | null>(null);
  const latest = useRef(identity);
  latest.current = identity;

  const online = identity !== null;
  const { id, name, character, room } = identity ?? { id: '', name: '', character: 'nhuyen' as const, room: undefined };

  useEffect(() => {
    if (!online) return undefined;
    const seed = latest.current;
    if (!seed) return undefined;

    const channel = openLobbyChannel(seed, {
      onLine: (line) => setLines((current) => [...current, line].slice(-KEEP)),
      onUsers: (next) => setUsers(next),
    });
    handle.current = channel;

    return () => {
      handle.current = null;
      channel.close();
      setUsers([]);
    };
  }, [online]);

  useEffect(() => {
    if (!online) return;
    handle.current?.update({ id, name, character, room });
  }, [online, id, name, character, room]);

  useEffect(() => {
    if (!online) return undefined;
    let cancelled = false;
    const tick = async () => {
      const value = await measurePing();
      if (!cancelled) setPing(value);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), PING_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);

  const say = useCallback((text: string, to?: string) => {
    void handle.current?.say(text, to);
  }, []);

  return { lines, users, ping, say };
}
