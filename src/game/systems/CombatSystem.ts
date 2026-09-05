import type { CharacterStats } from '../types';

export interface SkillDefinition {
  /** Display name — shown in the HUD and combat log. */
  name: string;
  damageMultiplier: number;
  cooldown: number;
  spiritCost: number;
  /** Frost stacks the skill applies (Như Yên's Băng Tâm Quyết). */
  frost?: number;
  /**
   * Extra ms the caster is held after the cast animation ends, so a skill whose
   * effect outlives its animation does not snap back to idle underneath it.
   */
  recovery?: number;
}

export const HU_VO_KIEM_KHI: SkillDefinition = {
  name: 'Hư Vô Kiếm Khí',
  damageMultiplier: 2.5,
  cooldown: 2000,
  spiritCost: 8,
};

/**
 * Như Yên's three Băng Cung techniques, in slot order (K, L, Space).
 *
 * Sương Ảnh Bộ deals no damage — it is a repositioning tool — but it still runs
 * through the skill slots so it shares one spirit pool and one cooldown model
 * with the rest of the kit.
 */
export const BANG_PHACH_TRAM: SkillDefinition = {
  name: 'Băng Phách Trảm',
  damageMultiplier: 2.2,
  cooldown: 1600,
  spiritCost: 6,
  frost: 2,
};

export const BANG_TINH_TRAN: SkillDefinition = {
  name: 'Băng Tinh Trận',
  damageMultiplier: 3.4,
  cooldown: 5200,
  spiritCost: 12,
  // enough on its own to tip a fresh target straight into Frozen
  frost: 3,
  // She holds the peak of the channel while the array breaks the ground. Long
  // enough to cover the staggered ring (6 x 55ms) plus most of the last
  // pillar's own animation, so the technique finishes before she stands up.
  recovery: 560,
};

export const SUONG_ANH_BO: SkillDefinition = {
  name: 'Sương Ảnh Bộ',
  damageMultiplier: 0,
  cooldown: 900,
  spiritCost: 4,
};

export const HUYET_DIEM_TRAM: SkillDefinition = {
  name: 'Huyết Diễm Trảm',
  damageMultiplier: 2.2,
  cooldown: 1600,
  spiritCost: 6,
};

export const TAM_THU_HONG: SkillDefinition = {
  name: 'Tam Thủ Hống',
  damageMultiplier: 3.4,
  cooldown: 5200,
  spiritCost: 12,
  recovery: 560,
};

export const LIET_ANH_BO: SkillDefinition = {
  name: 'Liệt Ảnh Bộ',
  damageMultiplier: 0,
  cooldown: 900,
  spiritCost: 4,
};

export const NHU_YEN_SKILLS: readonly SkillDefinition[] = [
  BANG_PHACH_TRAM,
  BANG_TINH_TRAN,
  SUONG_ANH_BO,
];

export const HUYET_LANG_SKILLS: readonly SkillDefinition[] = [
  HUYET_DIEM_TRAM,
  TAM_THU_HONG,
  LIET_ANH_BO,
];

/** Slot indices into `NHU_YEN_SKILLS`, so callers never pass a bare number. */
export const NhuYenSlot = {
  QiSlash: 0,
  IceArray: 1,
  ShadowStep: 2,
} as const;

export const HuyetLangSlot = {
  MagmaSlash: 0,
  Roar: 1,
  ShadowStep: 2,
} as const;

export const TINH_MANG_TRAM: SkillDefinition = {
  name: 'Tinh Mang Trảm',
  damageMultiplier: 2.2,
  cooldown: 1600,
  spiritCost: 6,
};

export const TINH_KHONG_TRAN: SkillDefinition = {
  name: 'Tinh Không Trận',
  damageMultiplier: 3.4,
  cooldown: 5200,
  spiritCost: 12,
  recovery: 560,
};

export const AO_ANH_BO: SkillDefinition = {
  name: 'Ảo Ảnh Bộ',
  damageMultiplier: 0,
  cooldown: 900,
  spiritCost: 4,
};

export const MIKU_SKILLS: readonly SkillDefinition[] = [
  TINH_MANG_TRAM,
  TINH_KHONG_TRAN,
  AO_ANH_BO,
];

