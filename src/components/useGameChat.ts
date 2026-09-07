import { useCallback, useEffect, useRef, useState } from 'react';
import { openGameChat, type GameChatHandle, type GameChatIdentity, type GameChatLine } from '../net/gameChat';

const KEEP = 120;

export interface GameChat {
  lines: readonly GameChatLine[];
  say: (text: string) => void;
  connected: boolean;
}

/** Holds the room chat open while the player is in a world session. */
export function useGameChat(identity: GameChatIdentity | null): GameChat {
  const [lines, setLines] = useState<GameChatLine[]>([]);
  const [connected, setConnected] = useState(false);
  const handle = useRef<GameChatHandle | null>(null);
  const latest = useRef(identity);
  latest.current = identity;

  const online = identity !== null;
  const worldKey = identity?.world ?? '';
  const id = identity?.id ?? '';
  const name = identity?.name ?? '';
  const character = identity?.character ?? 'nhuyen';

  useEffect(() => {
    if (!online) {
      setConnected(false);
      setLines([]);
      return undefined;
    }
    const seed = latest.current;
    if (!seed) return undefined;

    const channel = openGameChat(seed, {
      onLine: (line) => setLines((current) => [...current, line].slice(-KEEP)),
    });
    handle.current = channel;
    setConnected(true);

    return () => {
      handle.current = null;
      channel.close();
      setConnected(false);
    };
  }, [online, worldKey, id]);

  useEffect(() => {
    if (!online) return;
    handle.current?.update({ id, name, character, world: worldKey });
  }, [online, id, name, character, worldKey]);

  const say = useCallback((text: string) => {
    void handle.current?.say(text);
  }, []);

  return { lines, say, connected };
}
