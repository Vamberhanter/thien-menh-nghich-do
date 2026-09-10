import { useEffect, useMemo, useRef, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import type { EditorCommandPayload, EditorStatePayload } from '../game/events';
import {
  CHEST_TIER_OPTIONS,
  EDITOR_CATEGORIES,
  MOB_KIND_OPTIONS,
} from '../game/systems/map/editorCatalog';
import { loadCategories, loadThumbnailRect, type PropCategory, type ThumbnailRect } from '../game/systems/map/editorThumbnails';
import { isTilemapZone } from '../game/systems/map/TilemapTerrain';
import { ZONES } from '../game/zones';
import { listMapDrafts, type MapDraftSummary } from '../net/mapDraftStore';

const THUMB_BOX = 40;

/** Every real, registered zone this editor can actually paint on — Ngũ Hành Sơn today, whatever else grows a tilemap later. */
const REAL_MAPS: readonly { id: string; name: string }[] = Object.values(ZONES)
  .filter(isTilemapZone)
  .map((z) => ({ id: z.id, name: z.name }));

/**
 * One palette icon, cropped from the same atlas sheet the game loads.
 *
 * A plain `<img>` of the *whole* sheet, shifted by `-frame.x, -frame.y` and
 * clipped by the box around it — not a `background-image`, because that
 * would need the sheet's own width and height to size a `background-size`
 * correctly, and nothing here has asked Phaser (or the DOM) for those. An
 * `<img>` already knows its own natural size the moment it loads; a shifted
 * absolutely-positioned one inside an `overflow: hidden` box crops the same
 * way without that extra number.
 */
function PropThumb({ texture, frame }: { texture: string; frame: string }) {
  const [rect, setRect] = useState<ThumbnailRect | null>(null);

  useEffect(() => {
    let live = true;
    loadThumbnailRect(texture, frame).then((r) => {
      if (live) setRect(r);
    });
    return () => {
      live = false;
    };
  }, [texture, frame]);

  if (!rect) return <span className="map-editor__thumb map-editor__thumb--empty" aria-hidden />;

  const scale = Math.min(1, THUMB_BOX / rect.w, THUMB_BOX / rect.h);
  return (
    <span className="map-editor__thumb" aria-hidden>
      <span
        style={{
          position: 'absolute',
          left: -rect.x * scale,
          top: -rect.y * scale,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <img src={rect.sheetUrl} alt="" style={{ imageRendering: 'pixelated', display: 'block' }} />
      </span>
    </span>
  );
}

const DEFAULT_STATE: EditorStatePayload = {
  active: false,
  tool: null,
  counts: { props: 0, mobs: 0, chests: 0, portals: 0, triggers: 0 },
  selection: null,
  contextMenu: null,
  busy: false,
  notice: null,
};

type Tab = 'props' | 'ground' | 'gameplay';
type Browse = 'curated' | 'all';

const send = (cmd: EditorCommandPayload) => GameBus.emit(GameEvent.EditorCommand, cmd);

/**
 * A footprint for a frame nobody has curated a box for.
 *
 * Every hand-picked entry in `editorCatalog.ts` blocks on a box noticeably
 * smaller than its own sprite — a trunk's worth under a whole canopy, a
 * building's base under its roofline — because §9 of the original brief
 * asks for collision that hugs what a character actually bumps into, not the
 * art around it. This cannot know which part of an arbitrary frame is trunk
 * and which is canopy, so it keeps the same *shape* of answer — noticeably
 * smaller than the sprite, biased to the base — as a starting guess rather
 * than blocking the full frame. The exported code is meant to be hand-tuned
 * from there, same as any first guess.
 */
const guessFootprint = (w: number, h: number) => ({ width: Math.round(w * 0.5), height: Math.round(h * 0.3) });

/**
 * F2's panel: a palette to arm a tool, a small inspector for whatever is
 * selected, and an export box.
 *
 * All state lives in `MapEditor` — this only ever reflects `EditorState` and
 * sends `EditorCommand`, the same split every other HUD panel already uses
 * (`WarpUI` is the shortest example of the pattern).
 */
export function MapEditorPanel() {
  const [state, setState] = useState<EditorStatePayload>(DEFAULT_STATE);
  const [tab, setTab] = useState<Tab>('props');
  const [category, setCategory] = useState(EDITOR_CATEGORIES[0].id);
  const [exportText, setExportText] = useState<string | null>(null);
  const [browse, setBrowse] = useState<Browse>('curated');
  const [allCategories, setAllCategories] = useState<readonly PropCategory[]>([]);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapCols, setNewMapCols] = useState(40);
  const [newMapRows, setNewMapRows] = useState(30);
  const [openMapId, setOpenMapId] = useState('');
  const [savedMaps, setSavedMaps] = useState<readonly MapDraftSummary[]>([]);
  const [loadingSavedMaps, setLoadingSavedMaps] = useState(false);

  // `null` means "let the CSS centre it" — the panel only switches to an
  // explicit position once the title bar has actually been dragged.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<{ pointerX: number; pointerY: number; panelX: number; panelY: number } | null>(null);

  // Native listeners on `window`, not React's synthetic `onPointerMove` on
  // the title element itself with `setPointerCapture` — capture is exactly
  // the kind of thing that quietly no-ops in some mobile WebViews, and a
  // finger that ever drifts off the (small) title text then stops sending
  // this component anything at all. Tracking on `window` needs no capture:
  // wherever the finger is once down, these still fire.
  useEffect(() => {
    const handle = titleRef.current;
    if (!handle) return undefined;

    const onDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      // Without this, the browser's own touch scrolling/refresh gesture can
      // win the race against the drag on a touchscreen even with
      // `touch-action: none` in CSS — the two together are what it takes.
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      // `left`/`top` position against the nearest positioned ancestor, not
      // the viewport — `getBoundingClientRect` only ever gives the latter.
      // Off by whatever that ancestor's own top-left sits at otherwise,
      // since the very first drag starts from the panel's CSS-centred
      // (`left: 50%` + `transform`) position rather than an already-
      // explicit `left`/`top`.
      const parentRect = (panel.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      dragFrom.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        panelX: rect.left - (parentRect?.left ?? 0),
        panelY: rect.top - (parentRect?.top ?? 0),
      };
    };

    const onMove = (event: PointerEvent) => {
      const from = dragFrom.current;
      if (!from) return;
      const width = panelRef.current?.offsetWidth ?? 0;
      // Clamped so a drag can never lose the panel entirely off-screen —
      // at least a sliver (40px) of it always stays reachable to drag back.
      const x = Math.min(Math.max(from.panelX + (event.clientX - from.pointerX), 40 - width), window.innerWidth - 40);
      const y = Math.min(Math.max(from.panelY + (event.clientY - from.pointerY), 0), window.innerHeight - 40);
      setDragPos({ x, y });
    };

    const onUp = () => {
      dragFrom.current = null;
    };

    handle.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      handle.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // `state.active` — this component never actually unmounts when the
    // panel closes, it just returns `null`, so an effect that only ran once
    // at the component's own mount would attach to a title element that did
    // not exist yet (the panel starts closed) and never get another chance.
    // Re-running on every open/close re-attaches to the fresh title node.
  }, [state.active]);

  const refreshSavedMaps = () => {
    setLoadingSavedMaps(true);
    listMapDrafts()
      .then(setSavedMaps)
      .finally(() => setLoadingSavedMaps(false));
  };

  useEffect(() => {
    if (showMapPanel) refreshSavedMaps();
  }, [showMapPanel]);

  // A save/open that just settled is exactly when the list is stalest —
  // refresh alongside it instead of making the user remember to.
  useEffect(() => {
    if (showMapPanel && !state.busy) refreshSavedMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.busy]);

  useEffect(() => {
    const onState = (next: EditorStatePayload) => {
      setState(next);
      if (next.exportText !== undefined) setExportText(next.exportText);
    };
    GameBus.on(GameEvent.EditorState, onState);
    return () => {
      GameBus.off(GameEvent.EditorState, onState);
    };
  }, []);

  useEffect(() => {
    // Every frame the game has ever loaded, across both art drops — fetched
    // once regardless of how many times "Duyệt tất cả" gets opened.
    loadCategories().then((cats) => {
      setAllCategories(cats);
      setSheetId((current) => current ?? cats[0]?.id ?? null);
    });
  }, []);

  const activeSheet = useMemo(() => allCategories.find((c) => c.id === sheetId), [allCategories, sheetId]);
  const filteredEntries = useMemo(() => {
    if (!activeSheet) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return activeSheet.entries;
    return activeSheet.entries.filter((e) => e.frame.toLowerCase().includes(needle));
  }, [activeSheet, filter]);

  if (!state.active) return null;

  const sel = state.selection;

  return (
    <>
    <div
      className="map-editor"
      ref={panelRef}
      style={dragPos ? { left: dragPos.x, top: dragPos.y, transform: 'none' } : undefined}
    >
      <div className="map-editor__bar">
        <div ref={titleRef} className="map-editor__title map-editor__title--drag" title="Kéo để di chuyển bảng">
          Chế độ chỉnh sửa map · F2 đóng
          {state.tool ? <em> · đang cầm: {state.tool}</em> : null}
        </div>
        <div className="map-editor__counts">
          Prop {state.counts.props} · Quái {state.counts.mobs} · Rương {state.counts.chests} · Cổng{' '}
          {state.counts.portals} · Vùng {state.counts.triggers}
        </div>
        <div className="map-editor__actions">
          {state.tool && (
            <button type="button" onClick={() => send({ action: 'disarm' })}>
              Về chế độ chọn
            </button>
          )}
          <button type="button" onClick={() => setShowMapPanel((v) => !v)}>
            Quản lý map
          </button>
          <button type="button" onClick={() => send({ action: 'export' })}>
            Xuất code
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Xoá mọi thứ mới thêm trong phiên này? (prop có sẵn của map không bị ảnh hưởng)')) send({ action: 'clear' });
            }}
          >
            Xoá đồ mới thêm
          </button>
          <button
            type="button"
            className="map-editor__danger"
            onClick={() => {
              if (
                confirm(
                  'XOÁ TOÀN BỘ prop, kể cả prop gốc có sẵn của map — chỉ ảnh hưởng bản xem trước đang chạy, tải lại trang sẽ khôi phục. Chắc chắn xoá?',
                )
              ) {
                send({ action: 'clear-all' });
              }
            }}
          >
            Xoá TOÀN BỘ
          </button>
          <button type="button" onClick={() => send({ action: 'close' })}>
            Đóng
          </button>
        </div>
      </div>

      <p className="map-editor__hint">
        Bấm vào một prop có sẵn trên map để chọn — kéo để di chuyển, bấm phím Delete hoặc nút "Xoá vật thể này" bên dưới
        để xoá riêng nó. Giữ chuột phải (hoặc chuột giữa) và kéo để di chuyển camera đến bất kỳ chỗ nào trên map — bấm
        chuột phải nhanh, không kéo, vẫn mở menu xoá như cũ.
      </p>

      {state.notice && !showMapPanel && <p className={`map-editor__notice${state.notice.includes('thất bại') ? ' map-editor__notice--error' : ''}`}>{state.notice}</p>}

      {showMapPanel && (
        <div className="map-editor__map-panel">
          {state.notice && <p className={`map-editor__notice${state.notice.includes('thất bại') ? ' map-editor__notice--error' : ''}`}>{state.notice}</p>}

          <div className="map-editor__map-section">
            <div className="map-editor__map-section-title">Tạo map mới</div>
            <p className="map-editor__hint">
              Bắt đầu từ một canvas trống toàn cỏ, thay cho map hiện tại — chỉ ảnh hưởng bản xem trước, chưa lưu gì cả.
            </p>
            <label>
              Tên map
              <input type="text" value={newMapName} onChange={(e) => setNewMapName(e.target.value)} placeholder="Vườn Đào" />
            </label>
            <label>
              Số cột
              <input
                type="number"
                min={4}
                max={200}
                value={newMapCols}
                onChange={(e) => setNewMapCols(Number(e.target.value))}
              />
            </label>
            <label>
              Số hàng
              <input
                type="number"
                min={4}
                max={200}
                value={newMapRows}
                onChange={(e) => setNewMapRows(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              disabled={state.busy || !newMapName.trim()}
              onClick={() => {
                if (!confirm(`Tạo map mới "${newMapName}" (${newMapCols}x${newMapRows} ô), thay cho map hiện tại đang xem?`)) return;
                send({ action: 'new-map', mapName: newMapName.trim(), mapCols: newMapCols, mapRows: newMapRows });
              }}
            >
              Tạo map mới
            </button>
          </div>

          <div className="map-editor__map-section">
            <div className="map-editor__map-section-title">Lưu map hiện tại</div>
            <p className="map-editor__hint">
              Lưu lên server toàn bộ nền/vật thể/gameplay của map đang chỉnh — lần sau mở lại map này (hoặc mở đúng id
              bên dưới) sẽ tự khôi phục đúng bản đã lưu.
            </p>
            <button type="button" disabled={state.busy} onClick={() => send({ action: 'save-map' })}>
              Lưu map
            </button>
          </div>

          <div className="map-editor__map-section">
            <div className="map-editor__map-section-title">Mở map đã lưu</div>

            {REAL_MAPS.length > 0 && (
              <>
                <p className="map-editor__hint">Map thật trong game:</p>
                <ul className="map-editor__map-list">
                  {REAL_MAPS.map((z) => (
                    <li key={z.id}>
                      <button type="button" disabled={state.busy} onClick={() => send({ action: 'open-map', mapId: z.id })} title={`id: ${z.id}`}>
                        <span className="map-editor__map-list-name">{z.name}</span>
                        <span className="map-editor__map-list-meta">{z.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="map-editor__hint">Map tự tạo/đã lưu:</p>
              </>
            )}

            {loadingSavedMaps && <p className="map-editor__hint">Đang tải danh sách...</p>}
            {!loadingSavedMaps && savedMaps.length === 0 && (
              <p className="map-editor__hint">Chưa có map nào được lưu.</p>
            )}
            {savedMaps.length > 0 && (
              <ul className="map-editor__map-list">
                {savedMaps.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={state.busy}
                      onClick={() => send({ action: 'open-map', mapId: m.id })}
                      title={`id: ${m.id}`}
                    >
                      <span className="map-editor__map-list-name">{m.name}</span>
                      <span className="map-editor__map-list-meta">
                        {m.id} · {new Date(m.updatedAt).toLocaleString('vi-VN')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" disabled={loadingSavedMaps} onClick={refreshSavedMaps}>
              Làm mới danh sách
            </button>

            <div className="map-editor__map-list-manual">
              <label>
                Hoặc nhập id map
                <input type="text" value={openMapId} onChange={(e) => setOpenMapId(e.target.value)} placeholder="vuon-dao" />
              </label>
              <button
                type="button"
                disabled={state.busy || !openMapId.trim()}
                onClick={() => send({ action: 'open-map', mapId: openMapId.trim() })}
              >
                Mở
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="map-editor__tabs">
        <button type="button" className={tab === 'props' ? 'is-active' : ''} onClick={() => setTab('props')}>
          Trang trí
        </button>
        <button type="button" className={tab === 'ground' ? 'is-active' : ''} onClick={() => setTab('ground')}>
          Nền đất
        </button>
        <button type="button" className={tab === 'gameplay' ? 'is-active' : ''} onClick={() => setTab('gameplay')}>
          Gameplay
        </button>
      </div>

      {tab === 'props' && (
        <div className="map-editor__palette">
          <div className="map-editor__tabs map-editor__tabs--sub">
            <button type="button" className={browse === 'curated' ? 'is-active' : ''} onClick={() => setBrowse('curated')}>
              Gợi ý
            </button>
            <button type="button" className={browse === 'all' ? 'is-active' : ''} onClick={() => setBrowse('all')}>
              Duyệt tất cả ({allCategories.reduce((n, c) => n + c.entries.length, 0)})
            </button>
          </div>

          {browse === 'curated' && (
            <>
              <div className="map-editor__categories">
                {EDITOR_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={category === cat.id ? 'is-active' : ''}
                    onClick={() => setCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="map-editor__items">
                {EDITOR_CATEGORIES.find((c) => c.id === category)?.props.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="map-editor__prop-btn"
                    onClick={() => send({ action: 'arm-prop', texture: p.texture, frame: p.frame, solidW: p.solid?.width, solidH: p.solid?.height })}
                  >
                    <PropThumb texture={p.texture} frame={p.frame} />
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="map-editor__hint">Bấm một mục rồi bấm lên bản đồ để đặt — có thể đặt nhiều lần liên tiếp.</p>
            </>
          )}

          {browse === 'all' && (
            <>
              <div className="map-editor__browse-bar">
                <select value={sheetId ?? ''} onChange={(e) => setSheetId(e.target.value)}>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.entries.length})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Lọc theo tên frame, vd: 12"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="map-editor__items map-editor__items--grid">
                {filteredEntries.map((entry) => (
                  <button
                    key={entry.frame}
                    type="button"
                    className="map-editor__prop-btn"
                    title={entry.frame}
                    onClick={() => {
                      const foot = guessFootprint(entry.rect.w, entry.rect.h);
                      send({ action: 'arm-prop', texture: entry.texture, frame: entry.frame, solidW: foot.width, solidH: foot.height });
                    }}
                  >
                    <PropThumb texture={entry.texture} frame={entry.frame} />
                    {entry.frame}
                  </button>
                ))}
              </div>
              <p className="map-editor__hint">
                Va chạm ở đây chỉ là ước lượng theo kích thước khung hình — chỉnh lại tay trong code xuất ra nếu cần chính
                xác hơn.
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'ground' && (
        <div className="map-editor__palette">
          <div className="map-editor__items">
            <button type="button" onClick={() => send({ action: 'arm-ground', ground: 'grass' })}>
              Cỏ
            </button>
            <button type="button" onClick={() => send({ action: 'arm-ground', ground: 'dirt' })}>
              Đất
            </button>
            <button type="button" onClick={() => send({ action: 'arm-ground', ground: 'stone' })}>
              Đá lát
            </button>
            <button type="button" onClick={() => send({ action: 'arm-ground', ground: 'road' })}>
              Đường mòn
            </button>
            <button type="button" onClick={() => send({ action: 'arm-ground', ground: 'erase-road' })}>
              Xoá đường mòn
            </button>
          </div>
          <p className="map-editor__hint">Bấm giữ và kéo chuột trên bản đồ để tô — không đổi loại nước/va chạm.</p>
        </div>
      )}

      {tab === 'gameplay' && (
        <div className="map-editor__palette">
          <div className="map-editor__items">
            <button type="button" onClick={() => send({ action: 'arm-mob' })}>
              Điểm hồi sinh quái
            </button>
            <button type="button" onClick={() => send({ action: 'arm-chest' })}>
              Rương
            </button>
            <button type="button" onClick={() => send({ action: 'arm-portal' })}>
              Cổng dịch chuyển
            </button>
            <button type="button" onClick={() => send({ action: 'arm-trigger' })}>
              Vùng trigger
            </button>
          </div>
          <p className="map-editor__hint">Mỗi lần bấm chỉ đặt một cái — chỉnh chi tiết ở khung bên dưới sau khi đặt.</p>
        </div>
      )}

      {sel && (
        <div className="map-editor__inspector">
          <div className="map-editor__inspector-title">
            {sel.kind === 'prop' && 'Vật thể trang trí'}
            {sel.kind === 'mob' && 'Điểm hồi sinh quái'}
            {sel.kind === 'chest' && 'Rương'}
            {sel.kind === 'portal' && 'Cổng dịch chuyển'}
            {sel.kind === 'trigger' && 'Vùng trigger'}
            {` · (${sel.x}, ${sel.y})`}
          </div>

          {sel.kind === 'prop' && (
            <>
              <div className="map-editor__prop-info">
                <PropThumb texture={String(sel.data.texture)} frame={String(sel.data.frame)} />
                <span>
                  {sel.data.texture} / {sel.data.frame}
                  <br />
                  {sel.data.origin === 'baked' ? 'Có sẵn trong map gốc' : 'Mới thêm trong phiên này'}
                </span>
              </div>
              <label>
                Kích thước ({Math.round(Number(sel.data.scale ?? 1) * 100)}%)
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={5}
                  value={Math.round(Number(sel.data.scale ?? 1) * 100)}
                  onChange={(e) => send({ action: 'update-selected', field: 'scale', value: Number(e.target.value) / 100 })}
                />
              </label>
              {Number(sel.data.scale ?? 1) !== 1 && (
                <button type="button" onClick={() => send({ action: 'update-selected', field: 'scale', value: 1 })}>
                  Về kích thước gốc (100%)
                </button>
              )}
            </>
          )}

          {sel.kind === 'mob' && (
            <>
              <label>
                Loại quái
                <select
                  value={String(sel.data.kind ?? 'toad')}
                  onChange={(e) => send({ action: 'update-selected', field: 'kind', value: e.target.value })}
                >
                  {MOB_KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Số lượng tối đa
                <input
                  type="number"
                  min={1}
                  value={Number(sel.data.maxCount ?? 1)}
                  onChange={(e) => send({ action: 'update-selected', field: 'maxCount', value: Number(e.target.value) })}
                />
              </label>
              <label>
                Bán kính rải (px)
                <input
                  type="number"
                  min={0}
                  value={Number(sel.data.radius ?? 0)}
                  onChange={(e) => send({ action: 'update-selected', field: 'radius', value: Number(e.target.value) })}
                />
              </label>
              <label>
                Hồi sinh sau (ms)
                <input
                  type="number"
                  min={0}
                  value={Number(sel.data.respawnMs ?? 12000)}
                  onChange={(e) => send({ action: 'update-selected', field: 'respawnMs', value: Number(e.target.value) })}
                />
              </label>
              <label>
                Cấp tối thiểu (bỏ trống nếu không giới hạn)
                <input
                  type="number"
                  min={0}
                  value={Number(sel.data.minLevel ?? 0)}
                  onChange={(e) => send({ action: 'update-selected', field: 'minLevel', value: Number(e.target.value) })}
                />
              </label>
            </>
          )}

          {sel.kind === 'chest' && (
            <label>
              Độ hiếm
              <select
                value={String(sel.data.tier ?? 'common')}
                onChange={(e) => send({ action: 'update-selected', field: 'tier', value: e.target.value })}
              >
                {CHEST_TIER_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}

          {sel.kind === 'portal' && (
            <>
              <label>
                Đến map (id)
                <input
                  type="text"
                  value={String(sel.data.to ?? '')}
                  onChange={(e) => send({ action: 'update-selected', field: 'to', value: e.target.value })}
                />
              </label>
              <label>
                Nhãn hiển thị
                <input
                  type="text"
                  value={String(sel.data.label ?? '')}
                  onChange={(e) => send({ action: 'update-selected', field: 'label', value: e.target.value })}
                />
              </label>
              <label>
                Điểm đến X
                <input
                  type="number"
                  value={Number(sel.data.spawnX ?? sel.x)}
                  onChange={(e) => send({ action: 'update-selected', field: 'spawnX', value: Number(e.target.value) })}
                />
              </label>
              <label>
                Điểm đến Y
                <input
                  type="number"
                  value={Number(sel.data.spawnY ?? sel.y)}
                  onChange={(e) => send({ action: 'update-selected', field: 'spawnY', value: Number(e.target.value) })}
                />
              </label>
            </>
          )}

          {sel.kind === 'trigger' && (
            <>
              <label>
                Sự kiện (event)
                <input
                  type="text"
                  value={String(sel.data.event ?? 'notice')}
                  onChange={(e) => send({ action: 'update-selected', field: 'event', value: e.target.value })}
                />
              </label>
              <label>
                Nội dung / nhãn
                <input
                  type="text"
                  value={String(sel.data.text ?? '')}
                  onChange={(e) => send({ action: 'update-selected', field: 'text', value: e.target.value })}
                />
              </label>
              <label>
                Bán kính (px)
                <input
                  type="number"
                  min={16}
                  value={Number(sel.data.radius ?? 128)}
                  onChange={(e) => send({ action: 'update-selected', field: 'radius', value: Number(e.target.value) })}
                />
              </label>
            </>
          )}

          <button type="button" className="map-editor__delete" onClick={() => send({ action: 'delete-selected' })}>
            Xoá vật thể này
          </button>
        </div>
      )}

      {exportText !== null && (
        <div className="map-editor__export">
          <div className="map-editor__export-bar">
            <span>Code đã tạo — dán vào file zone tương ứng</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportText);
                } catch {
                  // Clipboard permission can be denied; the textarea below is
                  // still there to select and copy by hand.
                }
              }}
            >
              Copy
            </button>
            <button type="button" onClick={() => setExportText(null)}>
              Đóng
            </button>
          </div>
          <textarea readOnly value={exportText} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
    {state.contextMenu && (
      // A sibling of `.map-editor`, not a child of it: that panel centers
      // itself with `transform: translateX(-50%)`, and any transformed
      // ancestor becomes the containing block for a `position: fixed`
      // descendant — nested here, this button positioned itself relative to
      // the panel's own box instead of the viewport, landing nowhere near
      // the cursor that opened it.
      <button
        type="button"
        className="map-editor__context-menu"
        style={{ left: state.contextMenu.x, top: state.contextMenu.y }}
        onClick={() => send({ action: 'delete-selected' })}
      >
        Xoá
      </button>
    )}
    </>
  );
}
