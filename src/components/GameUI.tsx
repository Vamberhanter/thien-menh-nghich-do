import { useEffect, useRef, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import type {
  CharacterBuildPayload,
  CharacterChangedPayload,
  CooldownPayload,
  ComboStatePayload,
  DeathCountdownPayload,
  MinimapPayload,
  ProgressionPayload,
  QuestStatePayload,
  StatePayload,
  StatsPayload,
  ZonePayload,
  PersistPayload,
  TribulationHudPayload,
} from '../game/events';
import type { RosterPayload } from '../net/types';
import { DEFAULT_NHU_YEN_STATS } from '../game/types';
import type { CharacterState } from '../game/types';
import { HU_VO_KIEM_KHI } from '../game/systems/CombatSystem';
import { LAM_UYEN_PROFILE } from '../game/entities/playerHandle';
import { NHU_YEN_PROFILE } from '../game/entities/NhuYen';
import { HUYET_LANG_PROFILE } from '../game/entities/HuyetLang';
import { MIKU_PROFILE } from '../game/entities/Miku';
import { CHARACTER_NAME } from '../net/types';
import { isInputGated, returnToLobby, setSystemMenuOpen } from '../net/bind';
import { consumePad } from '../game/touchPad';
import {
  CONTROL_MODE_LABEL,
  cycleControlMode,
  readControlMode,
  type ControlMode,
} from '../game/touchPad';
import { gamepadConnected } from '../game/gamepad';

const STATE_LABEL: Record<CharacterState, string> = {
  idle: 'Tĩnh tọa',
  walk: 'Di chuyển',
  run: 'Cấp hành',
  attack: 'Kiếm chiêu',
  skill: 'Thi triển chiêu thức',
  dash: 'Ảnh bộ',
  hurt: 'Trúng đòn',
  dead: 'Tử vong',
};

const SKILL_KEYS: Record<string, readonly string[]> = {
  [LAM_UYEN_PROFILE.id]: ['K'],
  [NHU_YEN_PROFILE.id]: ['K', 'L', 'Space'],
  [HUYET_LANG_PROFILE.id]: ['K', 'L', 'Space'],
  [MIKU_PROFILE.id]: ['K', 'L', 'Space'],
};

const HINTS: Record<string, string> = {
  [LAM_UYEN_PROFILE.id]: `WASD / stick · J / A tấn · K / X ${HU_VO_KIEM_KHI.name} · RB nhặt · Start menu · Back đổi nhân vật tại huyết mạch`,
  [NHU_YEN_PROFILE.id]:
    'WASD / stick · LT chạy · A liên chiêu · X / Y / B chiêu · RB nhặt · LB túi · Start menu · RT dịch chuyển',
  [HUYET_LANG_PROFILE.id]:
    'WASD / stick · A liên chiêu · X / Y / B chiêu · RB nhặt · LB túi · Start menu · RT dịch chuyển',
  [MIKU_PROFILE.id]:
    'WASD / stick · A liên chiêu · X / Y / B chiêu · RB nhặt · LB túi · Start menu · RT dịch chuyển',
};

const SEGMENTS = 12;
const MAP_SIZE = 148;

type MenuAction =
  | 'resume'
  | 'inventory'
  | 'character'
  | 'breakthrough'
  | 'quest'
  | 'shop'
  | 'farm'
  | 'warp'
  | 'controls'
  | 'leave';

interface MenuItem {
  id: MenuAction;
  label: string;
  danger?: boolean;
}

function buildMenuItems(mode: ControlMode): readonly MenuItem[] {
  return [
    { id: 'resume', label: 'Tiếp tục' },
    { id: 'inventory', label: 'Túi đồ' },
    { id: 'character', label: 'Nhân vật' },
    { id: 'breakthrough', label: 'Đột phá' },
    { id: 'quest', label: 'Nhiệm vụ' },
    { id: 'shop', label: 'Thương nhân' },
    { id: 'farm', label: 'Linh Điền' },
    { id: 'warp', label: 'Dịch chuyển' },
    {
      id: 'controls',
      label: `Điều khiển · ${CONTROL_MODE_LABEL[mode]}`,
    },
    { id: 'leave', label: 'Rời phòng', danger: true },
  ];
}

function PixelBar({ value, max, variant }: { value: number; max: number; variant: 'hp' | 'sp' | 'xp' }) {
  const filled = max > 0 ? Math.round((value / max) * SEGMENTS) : 0;
  return (
    <div className={`bar bar--${variant}`}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className={`bar__cell${i < filled ? ' is-filled' : ''}`} />
      ))}
    </div>
  );
}

