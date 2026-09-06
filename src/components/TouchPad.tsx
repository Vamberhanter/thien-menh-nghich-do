import { useEffect, useRef, useState, type PointerEvent as ReactPointer } from 'react';
import { GameBus, GameEvent } from '../game/events';
import type { CharacterChangedPayload, CooldownPayload } from '../game/events';
import { NHU_YEN_PROFILE } from '../game/entities/NhuYen';
import {
  itemOf,
  type InventoryState,
} from '../game/systems/Inventory';
import {
  prefersTouchUi,
  pressPad,
  resetPadMove,
  setPadMove,
  writeTouchPadForced,
  type PadAction,
} from '../game/touchPad';

const STICK_RADIUS = 58;
const DEADZONE = 10;
const SPRINT_AT = 0.74;

const SKILL_SHORT: Record<string, string> = {
  'Hư Vô Kiếm Khí': 'Kiếm',
  'Phá Không': 'Phá',
  'Ngự Kiếm Bộ': 'Lướt',
  'Vạn Kiếm Quy Tông': 'Vạn',
  'Băng Phách Trảm': 'Phách',
  'Băng Tinh Trận': 'Trận',
  'Sương Ảnh Bộ': 'Ảnh',
  'Thiên Lý Băng Phong': 'Băng',
  'Huyết Diễm Trảm': 'Huyết',
  'Tam Thủ Hồng': 'Hồng',
  'Liệt Ảnh Bộ': 'Xung',
  'Ma Thần Giáng Thế': 'Ma',
  'Tinh Mang Trảm': 'Tinh',
  'Tinh Không Trận': 'Không',
  'Ảo Ảnh Bộ': 'Ảo',
  'Vạn Âm Triệu Tông': 'Âm',
};

const SKILL_KEYS = ['K', 'L', 'Space', 'U'] as const;

interface Stick {
  originX: number;
  originY: number;
  thumbX: number;
  thumbY: number;
}

