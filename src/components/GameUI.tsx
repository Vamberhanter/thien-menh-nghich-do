import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import type {
  CharacterChangedPayload,
  CooldownPayload,
  ComboStatePayload,
  DeathCountdownPayload,
  ProgressionPayload,
  StatePayload,
  StatsPayload,
  ZonePayload,
  PersistPayload,
} from '../game/events';
import type { RosterPayload } from '../net/types';
import { DEFAULT_NHU_YEN_STATS } from '../game/types';
import type { CharacterState } from '../game/types';
import { HU_VO_KIEM_KHI } from '../game/systems/CombatSystem';
import { LAM_UYEN_PROFILE } from '../game/entities/playerHandle';
import { NHU_YEN_PROFILE } from '../game/entities/NhuYen';
import { HUYET_LANG_PROFILE } from '../game/entities/HuyetLang';
import { CHARACTER_NAME } from '../net/types';

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

/** Keys the skill bar labels, in the same slot order each character exposes. */
const SKILL_KEYS: Record<string, readonly string[]> = {
  [LAM_UYEN_PROFILE.id]: ['K'],
  [NHU_YEN_PROFILE.id]: ['K', 'L', 'Space'],
  [HUYET_LANG_PROFILE.id]: ['K', 'L', 'Space'],
};

const HINTS: Record<string, string> = {
  [LAM_UYEN_PROFILE.id]: `WASD di chuyển · J kiếm chiêu · K ${HU_VO_KIEM_KHI.name} · F nhặt / đặt hồi sinh · T dịch chuyển · I túi · Q tại huyết mạch`,
  [NHU_YEN_PROFILE.id]:
    'WASD di chuyển · Shift chạy · J liên chiêu · K / L / Space chiêu · F nhặt / đặt hồi sinh · T dịch chuyển · I túi · Q tại huyết mạch',
  [HUYET_LANG_PROFILE.id]:
    'WASD di chuyển · J liên chiêu · K / L / Space chiêu · F nhặt / đặt hồi sinh · T dịch chuyển · I túi · Q tại huyết mạch',
};

const SEGMENTS = 12;

/** Pixel bar drawn from N discrete blocks — no gradients, no smoothing. */
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

/**
 * Combo pips for Hàn Băng Tam Thức. `pending` is the step the next press would
 * play, so that many pips are already banked and the chain is open; 0 means the
 * chain is closed and the next press starts over.
 *
 * The pip count comes from the character, not from the combo event — see
 * `CharacterChangedPayload.comboSteps`.
 */
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
      reason: 'cooldown' | 'spirit';
    }) => {
      setNotice(reason === 'spirit' ? 'Linh lực không đủ' : `${name} chưa hồi`);
    };

    GameBus.on(GameEvent.StatsChanged, onStats);
    GameBus.on(GameEvent.StateChanged, onState);
    GameBus.on(GameEvent.ComboChanged, onCombo);
    GameBus.on(GameEvent.CharacterChanged, onCharacter);
    const onNotice = (text: string) => {
      if (typeof text === 'string') setNotice(text);
    };
    const onDeath = (payload: DeathCountdownPayload) => setDeath(payload.seconds);
    const onLoot = ({ label }: { label: string | null }) => setLoot(label);
    const onCool = (payload: CooldownPayload) => setCooldowns(payload.skills);
    const onZone = (payload: ZonePayload) => setZone(payload.name);

    GameBus.on(GameEvent.SkillRejected, onSkillRejected);
    GameBus.on(GameEvent.NetRoster, setRoster);
    GameBus.on(GameEvent.Cooldowns, onCool);
    GameBus.on(GameEvent.DeathCountdown, onDeath);
    GameBus.on(GameEvent.Progression, setProgress);
    GameBus.on(GameEvent.ZoneChanged, onZone);
    GameBus.on(GameEvent.LootPrompt, onLoot);
    GameBus.on(GameEvent.Notice, onNotice);
    GameBus.on(GameEvent.Persist, setCloud);
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
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 1200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const keys = SKILL_KEYS[character.id] ?? [];

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
          <div className={`hud__cloud${cloud.remote ? '' : ' is-local'}`}>
            {cloud.remote ? 'Đã lưu database' : 'Chưa lên database'}
          </div>
        )}
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

      {notice && <div className="hud__notice">{notice}</div>}
      {loot && <div className="hud__loot">{loot}</div>}
      {death !== null && (
        <div className="hud__death">
          <div>TỬ VONG</div>
          <div>Tự động hồi sinh sau {death}s</div>
        </div>
      )}

      {roster && roster.world && (
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
      )}

      <div className="hud__hint">{HINTS[character.id] ?? ''}</div>
    </div>
  );
}
