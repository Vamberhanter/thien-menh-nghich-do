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
  /** True when the skill tree has not unlocked this kit slot yet. */
  locked?: boolean;
  /** Matching skill-tree node id, when wired from {@link buildCombatKit}. */
  treeId?: string;
}

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

/*
 * Tôn Ngộ Không's kit: four offensive techniques, one per drawn sheet, plus
 * the cloud dash.
 *
 * `recovery` holds him past the end of the clip. It is short for all four,
 * because unlike the other kits the finale is *inside* the animation rather
 * than spawned to outlive it — this is only long enough for the last drawn
 * frame to be read before he stands out of the cast.
 *
 * Four offensive techniques is one more than any other kit carries, and they
 * are individually cheaper and weaker to pay for it: Ma Nguyệt Trảm undercuts
 * Băng Phách Trảm's multiplier, and neither of his two area techniques reaches
 * Băng Tinh Trận's. Having a fourth button does not mean having a third more
 * damage — it means having an answer to a fourth shape of problem.
 */
export const MA_NGUYET_TRAM: SkillDefinition = {
  name: 'Ma Nguyệt Trảm',
  damageMultiplier: 1.9,
  cooldown: 1500,
  spiritCost: 5,
  recovery: 240,
};

/** The fourth: flame rising around him into a demon's face. */
export const PHAN_THIEN_MA_DIEM: SkillDefinition = {
  name: 'Phần Thiên Ma Diễm',
  damageMultiplier: 2.6,
  cooldown: 6800,
  spiritCost: 14,
  recovery: 320,
};

export const CUU_U_NO_DIEM: SkillDefinition = {
  name: 'Cửu U Nộ Diễm',
  damageMultiplier: 3.0,
  cooldown: 5600,
  spiritCost: 12,
  recovery: 300,
};

/**
 * `recovery` here is unusually long, and it is the art that sets it: the five
 * cast frames run 385ms, but the bolt they throw keeps going for another 308
 * and the lance then stands in the air before it fades. At 220 he dropped back
 * to a standing pose while his own beam was still at full brightness. 450 holds
 * the firing pose until the lance starts going out.
 */
export const HANG_MA_CHAN_LOI: SkillDefinition = {
  name: 'Hàng Ma Chân Lôi',
  damageMultiplier: 2.4,
  cooldown: 3800,
  spiritCost: 9,
  recovery: 450,
};

/**
 * No cooldown, because this one is a switch rather than a move: press to get on
 * the cloud, press again to get off. Only taking off costs anything, so the
 * spirit price is what limits how freely he uses it.
 */
export const CAN_DAU_VAN: SkillDefinition = {
  name: 'Cân Đẩu Vân',
  damageMultiplier: 0,
  cooldown: 0,
  spiritCost: 4,
};

export const WUKONG_SKILLS: readonly SkillDefinition[] = [
  CUU_U_NO_DIEM,
  HANG_MA_CHAN_LOI,
  PHAN_THIEN_MA_DIEM,
  MA_NGUYET_TRAM,
  CAN_DAU_VAN,
];

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

/**
 * Kiếm Tiên's kit, read off what the sheets actually draw.
 *
 * Two cycling techniques, two held ultimates and the flight. The two ultimates
 * are one drawn moment each rather than a cycle, so they carry a `recovery`
 * that holds the pose after the single frame — without it they would flash for
 * one tick and snap back to idle, which is not what a held pose is for.
 *
 * Ngự Kiếm Hành costs its spirit once to get on the blade and nothing after,
 * the way Cân Đẩu Vân does: the limit on staying up is how often you pay to
 * get back on, not a timer.
 */
export const THANH_PHONG_TRAM: SkillDefinition = {
  name: 'Thanh Phong Trảm',
  damageMultiplier: 1.7,
  cooldown: 1500,
  spiritCost: 6,
};

export const LAC_ANH_KIEM_QUANG: SkillDefinition = {
  name: 'Lạc Ảnh Kiếm Quang',
  damageMultiplier: 2.5,
  cooldown: 4200,
  spiritCost: 11,
  recovery: 260,
};

/**
 * One frame at 8fps, from `kiemtienAnimations` — the whole of what her sheet
 * draws for this technique.
 */
const VAN_KIEM_POSE_MS = 125;

/**
 * How long Vạn Kiếm Quy Tông takes end to end, and the reason it lives here
 * rather than with the effect that plays it.
 *
 * The hold below is worked back from it, so the two cannot drift apart — and
 * this file is unit-tested in node, where importing anything that pulls in
 * Phaser dies on `window`. The kit table is Phaser-free and stays that way;
 * `WanKiemQuyTongEffect` reads the number from here.
 */
export const WAN_KIEM_SHOW_MS = 1900;

export const VAN_KIEM_QUY_TONG: SkillDefinition = {
  name: 'Vạn Kiếm Quy Tông',
  damageMultiplier: 3.1,
  cooldown: 13000,
  spiritCost: 17,
  /*
   * One drawn frame, so the recovery is what holds the pose — and it has to
   * hold it for the whole technique, not part of it.
   *
   * At 900 the hold ran out at 1025ms against a show of 1900, and she settled
   * back onto the grass with the sword rain still coming down and the giant
   * blade not yet thrown. Worked back from the show instead, so the two cannot
   * drift apart the next time either is tuned.
   *
   * It is a long lock — near two seconds — and that is the trade an ultimate on
   * a thirteen second cooldown makes.
   */
  recovery: WAN_KIEM_SHOW_MS - VAN_KIEM_POSE_MS,
};

