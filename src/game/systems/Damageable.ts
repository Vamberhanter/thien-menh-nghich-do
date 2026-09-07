import type { Vector2Like } from '../types';

/**
 * One hit, from either side of the fight.
 *
 * Players and enemies deal damage through the same struct so a scene resolves
 * both with one code path: before this existed the scene only knew how to
 * damage training stones, and a boss would have needed a second, parallel
 * implementation of ranges, Frost and knockback.
 */
export interface HitInfo {
  damage: number;
  /** Unit vector the hit came from — knockback and effect rotation read it. */
  aim: Vector2Like;
  /** Frost stacks applied (Như Yên's kit); 0 for everyone else. */
  frost?: number;
  /** Push in px along `aim`; 0 for a hit that should not move the target. */
  knockback?: number;
  /** Colour for the floating number. */
  tint?: number;
  /** Who threw it, so a hit can never damage its own side. */
  side: 'player' | 'enemy';
  /**
   * A guest replaying its own swing before the host has confirmed it. The
   * target flinches and its bar drops, but it can never take the last hit
   * point — only the host is allowed to decide something died.
   */
  predicted?: boolean;
}

/**
 * Anything a hit can land on: training stones, the boss, later the player too.
 *
 * `hitPoint` is deliberately not the sprite's origin. Ranges are measured on the
 * ground plane against where the target actually stands, which for a tall sprite
 * is nowhere near the middle of its art.
 */
export interface Damageable {
  readonly alive: boolean;
  hitPoint(): Vector2Like;
  /** Radius of the target's own footprint, so big targets are easier to hit. */
  hitRadius(): number;
  applyHit(hit: HitInfo): void;
}

/** Distance from a point to a segment — used by sweeping and piercing hits. */
export function distanceToSegment(
  point: Vector2Like,
  a: Vector2Like,
  b: Vector2Like,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}
