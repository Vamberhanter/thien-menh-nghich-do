export type Direction = 'down' | 'up' | 'left' | 'right';

export type CharacterState =
  | 'idle'
  | 'walk'
  /** Sprinting. Only Như Yên's sheet has the stride art for it. */
  | 'run'
  | 'attack'
  | 'skill'
  /** Short invulnerable lunge — Như Yên's Sương Ảnh Bộ. */
  | 'dash'
  | 'hurt'
  | 'dead';

export interface CharacterStats {
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  spiritualPower: number;
  /** Ceiling for spiritualPower — the UI renders SP as current/max. */
  maxSpiritualPower: number;
}

export interface Vector2Like {
  x: number;
  y: number;
}

export const DEFAULT_LIN_YUAN_STATS: CharacterStats = {
  maxHp: 100,
  hp: 100,
  attack: 15,
  defense: 5,
  speed: 140,
  spiritualPower: 20,
  maxSpiritualPower: 20,
};

/**
 * Như Yên of Băng Cung. Lighter and weaker per swing than Lâm Uyên on purpose:
 * her damage comes from landing the whole three-hit combo and from the Frost it
 * leaves on the target, and she needs a deeper spirit pool to keep three skills
 * running instead of one.
 */
export const DEFAULT_NHU_YEN_STATS: CharacterStats = {
  maxHp: 92,
  hp: 92,
  attack: 13,
  defense: 4,
  speed: 132,
  spiritualPower: 26,
  maxSpiritualPower: 26,
};

/** Unit vector for each facing, used for hitboxes and skill direction. */
export const DIRECTION_VECTORS: Record<Direction, Vector2Like> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Picks the facing from a movement vector; horizontal wins on a tie. */
export function directionFromVector(vec: Vector2Like, fallback: Direction): Direction {
  if (vec.x === 0 && vec.y === 0) return fallback;
  if (Math.abs(vec.x) >= Math.abs(vec.y)) return vec.x > 0 ? 'right' : 'left';
  return vec.y > 0 ? 'down' : 'up';
}

/**
 * Where an action is *aimed*, as a unit vector — which is a different question
 * from which way the sprite faces.
 *
 * `Direction` has to stay four-way because that is all the art has: four idle
 * views, three walk views, one attack view. But nothing forces the hitboxes,
 * projectiles and effects to be that coarse. Keeping the aim as a vector lets
 * a diagonal press throw the qi diagonally while the sprite plays the nearest
 * drawn facing, so all eight keyboard headings actually fight.
 *
 * A keyboard can only express eight headings anyway, so normalising the raw
 * input axis *is* the eight-way snap — there is nothing extra to quantise.
 */
export function aimFromVector(vec: Vector2Like, fallback: Vector2Like): Vector2Like {
  const length = Math.hypot(vec.x, vec.y);
  if (length === 0) return fallback;
  return { x: vec.x / length, y: vec.y / length };
}

/** Screen angle of an aim vector in degrees — for rotating effect sprites. */
export function aimAngle(aim: Vector2Like): number {
  return (Math.atan2(aim.y, aim.x) * 180) / Math.PI;
}
