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
 * Unlike the other three kits nothing here is mirrored. They draw one profile
 * and flip it, which is why their clips read `_side`; every facing of this one
 * is a separate drawing, and a mirror would move the sword to the wrong hand.
 * `ClipRef` keeps its `flip` field to stay the shape the entities expect, and it
 * is always false.
 *
 * Still missing art: hurt and death. Those two states have no sheet, so no clip
 * claims to be them — an entity built on this should hold the idle rather than
 * play a stagger it does not have.
 */
export const KIEMTIEN_TEXTURE = 'kiemtien';
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
  ...FOUR.map((dir) => ({ clip: `skill2_${dir}`, frames: 8, frameRate: 14, repeat: 0 })),
  ...FOUR.map((dir) => ({ clip: `skill3_${dir}`, frames: 1, frameRate: 1, repeat: 0 })),
  ...FOUR.map((dir) => ({ clip: `skill4_${dir}`, frames: 1, frameRate: 1, repeat: 0 })),
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

  skill1: (direction: Direction): ClipRef => drawn('skill1', direction),
  skill2: (direction: Direction): ClipRef => drawn('skill2', direction),
  skill3: (direction: Direction): ClipRef => drawn('skill3', direction),
  skill4: (direction: Direction): ClipRef => drawn('skill4', direction),
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
