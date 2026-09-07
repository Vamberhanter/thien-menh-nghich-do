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

/**
 * Như Yên of Băng Cung. Lighter per swing than Huyết Lang on purpose: her
 * damage comes from landing the whole three-hit combo and from the Frost it
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

/**
 * Huyết Lang of Tam Thủ Môn. A heavier chassis: more HP and armour, slower
 * stride, a shallower spirit pool because the kit leans on the greatsword
 * chain rather than keeping three ice arts spinning.
 */
export const DEFAULT_HUYET_LANG_STATS: CharacterStats = {
  maxHp: 128,
  hp: 128,
  attack: 17,
  defense: 9,
  speed: 108,
  spiritualPower: 18,
  maxSpiritualPower: 18,
};

/** Miku of Ảo Âm Các — agile, spirit-heavy, lighter hits than Huyết Lang. */
export const DEFAULT_MIKU_STATS: CharacterStats = {
  maxHp: 96,
  hp: 96,
  attack: 14,
  defense: 5,
  speed: 140,
  spiritualPower: 28,
  maxSpiritualPower: 28,
};

/**
 * Kiếm Tiên of Thanh Vân Kiếm Các. A duellist: the single heaviest basic swing
 * in the roster, drawn on all eight headings so it lands where it is aimed, and
 * almost nothing to fall back on when it misses. Her defence is her flight and
 * her reach, not her hide — between Như Yên and Tôn Ngộ Không on health, with a
 * spirit pool deep enough to carry four techniques and Ngự Kiếm Hành.
 */
export const DEFAULT_KIEM_TIEN_STATS: CharacterStats = {
  maxHp: 88,
  hp: 88,
  attack: 16,
  defense: 4,
  speed: 138,
  spiritualPower: 32,
  maxSpiritualPower: 32,
};

/**
 * Tôn Ngộ Không of Hoa Quả Sơn. Built around reach and options rather than
 * around either of the other poles: the lightest armour in the roster, the
 * fastest stride, and by far the deepest spirit pool, because his kit is three
 * techniques and a cloud dash all drawing on it. Squishy on purpose — he is
 * meant to be somewhere else by the time the answer arrives.
 */
export const DEFAULT_WUKONG_STATS: CharacterStats = {
  maxHp: 84,
  hp: 84,
  attack: 14,
  defense: 3,
  speed: 142,
  spiritualPower: 34,
  maxSpiritualPower: 34,
};

/** Unit vector for each facing, used for hitboxes and skill direction. */
export const DIRECTION_VECTORS: Record<Direction, Vector2Like> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Picks the facing from a movement vector. An exact 45° diagonal reads as
 * vertical.
 *
 * The comparison is strict on purpose. With `>=`, horizontal won every tie,
 * which handed it the whole closed band from -45° to +45° — 90° plus both
 * boundaries — while vertical got only what was left open. Walking down and to
 * the right is exactly that boundary, so holding S+D showed the *sideways* walk
 * while the character was plainly moving down the screen. With `>` each axis
 * owns a clean 90°, and the diagonals go to the front and back art.
 *
 * This matters more now than it used to: it decides which drawn row plays, and
 * every kit in the roster has real front and back walk art to show.
 */
export function directionFromVector(vec: Vector2Like, fallback: Direction): Direction {
  if (vec.x === 0 && vec.y === 0) return fallback;
  if (Math.abs(vec.x) > Math.abs(vec.y)) return vec.x > 0 ? 'right' : 'left';
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
