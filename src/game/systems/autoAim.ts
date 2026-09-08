import type { Vector2Like } from '../types';

/**
 * Pointing a technique at the nearest enemy when the player has not said where.
 *
 * **What problem this solves.** A heading comes from the movement keys, so it
 * can only ever be one of eight. Everything downstream is finer than that —
 * `aimFromVector` keeps a normalised vector, and the lanes, sweeps and
 * projectiles are all resolved along it at whatever angle it holds — so the
 * keyboard, not the game, was the thing rounding every attack to 45°. Aiming at
 * a target instead hands those the true angle.
 *
 * **It only ever fills in an absent decision.** If the player is holding a
 * direction, that direction wins, untouched. Auto-aim replaces the fallback,
 * which until now was "whatever way I happen to be facing" — so it cannot take
 * a shot away from someone who aimed it, and needs no switch to turn off. Let
 * go of the keys and it helps; press one and it is not there.
 *
 * **It does not touch movement.** Only attacks and techniques ask for it. A
 * dash is a decision about where to *go*, and a gap-closer that flung you at
 * whatever happened to be nearest would be the game playing itself.
 *
 * The scene owns the list of what is hostile and registers it here, the way the
 * touch pad and the net gate are reached — a controller has no route to the mob
 * table and should not grow one.
 */

export interface AimTarget {
  readonly x: number;
  readonly y: number;
  /** Corpses are not targets. */
  readonly alive: boolean;
}

type TargetSource = () => Iterable<AimTarget>;

let source: TargetSource | null = null;

/**
 * How far auto-aim will reach, in world px.
 *
 * A little past the longest technique in the game — Lạc Ảnh Kiếm Quang throws
 * its beam 400px — so anything a player could plausibly be swinging at is
 * inside it, and nothing across the map is. Beyond this the shot keeps the
 * facing it would have had.
 */
export const AUTO_AIM_RANGE = 420;

/** The scene hands over whatever is currently hostile; null on teardown. */
export function setAimTargets(next: TargetSource | null): void {
  source = next;
}

/**
 * The heading a technique should take: the player's, if they gave one, else the
 * bearing to the nearest living target, else theirs unchanged.
 */
export function autoAim(from: Vector2Like, steer: Vector2Like): Vector2Like {
  if (steer.x !== 0 || steer.y !== 0) return steer;
  const target = nearestTarget(from);
  if (!target) return steer;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const length = Math.hypot(dx, dy);
  // Standing exactly on it: there is no bearing to give, so keep the facing.
  if (length === 0) return steer;
  return { x: dx / length, y: dy / length };
}

/** Nearest living target within `range`, or null. Squared distances — no roots. */
export function nearestTarget(from: Vector2Like, range = AUTO_AIM_RANGE): AimTarget | null {
  if (!source) return null;
  let best: AimTarget | null = null;
  let bestDistance = range * range;
  for (const target of source()) {
    if (!target.alive) continue;
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const distance = dx * dx + dy * dy;
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = target;
  }
  return best;
}