export const MikuSlot = {
  StarSlash: 0,
  StarArray: 1,
  ShadowStep: 2,
} as const;

export const ATTACK_COOLDOWN = 500;

/** Spirit power regenerated per second while not casting. */
const SPIRIT_REGEN_PER_SECOND = 2;

/**
 * Owns cooldowns, damage math and spirit power. Deliberately free of any
 * Phaser dependency so it can be unit-tested or reused by NPCs.
 *
 * A character may carry several skills, each on its own cooldown but all
 * drawing from one spirit pool. Every skill method takes a slot that defaults
 * to 0, so a one-skill character (Lâm Uyên) never has to mention it.
 */
export class CombatSystem {
  readonly skills: readonly SkillDefinition[];

  private attackReadyAt = 0;
  private readonly skillReadyAt: number[];
  private now = 0;
  private spiritCarry = 0;

  constructor(
    private readonly stats: CharacterStats,
    skills: SkillDefinition | readonly SkillDefinition[] = HU_VO_KIEM_KHI,
    private readonly attackCooldown: number = ATTACK_COOLDOWN,
  ) {
    this.skills = Array.isArray(skills) ? skills : [skills as SkillDefinition];
    if (this.skills.length === 0) throw new Error('CombatSystem needs at least one skill');
    this.skillReadyAt = this.skills.map(() => 0);
  }

  /** The primary skill — what a single-skill character means by "the skill". */
  get skill(): SkillDefinition {
    return this.skills[0];
  }

  skillAt(slot: number): SkillDefinition {
    const skill = this.skills[slot];
    if (!skill) throw new Error(`no skill in slot ${slot}`);
    return skill;
  }

  /** Advance internal clocks; call once per frame from the scene/controller. */
  update(time: number, delta: number): boolean {
    this.now = time;
    if (this.stats.spiritualPower >= this.stats.maxSpiritualPower) {
      this.spiritCarry = 0;
      return false;
    }
    this.spiritCarry += (delta / 1000) * SPIRIT_REGEN_PER_SECOND;
    const whole = Math.floor(this.spiritCarry);
    if (whole <= 0) return false;
    this.spiritCarry -= whole;
    this.stats.spiritualPower = Math.min(
      this.stats.maxSpiritualPower,
      this.stats.spiritualPower + whole,
    );
    return true;
  }

  canAttack(): boolean {
    return this.now >= this.attackReadyAt;
  }

  /** Consumes the attack cooldown and returns the damage dealt. */
  beginAttack(): number {
    this.attackReadyAt = this.now + this.attackCooldown;
    return this.stats.attack;
  }

  canCastSkill(slot = 0): boolean {
    const skill = this.skillAt(slot);
    return this.now >= this.skillReadyAt[slot] && this.stats.spiritualPower >= skill.spiritCost;
  }

  hasSpiritFor(skill: SkillDefinition = this.skill): boolean {
    return this.stats.spiritualPower >= skill.spiritCost;
  }

  /** Consumes cooldown + spirit power and returns the damage dealt. */
  beginSkill(slot = 0): number {
    const skill = this.skillAt(slot);
    this.skillReadyAt[slot] = this.now + skill.cooldown;
    this.stats.spiritualPower = Math.max(0, this.stats.spiritualPower - skill.spiritCost);
    return Math.round(this.stats.attack * skill.damageMultiplier);
  }

  /** Damage a multiplier would deal right now, without touching cooldowns. */
  scaleDamage(multiplier: number): number {
    return Math.max(1, Math.round(this.stats.attack * multiplier));
  }

  /** Defense soak; a hit always costs at least 1 HP. */
  resolveIncoming(rawDamage: number): number {
    return Math.max(1, Math.round(rawDamage - this.stats.defense));
  }

  /** 0 = ready, 1 = just used. Handy for cooldown pips in the HUD. */
  attackCooldownRatio(): number {
    return cooldownRatio(this.attackReadyAt, this.now, this.attackCooldown);
  }

  skillCooldownRatio(slot = 0): number {
    return cooldownRatio(this.skillReadyAt[slot], this.now, this.skillAt(slot).cooldown);
  }
}

function cooldownRatio(readyAt: number, now: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, (readyAt - now) / duration));
}
