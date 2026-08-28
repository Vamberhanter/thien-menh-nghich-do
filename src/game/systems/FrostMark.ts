/**
 * Băng Tâm Quyết, Như Yên's passive: everything she hits accumulates Frost, and
 * the third stack freezes it solid for a moment and makes it take extra damage.
 *
 * One instance per target. Phaser-free — the owner passes the clock in, the same
 * way CombatSystem and ComboChain work.
 */
export const FROST_MAX_STACKS = 3;

/** A stack lapses this long after the last hit that applied one. */
export const FROST_DURATION = 4000;

/** How long a target stays frozen once it hits the third stack. */
export const FROZEN_DURATION = 1700;

/** Extra damage a frozen target takes, as a fraction. */
export const FROZEN_VULNERABILITY = 0.35;

export interface FrostResult {
  stacks: number;
  /** True only on the hit that tipped the target into Frozen. */
  froze: boolean;
}

export class FrostMark {
  private stackCount = 0;
  private lapsesAt = 0;
  private frozenUntil = 0;

  /** Stacks currently held, after letting a lapsed mark expire. */
  stacks(now: number): number {
    this.update(now);
    return this.stackCount;
  }

  frozen(now: number): boolean {
    return now < this.frozenUntil;
  }

  /**
   * Adds Frost. Reaching FROST_MAX_STACKS consumes them all and freezes the
   * target, so a frozen enemy starts building the next mark from zero.
   */
  add(count: number, now: number): FrostResult {
    this.update(now);
    this.stackCount += count;
    this.lapsesAt = now + FROST_DURATION;

    if (this.stackCount >= FROST_MAX_STACKS) {
      this.stackCount = 0;
      this.lapsesAt = 0;
      this.frozenUntil = now + FROZEN_DURATION;
      return { stacks: 0, froze: true };
    }
    return { stacks: this.stackCount, froze: false };
  }

  /** Damage after the frozen bonus. Rounds up so the bonus is never lost. */
  amplify(damage: number, now: number): number {
    return this.frozen(now) ? Math.ceil(damage * (1 + FROZEN_VULNERABILITY)) : damage;
  }

  /**
   * Expires a lapsed mark. Returns true on the frame something changed, so the
   * caller can drop the target's frost tint.
   */
  update(now: number): boolean {
    let changed = false;
    if (this.stackCount > 0 && now >= this.lapsesAt) {
      this.stackCount = 0;
      this.lapsesAt = 0;
      changed = true;
    }
    if (this.frozenUntil > 0 && now >= this.frozenUntil) {
      this.frozenUntil = 0;
      changed = true;
    }
    return changed;
  }
}
