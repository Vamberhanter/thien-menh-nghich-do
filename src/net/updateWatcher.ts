import { GameBus, GameEvent } from '../game/events';

const POLL_MS = 5 * 60 * 1000;

/**
 * Notices a new deploy while the tab is still open.
 *
 * The check is the hashed entry bundle in `index.html`: Vite renames it on every
 * build, so a changed name is the one signal that the server is now serving
 * something this tab is not running. The tab is never reloaded from under the
 * player — a reload mid-fight would cost them the fight — so this only ever
 * emits a toast and leaves the choice with them.
 */
export function startUpdateWatcher(): void {
  if (import.meta.env.DEV) return;

  let current: string | null = null;
  let announced = false;

  const entryOf = (html: string): string | null =>
    html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1] ?? null;

  const check = async (): Promise<void> => {
    if (announced || document.hidden) return;
    try {
      const response = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const entry = entryOf(await response.text());
      if (!entry) return;
      if (current === null) {
        current = entry;
        return;
      }
      if (entry === current) return;
      announced = true;
      GameBus.emit(GameEvent.Notice, 'Có bản cập nhật mới — tải lại trang để dùng.');
    } catch {
      // Offline or the host is mid-deploy; the next poll tries again.
    }
  };

  void check();
  window.setInterval(check, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
}