function ComboPips({ steps, pending }: { steps: number; pending: number }) {
  if (steps <= 1) return null;
  return (
    <div className="hud__combo">
      <span className="hud__tag">連</span>
      <div className="combo">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={`combo__pip${i < pending ? ' is-lit' : ''}`} />
        ))}
      </div>
    </div>
  );
}

function markStyle(x: number, y: number, width: number, height: number) {
  return {
    left: `${(x / width) * 100}%`,
    top: `${(y / height) * 100}%`,
  };
}

function Minimap({ map }: { map: MinimapPayload }) {
  return (
    <div className="minimap" style={{ width: MAP_SIZE, height: MAP_SIZE }}>
      <div className="minimap__title">{map.zoneName}</div>
      <div className="minimap__board">
        <span
          className="minimap__mark minimap__mark--shrine"
          style={markStyle(map.shrine.x, map.shrine.y, map.width, map.height)}
          title="Huyết mạch"
        />
        <span
          className="minimap__mark minimap__mark--waypoint"
          style={markStyle(map.waypoint.x, map.waypoint.y, map.width, map.height)}
          title="Trụ dịch chuyển"
        />
        {map.portals.map((portal, i) => (
          <span
            key={`p-${i}`}
            className="minimap__mark minimap__mark--portal"
            style={markStyle(portal.x, portal.y, map.width, map.height)}
            title={portal.label ?? 'Cổng'}
          />
        ))}
        {map.boss ? (
          <span
            className="minimap__mark minimap__mark--boss"
            style={markStyle(map.boss.x, map.boss.y, map.width, map.height)}
            title={map.boss.label ?? 'Boss'}
          />
        ) : null}
        {map.peers.map((peer, i) => (
          <span
            key={`e-${i}`}
            className="minimap__mark minimap__mark--peer"
            style={markStyle(peer.x, peer.y, map.width, map.height)}
            title="Đồng đạo"
          />
        ))}
        <span
          className="minimap__mark minimap__mark--self"
          style={markStyle(map.player.x, map.player.y, map.width, map.height)}
          title="Bạn"
        />
      </div>
      <div className="minimap__legend">
        <span>
          <i className="minimap__dot minimap__dot--self" /> bạn
        </span>
        <span>
          <i className="minimap__dot minimap__dot--peer" /> đồng đạo
        </span>
        <span>
          <i className="minimap__dot minimap__dot--shrine" /> huyết mạch
        </span>
      </div>
    </div>
  );
}

