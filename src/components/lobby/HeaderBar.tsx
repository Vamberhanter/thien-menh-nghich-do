/** Which side panel currently owns the lit plaque. */
export type LobbyView = 'menu' | 'create' | 'join';

const TITLE = 'Thiên Mệnh Nghịch Đồ';
const TITLE_SUB = 'Cõi U Minh';

export function HeaderBar({
  view,
  onView,
  account,
  ping,
}: {
  view: LobbyView;
  onView: (view: LobbyView) => void;
  account: string;
  ping: number | null;
}) {
  return (
    <header className="rod__header">
      <div className="rod-crest rod-crest--skull" aria-hidden="true" />

      <div className="rod__brand">
        <h1 className="rod__title">{TITLE}</h1>
        <div className="rod__title-sub">{TITLE_SUB}</div>
        <nav className="rod__tabs">
          <button
            type="button"
            className={`rod-tab${view === 'join' ? '' : ' is-on'}`}
            onClick={() => onView('menu')}
          >
            Menu chính
          </button>
          <button
            type="button"
            className={`rod-tab${view === 'join' ? ' is-on' : ''}`}
            onClick={() => onView('join')}
          >
            Vào phòng
          </button>
        </nav>
      </div>

      <div className="rod__aside">
        <div className="rod__account">
          <b>{account}</b>
          <span>{ping == null ? 'độ trễ —' : `độ trễ ${ping}ms`}</span>
        </div>
        <div className="rod-crest rod-crest--sigil" aria-hidden="true" />
      </div>
    </header>
  );
}
