import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';
import type { Direction, Vector2Like } from '../types';

/**
 * Texture key + clips for Kiếm Tiên.
 *
 * Built from seven sheets by `npm run build:kiemtien`. Frames are variable-size
 * with a feet pivot, same geometry as the other kits, so a sprite's own position
 * is the point it stands on.
 *
 * Almost nothing here is mirrored. The other kits draw one profile and flip it,
 * which is why their clips read `_side`; every facing of this one was drawn
 * out, and a mirror would move the sword to the wrong hand.
 *
 * Two things mirror, which is why `ClipRef` still carries `flip`, and both are
 * the art being short of a left rather than a decision:
 *
 *  * **The sword-flight.** Its sheet has an up row, a down row and *two* side
 *    rows that are the same heading rather than a left and a right — 29.5/255
 *    apart as drawn against 58.3 mirrored — so they are one twelve-frame loop
 *    and there is no left drawing to use.
 *  * **Thanh Phong Trảm to the left.** Its sheet captions a row Trái and then
 *    draws it facing right; see `KiemTienClip.skill1`.
 *
 * Both are poses where the mirror does not read as the wrong hand — lying
 * along the blade is near enough symmetric, and the cut is a two-handed sweep.
 */
export const KIEMTIEN_TEXTURE = 'kiemtien';

/**
 * The art is baked larger than the world it is drawn into.
 *
 * Her walk frame stands 189px of solid pixels tall where Như Yên is 121 and
 * Huyết Lang 118; dividing by this lands her at 118, the same height as the
 * people she walks beside. Applied as a world scale on the sprite rather than
 * by resampling the atlas, so the frames keep every pixel the artist drew.
 */
export const KIEMTIEN_ART_SCALE = 1.6;

/**
 * How much each sheet has to be resized to make her one person.
 *
 * The nine sheets were not drawn to a common scale — each packs a different
 * number of rows into the same 1536x1024, and the artist filled the row it got.
 * She stands 185px tall walking, 96px swinging and 251px being staggered, so a
 * single art scale made her shrink whenever she attacked, cast or flew and
 * swell whenever she was hit. The walk is the reference because it is what she
 * spends most of her time doing.
 *
 * Measured on her head rather than her height: the flight poses kneel and lie
 * along the blade, so head-to-heel is not comparable between them, while the
 * head is the same head in every drawing.
 *
 * The two ultimates need far less than the rest (1.12 and 1.28) — the character
 * is small in those frames because the technique around her is enormous, which
 * is the drawing doing its job. Correcting them to match the walk would have
 * scaled the effect up with her and filled the screen; these numbers put *her*
 * right and leave the effect close to as drawn.
 */
const CLIP_SCALE: Record<string, number> = {
  atk: 1.9,
  skill1: 1.3,
  skill2: 1.5,
  skill3: 1.12,
  skill4: 1.28,
  fly_up: 1.7,
  fly_down: 1.7,
  fly_side: 1.8,
  hurt: 0.82,
  death: 0.88,
};
const kiemtienAtlas = remoteAtlas(
  'characters/kiemtien/atlas/kiemtien.json',
  'characters/kiemtien/atlas',
);
export const KIEMTIEN_ATLAS_URL = kiemtienAtlas.url;
export const KIEMTIEN_ATLAS_PATH = kiemtienAtlas.path;
export const KIEMTIEN_ATLAS_LOCAL_URL = kiemtienAtlas.localUrl;
export const KIEMTIEN_ATLAS_LOCAL_PATH = kiemtienAtlas.localPath;

