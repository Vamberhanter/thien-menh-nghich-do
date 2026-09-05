import type { CharacterStats } from '../types';
import { DEFAULT_LIN_YUAN_STATS, DEFAULT_NHU_YEN_STATS, DEFAULT_HUYET_LANG_STATS, DEFAULT_MIKU_STATS } from '../types';
import type { PlayerId } from '../entities/playerHandle';

/** Slice cap: Luyện Khí 9. Trúc Cơ is named but locked. */
export const MAX_LEVEL = 9;

/** XP to leave each rank. Index 0 is Luyện Khí 1 → 2. Last rank needs none. */
const XP_TO_NEXT: readonly number[] = [50, 80, 120, 180, 260, 360, 480, 620, 0];

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

/**
 * Cultivation outside the kit. Phaser-free: the scene feeds it XP and asks
 * for the stats to write onto the living character.
 */
export class Progression {
  level = 1;
  xp = 0;

  get title(): string {
    return this.level >= MAX_LEVEL ? `Luyện Khí ${this.level} · đỉnh` : `Luyện Khí ${this.level}`;
  }

  get need(): number {
    return XP_TO_NEXT[this.level - 1] ?? 0;
  }

  get atCap(): boolean {
    return this.level >= MAX_LEVEL;
  }

  snapshot(): ProgressionState {
    return { level: this.level, xp: this.xp };
  }

  restore(state: ProgressionState): void {
    this.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(state.level) || 1));
    this.xp = Math.max(0, Math.floor(state.xp) || 0);
  }

  /**
   * Adds XP and returns how many ranks were gained (0 if none). Extra XP
   * past the cap is discarded so a lucky boss kill cannot overflow the slice.
   */
  grant(amount: number): number {
    if (amount <= 0 || this.atCap) return 0;
    this.xp += amount;
    let gained = 0;
    while (!this.atCap && this.xp >= this.need) {
      this.xp -= this.need;
      this.level += 1;
      gained += 1;
    }
    if (this.atCap) this.xp = 0;
    return gained;
  }

  /** Base kit + rank bonuses. Equipment is added by the caller. */
  derive(character: PlayerId, gear: Partial<CharacterStats> = {}): CharacterStats {
    const base =
      character === 'lamuyen'
        ? DEFAULT_LIN_YUAN_STATS
        : character === 'huyetlang'
          ? DEFAULT_HUYET_LANG_STATS
          : character === 'miku'
            ? DEFAULT_MIKU_STATS
            : DEFAULT_NHU_YEN_STATS;
    const ranks = this.level - 1;
    const atk =
      character === 'nhuyen'
        ? Math.floor(ranks * 1.6)
        : character === 'huyetlang'
          ? Math.floor(ranks * 2.2)
          : character === 'miku'
            ? Math.floor(ranks * 1.8)
            : ranks * 2;
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