export function TouchPad() {
  const [show, setShow] = useState(prefersTouchUi);
  const [character, setCharacter] = useState<CharacterChangedPayload>({ ...NHU_YEN_PROFILE });
  const [cooldowns, setCooldowns] = useState<readonly number[]>([]);
  const [loot, setLoot] = useState(false);
  const [stick, setStick] = useState<Stick | null>(null);
  const [potion, setPotion] = useState({ hp: 0, sp: 0 });
  const pointer = useRef<number | null>(null);
  const stickRef = useRef<Stick | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('is-touch', show);
    window.dispatchEvent(new Event('resize'));
    return () => document.documentElement.classList.remove('is-touch');
  }, [show]);

  useEffect(() => {
    const onLoot = ({ label }: { label: string | null }) => setLoot(Boolean(label));
    const onCool = (payload: CooldownPayload) => setCooldowns(payload.skills);
    const onInv = (next: InventoryState) => {
      if (!next?.bag) return;
      let hp = 0;
      let sp = 0;
      next.bag.forEach((id, index) => {
        const item = itemOf(id);
        if (!item || item.kind !== 'consumable') return;
        const qty = Math.max(1, next.quantities?.[index] ?? 1);
        if (item.restoreHp) hp += qty;
        if (item.restoreSp) sp += qty;
      });
      setPotion({ hp, sp });
    };
    GameBus.on(GameEvent.CharacterChanged, setCharacter);
    GameBus.on(GameEvent.Cooldowns, onCool);
    GameBus.on(GameEvent.LootPrompt, onLoot);
    GameBus.on(GameEvent.Inventory, onInv);
    return () => {
      GameBus.off(GameEvent.CharacterChanged, setCharacter);
      GameBus.off(GameEvent.Cooldowns, onCool);
      GameBus.off(GameEvent.LootPrompt, onLoot);
      GameBus.off(GameEvent.Inventory, onInv);
    };
  }, []);

  const toggle = () => {
    setShow((on) => {
      const next = !on;
      writeTouchPadForced(next);
      if (!next) resetPadMove();
      return next;
    });
  };

  const onStickDown = (event: ReactPointer) => {
    if (pointer.current !== null) return;
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const next = { originX: x, originY: y, thumbX: x, thumbY: y };
    stickRef.current = next;
    setStick(next);
    setPadMove(0, 0, false);
  };

  const onStickMove = (event: ReactPointer) => {
    const held = stickRef.current;
    if (pointer.current !== event.pointerId || !held) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - held.originX;
    const dy = y - held.originY;
    const length = Math.hypot(dx, dy);
    const clamped = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
    const tx = held.originX + dx * clamped;
    const ty = held.originY + dy * clamped;
    const next = { originX: held.originX, originY: held.originY, thumbX: tx, thumbY: ty };
    stickRef.current = next;
    setStick(next);
    if (length < DEADZONE) {
      setPadMove(0, 0, false);
      return;
    }
    setPadMove((dx * clamped) / STICK_RADIUS, (dy * clamped) / STICK_RADIUS, length / STICK_RADIUS >= SPRINT_AT);
  };

  const onStickUp = (event: ReactPointer) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    stickRef.current = null;
    setStick(null);
    resetPadMove();
  };

  const tap = (action: PadAction) => (event: ReactPointer) => {
    event.preventDefault();
    event.stopPropagation();
    pressPad(action);
  };

  const usePotion = (kind: 'hp' | 'sp') => (event: ReactPointer) => {
    event.preventDefault();
    event.stopPropagation();
    GameBus.emit(GameEvent.InventoryCommand, { action: 'use-quick', kind });
  };

  return (
    <div className={`pad${show ? ' is-on' : ''}`}>
      <button type="button" className="pad__toggle" onClick={toggle}>
        {show ? 'Ẩn nút' : 'Hiện nút'}
      </button>

      {show && (
        <>
          <div
            className="pad__move"
            onPointerDown={onStickDown}
            onPointerMove={onStickMove}
            onPointerUp={onStickUp}
            onPointerCancel={onStickUp}
          >
            <div
              className={`pad__base${stick ? ' is-held' : ''}`}
              style={
                stick
                  ? { left: stick.originX, top: stick.originY, transform: 'translate(-50%, -50%)' }
                  : undefined
              }
            >
              {stick && (
                <span
                  className="pad__thumb"
                  style={{
                    left: stick.thumbX - stick.originX + STICK_RADIUS,
                    top: stick.thumbY - stick.originY + STICK_RADIUS,
                  }}
                />
              )}
            </div>
          </div>

          <div className="pad__skills">
            <div className="pad__utilities">
              <button type="button" className="pad__util" onPointerDown={tap('bag')} title="Túi đồ">
                Tui
              </button>
              <button
                type="button"
                className={`pad__util${loot ? ' is-hot' : ''}`}
                onPointerDown={tap('pick')}
                title="Nhặt đồ"
              >
                Nhat
              </button>
              <button type="button" className="pad__util" onPointerDown={tap('envArt')} title="Đổi nền cảnh">
                Nen
              </button>
            </div>

            <div className="pad__potions">
              <button
                type="button"
                className={`pad__potion pad__potion--hp${potion.hp ? '' : ' is-empty'}`}
                onPointerDown={usePotion('hp')}
                title="Hồi máu"
              >
                <em>Máu</em>
                <span>×{potion.hp}</span>
              </button>
              <button
                type="button"
                className={`pad__potion pad__potion--sp${potion.sp ? '' : ' is-empty'}`}
                onPointerDown={usePotion('sp')}
                title="Hồi linh lực"
              >
                <em>Linh</em>
                <span>×{potion.sp}</span>
              </button>
            </div>

            <button type="button" className="pad__atk" onPointerDown={tap('attack')}>Đánh</button>

            {character.skills.map((skill, i) => (
              <button
                type="button"
                key={`${skill}-${i}`}
                className={`pad__skill pad__skill--${i}`}
                onPointerDown={tap((`skill${i}`) as PadAction)}
                title={skill}
              >
                <em>{shortSkill(skill)}</em>
                <span>{SKILL_KEYS[i] ?? String(i + 1)}</span>
                {(cooldowns[i] ?? 0) > 0.02 && (
                  <i className="pad__cd" style={{ height: `${Math.round(cooldowns[i] * 100)}%` }} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function shortSkill(name: string): string {
  return SKILL_SHORT[name] ?? name.slice(0, 2);
}