export function GameUI() {
  const [character, setCharacter] = useState<CharacterChangedPayload>({ ...NHU_YEN_PROFILE });
  const [stats, setStats] = useState<StatsPayload>({
    hp: DEFAULT_NHU_YEN_STATS.hp,
    maxHp: DEFAULT_NHU_YEN_STATS.maxHp,
    sp: DEFAULT_NHU_YEN_STATS.spiritualPower,
    maxSp: DEFAULT_NHU_YEN_STATS.maxSpiritualPower,
  });
  const [state, setState] = useState<CharacterState>('idle');
  const [comboPending, setComboPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [cooldowns, setCooldowns] = useState<readonly number[]>([]);
  const [death, setDeath] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressionPayload>({
    level: 1,
    xp: 0,
    need: 50,
    title: 'Luyện Khí 1',
  });
  const [zone, setZone] = useState('Ngoại môn luyện địa');
  const [loot, setLoot] = useState<string | null>(null);
  const [cloud, setCloud] = useState<PersistPayload | null>(null);
  const [minimap, setMinimap] = useState<MinimapPayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const menuIndexRef = useRef(0);
  const [leaving, setLeaving] = useState(false);
  const [inGame, setInGame] = useState(() => !isInputGated());
  const [quests, setQuests] = useState<QuestStatePayload>({ quests: [], tracked: [] });
  const [breakthroughReady, setBreakthroughReady] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>(() => readControlMode());
  const MENU_ITEMS = buildMenuItems(controlMode);
  const [tribulation, setTribulation] = useState<TribulationHudPayload | null>(null);

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    setMenuOpen(false);
    void returnToLobby().finally(() => setLeaving(false));
  };

  const runMenuAction = (action: MenuAction) => {
    if (action === 'leave') {
      leave();
      return;
    }
    if (action === 'controls') {
      const next = cycleControlMode(controlMode);
      setControlMode(next);
      GameBus.emit(GameEvent.ControlModeChanged, {
        mode: next,
        showPad: next !== 'keyboard',
      });
      GameBus.emit(GameEvent.TouchPadSet, { show: next !== 'keyboard' });
      const padHint = gamepadConnected() ? ' · tay cầm đã kết nối' : ' · cắm tay cầm khi cần';
      const tip =
        next === 'keyboard'
          ? `Chế độ bàn phím${padHint}`
          : next === 'touch'
            ? 'Hiện nút trên màn hình'
            : `Tay cầm + hiện nút${padHint}`;
      GameBus.emit(GameEvent.Notice, tip);
      return;
    }
    setMenuOpen(false);
    if (action === 'resume') return;
    if (action === 'inventory') GameBus.emit(GameEvent.InventoryToggle);
    else if (action === 'character') GameBus.emit(GameEvent.CharacterPanelToggle);
    else if (action === 'breakthrough') {
      GameBus.emit(GameEvent.CharacterPanelToggle, { tab: 'breakthrough', forceOpen: true });
    }
    else if (action === 'quest') GameBus.emit(GameEvent.QuestToggle);
    else if (action === 'shop') GameBus.emit(GameEvent.ShopToggle);
    else if (action === 'farm') GameBus.emit(GameEvent.FarmToggle);
    else if (action === 'warp') GameBus.emit(GameEvent.WarpCommand, { action: 'toggle' });
  };

  useEffect(() => {
    setSystemMenuOpen(menuOpen);
    if (menuOpen) {
      setMenuIndex(0);
      menuIndexRef.current = 0;
    }
    return () => setSystemMenuOpen(false);
  }, [menuOpen]);

  useEffect(() => {
    menuIndexRef.current = menuIndex;
  }, [menuIndex]);

  useEffect(() => {
    if (!menuOpen) return;
    let frame = 0;
    const tick = () => {
      if (consumePad('menuUp')) {
        setMenuIndex((index) => {
          const next = (index + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
          menuIndexRef.current = next;
          return next;
        });
      }
      if (consumePad('menuDown')) {
        setMenuIndex((index) => {
          const next = (index + 1) % MENU_ITEMS.length;
          menuIndexRef.current = next;
          return next;
        });
      }
      if (consumePad('menuConfirm')) {
        const item = MENU_ITEMS[menuIndexRef.current];
        if (item) runMenuAction(item.id);
      }
      if (consumePad('menuBack')) setMenuOpen(false);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen, leaving]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault();
        setMenuIndex((index) => {
          const next = (index + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
          menuIndexRef.current = next;
          return next;
        });
      } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        event.preventDefault();
        setMenuIndex((index) => {
          const next = (index + 1) % MENU_ITEMS.length;
          menuIndexRef.current = next;
          return next;
        });
      } else if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        const item = MENU_ITEMS[menuIndexRef.current];
        if (item) runMenuAction(item.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, leaving]);

  useEffect(() => {
    const onStats = (payload: StatsPayload) => setStats(payload);
    const onState = (payload: StatePayload) => setState(payload.state);
    const onCombo = (payload: ComboStatePayload) => setComboPending(payload.pending);
    const onCharacter = (payload: CharacterChangedPayload) => {
      setCharacter(payload);
      setComboPending(0);
      setState('idle');
    };
    const onSkillRejected = ({
      name,
      reason,
    }: {
      name: string;
      reason: 'cooldown' | 'spirit' | 'locked';
    }) => {
      setNotice(
        reason === 'spirit'
          ? 'Linh lực không đủ'
          : reason === 'locked'
            ? `Cần học ${name} trong cây kỹ năng`
            : `${name} chưa hồi`,
      );
    };
    const onNotice = (text: string) => {
      if (typeof text === 'string') setNotice(text);
    };
    const onDeath = (payload: DeathCountdownPayload) => setDeath(payload.seconds);
    const onLoot = ({ label }: { label: string | null }) => setLoot(label);
    const onCool = (payload: CooldownPayload) => setCooldowns(payload.skills);
    const onZone = (payload: ZonePayload) => setZone(payload.name);
    const onMinimap = (payload: MinimapPayload) => {
      if (payload?.width) setMinimap(payload);
    };
    const onSession = () => {
      setInGame(!isInputGated());
      if (isInputGated()) {
        setMenuOpen(false);
        setMinimap(null);
      }
    };
    const onBuild = (payload: CharacterBuildPayload) => {
      setBreakthroughReady(Boolean(payload.breakthrough?.available));
    };
    const onTribulation = (payload: TribulationHudPayload) => {
      if (!payload?.active) setTribulation(null);
      else setTribulation(payload);
    };

    GameBus.on(GameEvent.StatsChanged, onStats);
    GameBus.on(GameEvent.StateChanged, onState);
    GameBus.on(GameEvent.ComboChanged, onCombo);
    GameBus.on(GameEvent.CharacterChanged, onCharacter);
    GameBus.on(GameEvent.SkillRejected, onSkillRejected);
    GameBus.on(GameEvent.NetRoster, setRoster);
    GameBus.on(GameEvent.Cooldowns, onCool);
    GameBus.on(GameEvent.DeathCountdown, onDeath);
    GameBus.on(GameEvent.Progression, setProgress);
    GameBus.on(GameEvent.ZoneChanged, onZone);
    GameBus.on(GameEvent.LootPrompt, onLoot);
    GameBus.on(GameEvent.Notice, onNotice);
    GameBus.on(GameEvent.Persist, setCloud);
    GameBus.on(GameEvent.Minimap, onMinimap);
    GameBus.on(GameEvent.QuestState, setQuests);
    GameBus.on(GameEvent.NetSession, onSession);
    GameBus.on(GameEvent.CharacterBuild, onBuild);
    GameBus.on(GameEvent.TribulationState, onTribulation);
    return () => {
      GameBus.off(GameEvent.StatsChanged, onStats);
      GameBus.off(GameEvent.StateChanged, onState);
      GameBus.off(GameEvent.ComboChanged, onCombo);
      GameBus.off(GameEvent.CharacterChanged, onCharacter);
      GameBus.off(GameEvent.SkillRejected, onSkillRejected);
      GameBus.off(GameEvent.NetRoster, setRoster);
      GameBus.off(GameEvent.Cooldowns, onCool);
      GameBus.off(GameEvent.DeathCountdown, onDeath);
      GameBus.off(GameEvent.Progression, setProgress);
      GameBus.off(GameEvent.ZoneChanged, onZone);
      GameBus.off(GameEvent.LootPrompt, onLoot);
      GameBus.off(GameEvent.Notice, onNotice);
      GameBus.off(GameEvent.Persist, setCloud);
      GameBus.off(GameEvent.Minimap, onMinimap);
      GameBus.off(GameEvent.QuestState, setQuests);
      GameBus.off(GameEvent.NetSession, onSession);
      GameBus.off(GameEvent.CharacterBuild, onBuild);
      GameBus.off(GameEvent.TribulationState, onTribulation);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 1200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const toggleMenu = () => {
      if (isInputGated()) return;
      setMenuOpen((open) => !open);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      toggleMenu();
    };
    window.addEventListener('keydown', onKey);
    GameBus.on(GameEvent.MenuToggle, toggleMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      GameBus.off(GameEvent.MenuToggle, toggleMenu);
    };
  }, []);

  // Solo play never emits NetSession — sync when lobby closes via input gate.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const playing = !isInputGated();
      setInGame((current) => (current === playing ? current : playing));
      if (!playing) setMenuOpen(false);
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  const keys = SKILL_KEYS[character.id] ?? [];

  if (!inGame) return null;

  return (
    <div className="hud">
      <div className="hud__panel">
        <div className="hud__name">{character.name.toUpperCase()}</div>
        <div className="hud__sect">{character.sect}</div>
        <div className="hud__zone">{zone}</div>
        <div className="hud__row">
          <span className="hud__tag">TU</span>
          <PixelBar value={progress.need ? progress.xp : 1} max={progress.need || 1} variant="xp" />
          <span className="hud__value">{progress.title}</span>
        </div>
        <div className="hud__row">
          <span className="hud__tag">HP</span>
          <PixelBar value={stats.hp} max={stats.maxHp} variant="hp" />
          <span className="hud__value">
            {stats.hp}/{stats.maxHp}
          </span>
        </div>
        <div className="hud__row">
          <span className="hud__tag">SP</span>
          <PixelBar value={stats.sp} max={stats.maxSp} variant="sp" />
          <span className="hud__value">
            {stats.sp}/{stats.maxSp}
          </span>
        </div>
        <ComboPips steps={character.comboSteps} pending={comboPending} />
        <div className="hud__state">{STATE_LABEL[state]}</div>
        {cloud && (
          <div className={`hud__cloud${cloud.remote ? '' : ' is-local'}`} title={cloud.error ?? undefined}>
            {cloud.remote
              ? 'Đã lưu database'
              : cloud.error
                ? `Chưa lên database · ${cloud.error}`
                : 'Chưa lên database'}
          </div>
        )}
      </div>

      <div className="hud__top-right">
        {roster && roster.world ? (
          <div className="hud__roster">
            <div className="hud__roster-title">
              {roster.world} · {roster.nearby.length + 1} tu tiên
              {roster.host === true ? ' · chủ ô' : roster.host === false ? ' · đồng bộ' : ''}
            </div>
            <div className="hud__roster-row is-self">{roster.selfName} · bạn</div>
            {roster.nearby.map((peer) => (
              <div className="hud__roster-row" key={peer.id}>
                {peer.name}
                <span>{CHARACTER_NAME[peer.character] ?? peer.character}</span>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className={`hud__menu-btn${menuOpen ? ' is-on' : ''}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
        <button
          type="button"
          className={`hud__menu-btn hud__breakthrough${breakthroughReady ? ' is-ready' : ''}`}
          onClick={() =>
            GameBus.emit(GameEvent.CharacterPanelToggle, { tab: 'breakthrough', forceOpen: true })
          }
        >
          Đột phá
        </button>
      </div>

      <div className="hud__skills hud__skills--keys">
        {character.skills.map((skill, i) => (
          <div className="skill" key={skill}>
            <span className="skill__key">{keys[i] ?? '?'}</span>
            <span className="skill__name">{skill}</span>
            {(cooldowns[i] ?? 0) > 0.02 && (
              <span className="skill__cd" style={{ width: `${Math.round(cooldowns[i] * 100)}%` }} />
            )}
          </div>
        ))}
      </div>

      {minimap ? <Minimap map={minimap} /> : null}

      {quests.tracked.length ? (
        <aside className="quest-tracker">
          <strong>Nhiệm vụ</strong>
          {quests.tracked.slice(0, 3).map((quest) => (
            <div key={quest.id}>
              <span>{quest.title}</span>
              <small>{quest.progress}</small>
            </div>
          ))}
        </aside>
      ) : null}

      {notice && <div className="hud__notice">{notice}</div>}
      {tribulation && (
        <div className="hud__tribulation" role="status">
          {tribulation.label} · còn {tribulation.secondsLeft}s · {tribulation.remaining} yêu
        </div>
      )}
      {loot && <div className="hud__loot">{loot}</div>}
      {death !== null && (
        <div className="hud__death">
          <div>TỬ VONG</div>
          <div>Tự động hồi sinh sau {death}s</div>
        </div>
      )}

      {menuOpen ? (
        <div className="game-menu">
          <div className="game-menu__panel" role="menu" aria-label="Menu trò chơi">
            <div className="game-menu__title">Menu</div>
            {MENU_ITEMS.map((item, index) => (
              <button
                type="button"
                role="menuitem"
                key={item.id}
                className={`game-menu__btn${item.danger ? ' game-menu__btn--danger' : ''}${
                  index === menuIndex ? ' is-focused' : ''
                }`}
                disabled={item.id === 'leave' && leaving}
                onMouseEnter={() => setMenuIndex(index)}
                onClick={() => runMenuAction(item.id)}
              >
                {item.id === 'leave' && leaving ? 'Đang rời…' : item.label}
              </button>
            ))}
            <div className="game-menu__hint">
              {controlMode === 'gamepad'
                ? 'A đánh · X/Y/B chiêu · LB túi · RB nhặt · Start menu'
                : controlMode === 'touch'
                  ? 'Dùng nút trên màn hình · tay cầm vẫn dùng được'
                  : 'WASD / chuột · hoặc chọn lại Điều khiển để hiện nút'}
              <br />
              D-pad chọn · A xác nhận · B / Start đóng
            </div>
          </div>
        </div>
      ) : null}

      <div className="hud__hint">{HINTS[character.id] ?? ''}</div>
    </div>
  );
}
