import type { CharacterStats } from '../types';
import {
  DEFAULT_NHU_YEN_STATS,
  DEFAULT_HUYET_LANG_STATS,
  DEFAULT_MIKU_STATS,
  DEFAULT_WUKONG_STATS,
  DEFAULT_KIEM_TIEN_STATS,
} from '../types';
import type { PlayerId } from '../entities/playerHandle';

/** Ranks per cultivation realm (Luyện Khí / Trúc Cơ / Kết Đan). */
export const REALM_SIZE = 9;

/** Absolute cap: three realms × 9 ranks (global levels 1–27). */
export const MAX_LEVEL = REALM_SIZE * 3;

export type CultivationRealm = 'luyen-khi' | 'truc-co' | 'ket-dan';

const REALM_LABEL: Readonly<Record<CultivationRealm, string>> = {
  'luyen-khi': 'Luyện Khí',
  'truc-co': 'Trúc Cơ',
  'ket-dan': 'Kết Đan',
};

/**
 * Base kit per character, and how much attack each rank adds to it.
 *
 * Tables rather than a chain of ternaries: with three kits the conditional form
 * had already stopped saying which character got which number, and a fourth
 * would have been a third nested branch in two separate expressions.
 *
 * Huyết Lang gains the most per rank because his kit is one weapon; Tôn Ngộ
 * Không the least, because his scales off three techniques rather than off the
 * attack stat alone.
 */
const BASE_STATS: Record<PlayerId, CharacterStats> = {
  nhuyen: DEFAULT_NHU_YEN_STATS,
  huyetlang: DEFAULT_HUYET_LANG_STATS,
  miku: DEFAULT_MIKU_STATS,
  wukong: DEFAULT_WUKONG_STATS,
  kiemtien: DEFAULT_KIEM_TIEN_STATS,
};

const ATTACK_PER_RANK: Record<PlayerId, number> = {
  nhuyen: 1.6,
  huyetlang: 2.2,
  miku: 1.8,
  wukong: 1.4,
  // The steepest of the five: one cut per press rather than a chain, so every
  // rank has to make that one cut land harder.
  kiemtien: 2.4,
};

/** XP to leave each global rank. Index 0 is level 1 → 2. Realm peaks need none. */
const LUYEN_KHI_XP: readonly number[] = [50, 80, 120, 180, 260, 360, 480, 620, 0];
const TRUC_CO_XP: readonly number[] = LUYEN_KHI_XP.map((value, index) =>
  index === REALM_SIZE - 1 ? 0 : Math.round(value * 1.4),
);
const KET_DAN_XP: readonly number[] = LUYEN_KHI_XP.map((value, index) =>
  index === REALM_SIZE - 1 ? 0 : Math.round(value * 1.9),
);
const XP_TO_NEXT: readonly number[] = [...LUYEN_KHI_XP, ...TRUC_CO_XP, ...KET_DAN_XP];

export interface ProgressionState {
  level: number;
  xp: number;
}

export interface LevelGain {
  maxHp: number;
  attack: number;
  defense: number;
  maxSpiritualPower: number;
  speed: number;
}

export function realmOf(level: number): CultivationRealm {
  if (level > REALM_SIZE * 2) return 'ket-dan';
  if (level > REALM_SIZE) return 'truc-co';
  return 'luyen-khi';
}

export function realmLevelOf(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  if (clamped > REALM_SIZE * 2) return clamped - REALM_SIZE * 2;
  if (clamped > REALM_SIZE) return clamped - REALM_SIZE;
  return clamped;
}

export function realmName(realm: CultivationRealm): string {
  return REALM_LABEL[realm];
}

export function titleForLevel(level: number): string {
  const realm = realmOf(level);
  const rank = realmLevelOf(level);
  const peak = rank >= REALM_SIZE;
  const base = `${realmName(realm)} ${rank}`;
  return peak ? `${base} · đỉnh` : base;
}

/**
 * Cultivation outside the kit. Phaser-free: the scene feeds it XP and asks
 * for the stats to write onto the living character.
 *
 * Global 1–9 Luyện Khí · 10–18 Trúc Cơ · 19–27 Kết Đan. XP never auto-crosses a
 * realm peak — that requires BreakthroughSystem.
 */
export class Progression {
  level = 1;
  xp = 0;

  get realm(): CultivationRealm {
    return realmOf(this.level);
  }

  get realmLevel(): number {
    return realmLevelOf(this.level);
  }

  get title(): string {
    return titleForLevel(this.level);
  }

  get need(): number {
    return XP_TO_NEXT[this.level - 1] ?? 0;
  }

  /** Absolute end of content (Kết Đan 9). */
  get atCap(): boolean {
    return this.level >= MAX_LEVEL;
  }

  /** Peak of the current realm — further ranks need đột phá, not XP. */
  get atRealmCap(): boolean {
    return this.realmLevel >= REALM_SIZE;
  }

  snapshot(): ProgressionState {
    return { level: this.level, xp: this.xp };
  }

  restore(state: ProgressionState): void {
    this.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(state.level) || 1));
    this.xp = Math.max(0, Math.floor(state.xp) || 0);
  }

  /**
   * Adds XP and returns how many ranks were gained (0 if none). Stops at a
   * realm peak so boss XP cannot skip đột phá into the next realm.
   */
  grant(amount: number): number {
    if (amount <= 0 || this.atCap || this.atRealmCap) return 0;
    this.xp += amount;
    let gained = 0;
    while (!this.atCap && !this.atRealmCap && this.xp >= this.need) {
      this.xp -= this.need;
      this.level += 1;
      gained += 1;
    }
    if (this.atCap || this.atRealmCap) this.xp = 0;
    return gained;
  }

  /** Apply a successful breakthrough into the next global level. */
  applyBreakthrough(toLevel: number): boolean {
    const next = Math.floor(toLevel);
    if (next !== this.level + 1 || next > MAX_LEVEL) return false;
    this.level = next;
    this.xp = 0;
    return true;
  }

  /** Base kit + rank bonuses. Equipment is added by the caller. */
  derive(character: PlayerId, gear: Partial<CharacterStats> = {}): CharacterStats {
    const base = BASE_STATS[character];
    const ranks = this.level - 1;
    const atk = Math.floor(ranks * ATTACK_PER_RANK[character]);
    return {
      maxHp: base.maxHp + ranks * 8 + (gear.maxHp ?? 0),
      hp: base.hp + ranks * 8 + (gear.maxHp ?? 0),
      attack: base.attack + atk + (gear.attack ?? 0),
      defense: base.defense + ranks + (gear.defense ?? 0),
      speed: base.speed + Math.floor(ranks / 2) + (gear.speed ?? 0),
      spiritualPower: base.spiritualPower + ranks * 2 + (gear.maxSpiritualPower ?? 0),
      maxSpiritualPower: base.maxSpiritualPower + ranks * 2 + (gear.maxSpiritualPower ?? 0),
    };
  }
}

/** Writes derived ceilings onto a live stats object. `fill` heals to full. */
export function writeDerived(live: CharacterStats, derived: CharacterStats, fill: boolean): void {
  const hp = fill ? derived.maxHp : Math.min(live.hp, derived.maxHp);
  const sp = fill ? derived.maxSpiritualPower : Math.min(live.spiritualPower, derived.maxSpiritualPower);
  live.maxHp = derived.maxHp;
  live.attack = derived.attack;
  live.defense = derived.defense;
  live.speed = derived.speed;
  live.maxSpiritualPower = derived.maxSpiritualPower;
  live.hp = hp;
  live.spiritualPower = sp;
}
