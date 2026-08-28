import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import type {
  CharacterChangedPayload,
  ComboStatePayload,
  StatePayload,
  StatsPayload,
} from '../game/events';
import { DEFAULT_NHU_YEN_STATS } from '../game/types';
import type { CharacterState } from '../game/types';
import { HU_VO_KIEM_KHI } from '../game/systems/CombatSystem';
import { LAM_UYEN_PROFILE } from '../game/entities/playerHandle';
import { NHU_YEN_PROFILE } from '../game/entities/NhuYen';

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
};

const HINTS: Record<string, string> = {
  [LAM_UYEN_PROFILE.id]: `WASD di chuyển · J kiếm chiêu · K ${HU_VO_KIEM_KHI.name} · Q đổi nhân vật · H sát thương · R hồi sinh · B gọi lại boss`,
  [NHU_YEN_PROFILE.id]:
    'WASD di chuyển · Shift chạy · J liên chiêu · K Băng Phách Trảm · L Băng Tinh Trận · Space Sương Ảnh Bộ · Q đổi nhân vật · H sát thương · R hồi sinh · B gọi lại boss',
};

const SEGMENTS = 12;

/** Pixel bar drawn from N discrete blocks — no gradients, no smoothing. */
function PixelBar({ value, max, variant }: { value: number; max: number; variant: 'hp' | 'sp' }) {
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
    GameBus.on(GameEvent.SkillRejected, onSkillRejected);
    return () => {
      GameBus.off(GameEvent.StatsChanged, onStats);
      GameBus.off(GameEvent.StateChanged, onState);
      GameBus.off(GameEvent.ComboChanged, onCombo);
      GameBus.off(GameEvent.CharacterChanged, onCharacter);
      GameBus.off(GameEvent.SkillRejected, onSkillRejected);
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
      </div>

      <div className="hud__skills">
        {character.skills.map((skill, i) => (
          <div className="skill" key={skill}>
            <span className="skill__key">{keys[i] ?? '?'}</span>
            <span className="skill__name">{skill}</span>
          </div>
        ))}
      </div>

      {notice && <div className="hud__notice">{notice}</div>}

      <div className="hud__hint">{HINTS[character.id] ?? ''}</div>
    </div>
  );
}
