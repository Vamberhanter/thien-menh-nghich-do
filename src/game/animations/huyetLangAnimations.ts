import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';
import type { Direction } from '../types';

/**
 * Texture key + asset locations for Huyết Lang.
 *
 * The art comes from eleven concept strips in
 * `public/assets/characters/huyetlang/source/`, cut into clips by
 * `npm run build:huyetlang`. The build writes into an `atlas/` subfolder so it
 * can never overwrite the strips it read.
 *
 * Geometry matches Như Yên rather than Lâm Uyên: frames are **not** all the
 * same size — 140x128 for a walk step, 190x172 for an overhead chop that lifts
 * the greatsword above his heads — and every frame carries a normalised pivot
 * on the point he stands on. Phaser re-applies that pivot per animation frame,
 * so the sprite's (x, y) IS his standing point, which also makes it the
 * depth-sort key. The previous build stamped every pose into one 160x192 box
 * and sliced the sword and the crescents off at its edges.
 */
export const HUYET_LANG_TEXTURE = 'huyetlang';
const huyetlangAtlas = remoteAtlas(
  'characters/huyetlang/atlas/huyetlang.json',
  'characters/huyetlang/atlas',
);
export const HUYET_LANG_ATLAS_URL = huyetlangAtlas.url;
export const HUYET_LANG_ATLAS_PATH = huyetlangAtlas.path;
export const HUYET_LANG_ATLAS_LOCAL_URL = huyetlangAtlas.localUrl;
export const HUYET_LANG_ATLAS_LOCAL_PATH = huyetlangAtlas.localPath;

/* ------------------------------------------------------------------- clips */

/**
 * One baked clip per unique frame set. Facing left is `flipX` on the
 * right-facing art rather than a second copy in the atlas.
 */
