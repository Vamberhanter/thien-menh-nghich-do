/**
 * The state of a melee combo: which step comes next, and whether the player
 * pressed in time to keep the chain alive.
 *
 * Phaser-free on purpose, like CombatSystem — the only clock it knows about is
 * the `now` its owner passes in.
 */
export interface ComboStep {
  /** Damage as a multiple of the character's attack stat. */
  damageMultiplier: number;
  /** Frost stacks this step leaves on whatever it hits. */
  frost: number;
  /** How far in front of the character the hit lands, in px. */
  reach: number;
  /** Radius of the hit around that point, in px. */
  radius: number;
  /** Knockback applied to the target, in px. */
  knockback: number;
}

export interface ComboHit {
  /** 0-based index into the step list. */
  index: number;
  step: ComboStep;
  /** True when this hit closed the chain — the next press restarts at 0. */
  final: boolean;
}

export class ComboChain {
  /** Step the next press will play. */
  private next = 0;
  /** After this moment the chain has lapsed and the next press restarts it. */
  private windowEndsAt = 0;

  constructor(
    private readonly steps: readonly ComboStep[],
    /** Grace period after a swing ends in which the next press still chains. */
    private readonly windowMs: number,
  ) {
    if (steps.length === 0) throw new Error('ComboChain needs at least one step');
  }

  get length(): number {
    return this.steps.length;
  }

  /** Index the next press would play — for the HUD's combo pips. */
  get pending(): number {
    return this.next;
  }

  /**
   * Advances the chain. Never refuses — deciding whether the character is free
   * to swing at all is the caller's job, because it is the one that knows an
   * animation is still playing. Two independent "too soon" gates is one too
   * many: whichever is stricter silently eats presses the other would allow.
   *
   * `swingMsFor` is asked how long the chosen step runs, so the window can stay
   * open until `windowMs` after the swing ends. It is a callback rather than a
   * number because which step plays is decided in here.
   */
  press(now: number, swingMsFor: (index: number) => number): ComboHit {
    // the window lapsed while we were idle, so this press starts a new chain
    const index = now < this.windowEndsAt ? this.next : 0;
    const step = this.steps[index];

    const final = index >= this.steps.length - 1;
    this.next = final ? 0 : index + 1;
    // a finisher ends the chain outright, so the next press starts from the top
    this.windowEndsAt = final ? 0 : now + swingMsFor(index) + this.windowMs;

    return { index, step, final };
  }

  /** Drops the chain — used when Như Yên is staggered, dashes or casts. */
  reset(): void {
    this.next = 0;
    this.windowEndsAt = 0;
  }

  /**
   * Clears a lapsed chain so `pending` stops pointing mid-combo.
   * Returns true on the frame the chain actually lapsed, so the HUD can refresh.
   */
  update(now: number): boolean {
    if (this.next === 0 || now < this.windowEndsAt) return false;
    this.next = 0;
    this.windowEndsAt = 0;
    return true;
  }
}

/**
 * Hàn Băng Tam Thức — Như Yên's basic chain. Damage is back-loaded so landing
 * the third hit matters, and the finisher carries two Frost stacks, which is
 * exactly enough to freeze a target the first two hits already marked.
 *
 * `reach` and `radius` are generous versus the drawn crescent so a swing
 * still connects when the target is a step off the blade. Inner edges stay
 * near her body — `reach - radius` is a few px — so a target she is standing
 * on is still hit.
 */
export const HAN_BANG_TAM_THUC: readonly ComboStep[] = [
  { damageMultiplier: 0.9, frost: 1, reach: 80, radius: 72, knockback: 0 },
  { damageMultiplier: 1.1, frost: 1, reach: 100, radius: 78, knockback: 4 },
  { damageMultiplier: 1.8, frost: 2, reach: 124, radius: 88, knockback: 14 },
];

/** Grace period for chaining, in ms. Long enough to feel forgiving. */
export const COMBO_WINDOW = 620;

/**
 * Tam Thủ Liệt Trảm — Huyết Lang's greatsword chain. No Frost: the three heads
 * hit harder and shove farther, paying for the missing crowd-control.
 */
export const TAM_THU_LIET_CHAM: readonly ComboStep[] = [
  { damageMultiplier: 1.1, frost: 0, reach: 74, radius: 66, knockback: 6 },
  { damageMultiplier: 1.35, frost: 0, reach: 90, radius: 72, knockback: 10 },
  { damageMultiplier: 2.1, frost: 0, reach: 110, radius: 82, knockback: 22 },
];

/** Tinh Ca Tam Liên — Miku's star-blade chain. */
export const TINH_CA_TAM_LIEN: readonly ComboStep[] = [
  { damageMultiplier: 0.95, frost: 0, reach: 78, radius: 70, knockback: 4 },
  { damageMultiplier: 1.2, frost: 0, reach: 96, radius: 76, knockback: 8 },
  { damageMultiplier: 1.9, frost: 0, reach: 118, radius: 86, knockback: 16 },
];