interface ClipSpec {
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

const FOUR: readonly Direction[] = ['up', 'down', 'left', 'right'];

/**
 * The swing is drawn on eight headings, the walk on four.
 *
 * Same split as Tôn Ngộ Không, and for the same reason: movement art is
 * four-way, so `Direction` is, but a swing aimed into a corner has its own
 * picture and should use it. The difference is that his diagonals live across
 * three sheets and half of them mirror; all eight of these were drawn out, so
 * `headingOf` picks one of eight and nothing flips.
 */
export type Heading = Direction | 'upleft' | 'upright' | 'downleft' | 'downright';

const EIGHT: readonly Heading[] = [...FOUR, 'upleft', 'upright', 'downleft', 'downright'];

/**
 * Timings, and what sets them.
 *
 * The swing runs 8 frames at 16, which is 500ms — exactly `ATTACK_COOLDOWN`, so
 * the chain reads as continuous rather than as a pose waiting for the cooldown
 * to catch up. The two cycling skills are a little slower per frame because
 * their last frames are the effect landing rather than the character moving.
 *
 * `skill3` and `skill4` are one frame each: the sheets hold a single drawn
 * moment per heading rather than a cycle. They are declared as animations
 * anyway so a caller can `play()` them like anything else, and the entity
 * decides how long the pose is held.
 */
const CLIPS: readonly ClipSpec[] = [
  ...FOUR.map((dir) => ({ clip: `idle_${dir}`, frames: 4, frameRate: 4, repeat: -1 })),
  ...FOUR.map((dir) => ({ clip: `walk_${dir}`, frames: 8, frameRate: 10, repeat: -1 })),
  ...EIGHT.map((dir) => ({ clip: `atk_${dir}`, frames: 8, frameRate: 16, repeat: 0 })),
  ...FOUR.map((dir) => ({ clip: `skill1_${dir}`, frames: 7, frameRate: 14, repeat: 0 })),
  // Eight frames aimed up or down, five aimed sideways — the sheet draws it
  // that way, and the ray needs more room across the cell than the eight
  // vertical poses left it. Same duration either way: the sideways cast runs
  // slower per frame so both take about half a second.
  { clip: 'skill2_up', frames: 8, frameRate: 14, repeat: 0 },
  // Seven, not eight: the downward row has a cell the artist left her out of,
  // and the cutter drops it rather than let her blink out mid-cast. Slightly
  // slower so the cast still takes about as long as the upward one.
  { clip: 'skill2_down', frames: 7, frameRate: 12, repeat: 0 },
  { clip: 'skill2_left', frames: 5, frameRate: 9, repeat: 0 },
  { clip: 'skill2_right', frames: 4, frameRate: 8, repeat: 0 },
  // 8fps rather than 1: these are single frames, and the rate is what decides
  // how long the clip claims to run. At 1fps each claimed a full second, which
  // `castHoldUntil` then added its recovery on top of — nearly two seconds
  // rooted for one drawn pose. The clip is now brief and the recovery owns the
  // hold, which is what the recovery is for.
  ...FOUR.map((dir) => ({ clip: `skill3_${dir}`, frames: 1, frameRate: 8, repeat: 0 })),
  ...FOUR.map((dir) => ({ clip: `skill4_${dir}`, frames: 1, frameRate: 8, repeat: 0 })),

  // Flight loops slowly on purpose: it is a glide, not a run. The side cycle is
  // twice the frames for about the same period.
  { clip: 'fly_up', frames: 6, frameRate: 10, repeat: -1 },
  { clip: 'fly_down', frames: 6, frameRate: 10, repeat: -1 },
  { clip: 'fly_side', frames: 12, frameRate: 12, repeat: -1 },

  // The stagger is quick enough to interrupt; the death is not meant to be.
  { clip: 'hurt', frames: 6, frameRate: 14, repeat: 0 },
  { clip: 'death', frames: 12, frameRate: 9, repeat: 0 },
];

const PREFIX = 'kiemtien-';
const key = (clip: string) => `${PREFIX}${clip}`;

export interface ClipRef {
  key: string;
  flip: boolean;
}

export const clipNameOf = (ref: ClipRef): string => ref.key.slice(PREFIX.length);

const spec = (clip: string): ClipSpec => {
  const found = CLIPS.find((c) => c.clip === clip);
  if (!found) throw new Error(`unknown Kiếm Tiên clip "${clip}"`);
  return found;
};

/** Every facing is drawn, so nothing here mirrors. */
const drawn = (action: string, dir: Heading): ClipRef => ({
  key: key(`${action}_${dir}`),
  flip: false,
});

/**
 * Half-width of a diagonal octant as a unit-vector component: an aim counts as
 * diagonal once *both* axes clear sin(22.5°), which is exactly the 45° wedge
 * around each corner.
 */
const DIAGONAL = Math.sin(Math.PI / 8);

/** Eight-way heading from the aim vector, falling back on the facing. */
export function headingOf(direction: Direction, aim?: Vector2Like): Heading {
  if (!aim || (aim.x === 0 && aim.y === 0)) return direction;
  const { x, y } = aim;
  if (Math.abs(x) > DIAGONAL && Math.abs(y) > DIAGONAL) {
    return `${y < 0 ? 'up' : 'down'}${x < 0 ? 'left' : 'right'}` as Heading;
  }
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

export const KiemTienClip = {
  idle: (direction: Direction): ClipRef => drawn('idle', direction),
  move: (direction: Direction): ClipRef => drawn('walk', direction),

  /** `aim` picks one of the eight drawn swings; the facing is the fallback. */
  attack: (direction: Direction, aim?: Vector2Like): ClipRef =>
    drawn('atk', headingOf(direction, aim)),

  /**
   * Thanh Phong Trảm, and the one row on any of these sheets whose caption
   * lies about it.
   *
   * The skill1 sheet labels its four rows Lên / Xuống / Trái / Phải, and the
   * cutter takes those at their word — but the Trái row is *drawn facing
   * right*, same as the Phải row beside it. Played as-is, casting to the left
   * turned her to the right. Mirroring that row puts her the way the caption
   * always claimed, and keeps it as its own drawing rather than throwing it
   * away for a mirror of Phải.
   *
   * Skill 2's sideways rows have the same fault and the same fix. The swing,
   * both ultimates and the walk were each checked against their own art and
   * face where they say.
   */
  skill1: (direction: Direction): ClipRef =>
    direction === 'left'
      ? { key: key('skill1_left'), flip: true }
      : drawn('skill1', direction),
  /**
   * Lạc Ảnh Kiếm Quang — a ray of sword-qi thrown out along the aim.
   *
   * Its sideways rows have the same mislabelling as skill1: the sheet captions
   * one Trái and draws it firing right, so the left cast is mirrored. Up and
   * down are drawn as they say and are left alone.
   */
  skill2: (direction: Direction): ClipRef =>
    direction === 'left'
      ? { key: key('skill2_left'), flip: true }
      : drawn('skill2', direction),
  skill3: (direction: Direction): ClipRef => drawn('skill3', direction),
  skill4: (direction: Direction): ClipRef => drawn('skill4', direction),

  /**
   * Riding the sword. Up and down are drawn; sideways exists only facing right,
   * so left is that same loop mirrored — the only flip in this kit.
   */
  fly: (direction: Direction): ClipRef =>
    direction === 'up' || direction === 'down'
      ? drawn('fly', direction)
      : { key: key('fly_side'), flip: direction === 'left' },

  hurt: (): ClipRef => ({ key: key('hurt'), flip: false }),
  death: (): ClipRef => ({ key: key('death'), flip: false }),
} as const;

/**
 * Loose impact art, cut from the extras sheet and numbered by position.
 *
 * Twelve frames: some are the character mid-cast at an angle the skill sheets
 * do not cover, the rest are detached bursts with nobody in them. Nothing on
 * the sheet says what order they belong in, so they are exposed as frames
 * rather than guessed into an animation — pick the ones a technique needs and
 * declare a clip for them then.
 */
export const KIEMTIEN_FX_FRAMES = 12;
export const kiemtienFxFrame = (index: number): string => `fx_${index}`;

/**
 * The flight sheet's last row, same treatment: 0-1 are the take-off charge,
 * 2-3 the landing, 4-6 the sword-light burning off the ground behind her.
 * Grouped by eye, not by anything the sheet declares, so they stay frames until
 * a take-off and a landing clip are actually wanted.
 */
export const KIEMTIEN_FLYFX_FRAMES = 7;
export const kiemtienFlyFxFrame = (index: number): string => `flyfx_${index}`;

/**
 * The frame a clip's damage lands on, 1-based the way Phaser numbers them.
 *
 * Read off the art rather than split down the middle: the swing's arc is at its
 * widest on beat 5 of 8 and beats 7-8 are the blade coming back, so resolving
 * at the midpoint would hit before the edge arrives. Both cycling techniques
 * land late because their last frames *are* the effect — skill2's whole point
 * is the burst it ends on. The two held ultimates have one frame, so they land
 * on it.
 */
const IMPACT_FRAME: Record<string, number> = {
  skill1: 5,
  // Eight frames aimed up or down, with the ray at full reach on 6. The
  // sideways rows are only five frames long, so they land on 4 — asking for a
  // 6th there asks for a frame that never arrives, and the hit would never
  // resolve at all.
  skill2_up: 6,
  // One earlier than the upward cast, because the frame that was dropped sat
  // before this one — the beam is at the same point in the motion.
  skill2_down: 5,
  skill2_left: 4,
  skill2_right: 3,
  skill3: 1,
  skill4: 1,
};

/**
 * Per-clip size correction, to be divided by {@link KIEMTIEN_ART_SCALE} before
 * it reaches the sprite. 1 for the walk and the idle, which are the reference.
 */
export function clipScaleOf(ref: ClipRef): number {
  const name = clipNameOf(ref);
  if (name.startsWith('atk_')) return CLIP_SCALE.atk;
  // Whole name first: `fly_up` and `fly_down` are their own entries, and
  // stripping the facing off them would look up a `fly` that does not exist.
  return CLIP_SCALE[name] ?? CLIP_SCALE[name.replace(/_(up|down|left|right)$/, '')] ?? 1;
}

export function impactFrameOf(ref: ClipRef): number {
  const name = clipNameOf(ref);
  if (name.startsWith('atk_')) return 5;
  // Whole name first, for the clips whose frame count differs by facing.
  return IMPACT_FRAME[name] ?? IMPACT_FRAME[name.replace(/_(up|down|left|right)$/, '')] ?? 1;
}

export function refDuration(ref: ClipRef): number {
  const { frames, frameRate } = spec(clipNameOf(ref));
  return (frames / frameRate) * 1000;
}

export function createKiemTienAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('idle_down'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(KIEMTIEN_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }
}