interface ClipSpec {
  /** Frame-name prefix in the atlas, e.g. `atk_side` -> `atk_side_0`. */
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

const CLIPS: readonly ClipSpec[] = [
  /*
   * Idle is one drawn portrait per facing, so the four frames are a 1px lift
   * and a pulse on the magma in his plate (see the builder's `breathe`). Slow,
   * because that is all the movement there is — a faster rate reads as a
   * flicker rather than as a furnace.
   */
  { clip: 'idle_down', frames: 4, frameRate: 4, repeat: -1 },
  { clip: 'idle_up', frames: 4, frameRate: 4, repeat: -1 },
  { clip: 'idle_right', frames: 4, frameRate: 4, repeat: -1 },

  { clip: 'walk_down', frames: 6, frameRate: 8, repeat: -1 },
  { clip: 'walk_up', frames: 6, frameRate: 8, repeat: -1 },
  { clip: 'walk_side', frames: 6, frameRate: 8, repeat: -1 },

  // Tam Thủ Liệt Trảm. Only two swings were drawn — an overhead chop from the
  // front and a sweep from the side — so all three chain steps replay them.
  { clip: 'atk_front', frames: 4, frameRate: 12, repeat: 0 },
  { clip: 'atk_side', frames: 4, frameRate: 12, repeat: 0 },

  // Tam Thủ Hống: four frames of charge, then the ground slam.
  { clip: 'cast_front', frames: 6, frameRate: 9, repeat: 0 },

  { clip: 'hurt', frames: 3, frameRate: 18, repeat: 0 },
  { clip: 'death', frames: 5, frameRate: 6, repeat: 0 },
];

const PREFIX = 'huyetlang-';
const key = (clip: string) => `${PREFIX}${clip}`;

/** A clip plus whether it has to be mirrored to face the wanted way. */
export interface ClipRef {
  key: string;
  flip: boolean;
}

/** Atlas clip name behind an animation key, for looking up timing data. */
export const clipNameOf = (ref: ClipRef): string => ref.key.slice(PREFIX.length);

const spec = (clip: string): ClipSpec => {
  const found = CLIPS.find((c) => c.clip === clip);
  if (!found) throw new Error(`unknown Huyết Lang clip "${clip}"`);
  return found;
};

/** Side art is drawn facing right, so only `left` needs mirroring. */
const side = (clip: string, direction: Direction): ClipRef => ({
  key: key(clip),
  flip: direction === 'left',
});

/**
 * Which swing a chain step shows.
 *
 * The front chop is used facing down, the side sweep for left and right. Facing
 * up borrows the side sweep too — there is no back-view swing on the strips,
 * and the same compromise is in Như Yên's later combo steps.
 */
const swing = (direction: Direction): ClipRef =>
  direction === 'down' ? { key: key('atk_front'), flip: false } : side('atk_side', direction);

export const HuyetLangClip = {
  idle: (direction: Direction): ClipRef =>
    direction === 'left' || direction === 'right'
      ? side('idle_right', direction)
      : { key: key(`idle_${direction}`), flip: false },

  move: (direction: Direction): ClipRef =>
    direction === 'left' || direction === 'right'
      ? side('walk_side', direction)
      : { key: key(`walk_${direction}`), flip: false },

  /** `step` is 0-based; all three steps of the chain replay the drawn swings. */
  attack: (direction: Direction, _step: number): ClipRef => swing(direction),

  /** Huyết Diễm Trảm rides the same sweep, which is where the crescent is drawn. */
  magmaSlash: (direction: Direction): ClipRef => swing(direction),

  /** Tam Thủ Hống has its own six-frame charge into a ground slam. */
  roar: (direction: Direction): ClipRef => side('cast_front', direction),

  /** Liệt Ảnh Bộ shows the walk pose for the length of the lunge. */
  dash: (direction: Direction): ClipRef => HuyetLangClip.move(direction),

  hurt: (): ClipRef => ({ key: key('hurt'), flip: false }),
  death: (): ClipRef => ({ key: key('death'), flip: false }),
} as const;

/**
 * 1-based frame on which each action connects. Damage fires on the frame rather
 * than on a timer, so retiming the art retimes the hit, and a swing interrupted
 * before this frame deals nothing.
 */
const IMPACT_FRAME: Record<string, number> = {
  // frame 3 is where the blade is through the target and the crescent is drawn
  atk_front: 3,
  atk_side: 3,
  // the last frame: the slam has broken the ground and the magma is at full height
  cast_front: 6,
};

export function impactFrameOf(ref: ClipRef): number {
  return IMPACT_FRAME[clipNameOf(ref)] ?? 1;
}

/** Playback time of the clip behind a ref, in ms. */
export function refDuration(ref: ClipRef): number {
  const { frames, frameRate } = spec(clipNameOf(ref));
  return (frames / frameRate) * 1000;
}

/* ----------------------------------------------------------------- effects */

/**
 * Effect frames cut from the same strips. `crescent` hangs off its own centre
 * so it can be rotated into any facing; the pillars hang off the base of their
 * magma ring so they can be dropped on a world point.
 */
export const HUYET_LANG_FX = {
  crescent: 'fx_crescent_0',
  pillar: 'fx_pillar_0',
  pillarAnim: 'huyetlang-fx-pillar',
} as const;

/* ---------------------------------------------------------------- creation */

export function createHuyetLangAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('idle_down'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(HUYET_LANG_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }

  // Only two pillar heights were drawn, so each is held for two beats to give
  // the eruption time to read before it drops.
  scene.anims.create({
    key: HUYET_LANG_FX.pillarAnim,
    frames: [
      { key: HUYET_LANG_TEXTURE, frame: 'fx_pillar_0' },
      { key: HUYET_LANG_TEXTURE, frame: 'fx_pillar_0' },
      { key: HUYET_LANG_TEXTURE, frame: 'fx_pillar_1' },
      { key: HUYET_LANG_TEXTURE, frame: 'fx_pillar_1' },
    ],
    frameRate: 9,
    repeat: 0,
  });
}
