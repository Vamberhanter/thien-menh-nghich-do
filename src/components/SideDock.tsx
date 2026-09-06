import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PATCH_NOTES } from '../data/patchNotes';
import { isInputGated, peekSession, setUiTyping } from '../net/bind';
import type { GameChatIdentity } from '../net/gameChat';
import { useGameChat } from './useGameChat';

type DockTab = 'news' | 'chat';

declare const __APP_BUILD_ID__: string;

function buildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__ ? __APP_BUILD_ID__ : 'dev';
  } catch {
    return 'dev';
  }
}

function formatTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Right-edge dock: patch notes + room chat. Collapsed by default; click the
 * rail to slide the panel open or shut without covering the whole HUD.
 */
export function SideDock() {
  const [inGame, setInGame] = useState(() => !isInputGated());
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>('news');
  const [draft, setDraft] = useState('');
  const [identity, setIdentity] = useState<GameChatIdentity | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const chat = useGameChat(inGame ? identity : null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const playing = !isInputGated();
      setInGame((current) => (current === playing ? current : playing));
      const session = peekSession();
      if (!session) {
        setIdentity(null);
        return;
      }
      const next: GameChatIdentity = {
        id: session.profile.id,
        name: session.profile.name,
        character: session.profile.character,
        world: session.profile.world,
      };
      setIdentity((current) => {
        if (
          current &&
          current.id === next.id &&
          current.name === next.name &&
          current.character === next.character &&
          current.world === next.world
        ) {
          return current;
        }
        return next;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!inGame) {
      setOpen(false);
      setUiTyping(false);
    }
  }, [inGame]);

  useEffect(() => {
    if (!open || tab !== 'chat') return;
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chat.lines, open, tab]);

  useEffect(() => () => setUiTyping(false), []);

  const version = useMemo(() => buildId(), []);

  if (!inGame) return null;

  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    chat.say(body);
    setDraft('');
  };

  return (
    <div className={`side-dock${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="side-dock__rail"
        aria-expanded={open}
        aria-controls="side-dock-panel"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (!next) setUiTyping(false);
            return next;
          });
        }}
      >
        <span className="side-dock__rail-label">{open ? 'Đóng' : 'Tin & Chat'}</span>
      </button>

      <aside id="side-dock-panel" className="side-dock__panel" hidden={!open}>
        <header className="side-dock__header">
          <div className="side-dock__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'news'}
              className={tab === 'news' ? 'is-active' : undefined}
              onClick={() => {
                setTab('news');
                setUiTyping(false);
              }}
            >
              Tin tức
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chat'}
              className={tab === 'chat' ? 'is-active' : undefined}
              onClick={() => setTab('chat')}
            >
              Chat
            </button>
          </div>
          <button
            type="button"
            className="side-dock__close"
            aria-label="Đóng panel"
            onClick={() => {
              setOpen(false);
              setUiTyping(false);
            }}
          >
            ×
          </button>
        </header>

        {tab === 'news' ? (
          <div className="side-dock__news">
            <p className="side-dock__build">
              Bản dựng <code>{version}</code>
            </p>
            {PATCH_NOTES.map((note) => (
              <article key={note.id} className="side-dock__note">
                <header>
                  <strong>{note.title}</strong>
                  <time>{note.date}</time>
                </header>
                <ul>
                  {note.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <div className="side-dock__chat">
            <div className="side-dock__chat-status">
              {chat.connected
                ? `Phòng «${identity?.world ?? '…'}» · ${identity?.name ?? 'bạn'}`
                : 'Đang kết nối chat…'}
            </div>
            <div className="side-dock__log" ref={logRef}>
              {chat.lines.length === 0 ? (
                <p className="side-dock__empty">Chưa có lời nào. Gõ phía dưới để chào đồng đạo.</p>
              ) : (
                chat.lines.map((line) => (
                  <div
                    key={line.id}
                    className={`side-dock__line${line.fromId === identity?.id ? ' is-self' : ''}`}
                  >
                    <span className="side-dock__from">{line.from}</span>
                    <span className="side-dock__time">{formatTime(line.at)}</span>
                    <p>{line.text}</p>
                  </div>
                ))
              )}
            </div>
            <form className="side-dock__compose" onSubmit={send}>
              <input
                type="text"
                maxLength={240}
                placeholder="Nói chuyện…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setUiTyping(true)}
                onBlur={() => setUiTyping(false)}
                disabled={!chat.connected}
              />
              <button type="submit" disabled={!chat.connected || !draft.trim()}>
                Gửi
              </button>
            </form>
          </div>
        )}
      </aside>
    </div>
  );
}