export const HUYET_KIEM_SAT: SkillDefinition = {
  name: 'Huyết Kiếm Sát',
  damageMultiplier: 3.4,
  cooldown: 17000,
  spiritCost: 20,
  recovery: 950,
};

export const NGU_KIEM_HANH: SkillDefinition = {
  name: 'Ngự Kiếm Hành',
  damageMultiplier: 0,
  cooldown: 1200,
  spiritCost: 5,
};

export const KIEM_TIEN_SKILLS: readonly SkillDefinition[] = [
  THANH_PHONG_TRAM,
  LAC_ANH_KIEM_QUANG,
  VAN_KIEM_QUY_TONG,
  HUYET_KIEM_SAT,
  NGU_KIEM_HANH,
];

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

export const MIKU_SKILLS: readonly SkillDefinition[] = [
  TINH_MANG_TRAM,
  TINH_KHONG_TRAN,
  AO_ANH_BO,
];

/** Slot indices into `NHU_YEN_SKILLS`, so callers never pass a bare number. */
export const NhuYenSlot = {
  QiSlash: 0,
  IceArray: 1,
  ShadowStep: 2,
  Ultimate: 3,
} as const;

export const HuyetLangSlot = {
  MagmaSlash: 0,
  Roar: 1,
  ShadowStep: 2,
  Ultimate: 3,
} as const;

export const MikuSlot = {
  StarSlash: 0,
  StarArray: 1,
  ShadowStep: 2,
  Ultimate: 3,
} as const;

/**
 * Kiếm Tiên's four techniques and her sword-flight, in the order of the sheets
 * they were drawn on — the same shape as Tôn Ngộ Không, and named the same way
 * for the same reason.
 */
export const KiemTienSlot = {
  Cut: 0,
  Lance: 1,
  Rain: 2,
  Blood: 3,
  Ride: 4,
} as const;

/**
 * Five slots, not three. The order follows the sheets they were drawn on
 * (skill1..skill4), so the HUD reads the same way the art folder does.
 */
export const WukongSlot = {
  Nova: 0,
  Lance: 1,
  Wrath: 2,
  Dragon: 3,
  CloudStep: 4,
} as const;
/** Shared ultimate kit slot index after the three base techniques. */
export const ULTIMATE_SLOT = 3;

export const ATTACK_COOLDOWN = 500;

/** Spirit power regenerated per second while not casting. */
const SPIRIT_REGEN_PER_SECOND = 2;

/**
 * Owns cooldowns, damage math and spirit power. Deliberately free of any
 * Phaser dependency so it can be unit-tested or reused by NPCs.
 *
 * A character may carry several skills, each on its own cooldown but all
 * drawing from one spirit pool. Every skill method takes a slot that defaults
 * to 0, so a one-skill character never has to mention it.
 */
export class CombatSystem {
  private skillDefs: SkillDefinition[];

  private attackReadyAt = 0;
  private readonly skillReadyAt: number[];
  private now = 0;
  private spiritCarry = 0;

  constructor(
    private readonly stats: CharacterStats,
    skills: SkillDefinition | readonly SkillDefinition[],
    private readonly attackCooldown: number = ATTACK_COOLDOWN,
  ) {
    this.skillDefs = Array.isArray(skills) ? [...skills] : [skills as SkillDefinition];
    if (this.skillDefs.length === 0) throw new Error('CombatSystem needs at least one skill');
    this.skillReadyAt = this.skillDefs.map(() => 0);
  }

  get skills(): readonly SkillDefinition[] {
    return this.skillDefs;
  }

  /** Swap kit defs after skill-tree spend / class sync (keeps cooldown clocks). */
  replaceSkills(next: readonly SkillDefinition[]): void {
    if (next.length === 0) throw new Error('CombatSystem needs at least one skill');
    this.skillDefs = [...next];
    while (this.skillReadyAt.length < next.length) this.skillReadyAt.push(0);
    this.skillReadyAt.length = next.length;
  }

  /** The primary skill — what a single-skill character means by "the skill". */
  get skill(): SkillDefinition {
    return this.skillDefs[0];
  }

  skillAt(slot: number): SkillDefinition {
    const skill = this.skillDefs[slot];
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

  /**
   * Both of these answer for a slot the kit may not have.
   *
   * `skillAt` throws, which is right for a caller that is about to fire: a slot
   * that does not exist is a wiring mistake and should say so loudly. But these
   * two are asked every frame from inside the controllers, where a throw does
   * not surface as an error — it unwinds the scene's update and the character
   * simply stops responding, which is how a five-slot kit rebuilt with four
   * entries showed up as "the cloud freezes him" rather than as a stack trace.
   *
   * So a missing slot reads as a skill that cannot be cast and is locked. The
   * button does nothing, the game keeps running, and the mismatch stays visible
   * as a dead key rather than a dead character.
   */
  canCastSkill(slot = 0): boolean {
    const skill = this.skillDefs[slot];
    if (!skill || skill.locked) return false;
    return this.now >= this.skillReadyAt[slot] && this.stats.spiritualPower >= skill.spiritCost;
  }

  isSkillLocked(slot = 0): boolean {
    const skill = this.skillDefs[slot];
    return !skill || Boolean(skill.locked);
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
