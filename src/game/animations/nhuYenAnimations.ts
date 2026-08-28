import Phaser from 'phaser';
import type { Direction } from '../types';

/**
 * Texture key + asset locations for Như Yên.
 *
 * The art comes from five hand-made sheets in
 * `public/assets/characters/nhuyen/`, cut into clips by `npm run build:nhuyen`.
 * The build writes into an `atlas/` subfolder so it can never overwrite the
 * source sheets, which happen to share its naming.
 *
 * Unlike the Lâm Uyên atlas, frames are NOT all the same size: each output file
 * has its own box (104x128 for idle, 366x276 for the ice channel) and every
 * frame carries a normalised pivot on the character's feet. Phaser re-applies
 * that pivot on each animation frame, so the sprite's (x, y) IS the point Như
 * Yên stands on — which also makes it the depth-sort key.
 */
export const NHU_YEN_TEXTURE = 'nhuyen';
export const NHU_YEN_ATLAS_URL = 'assets/characters/nhuyen/atlas/nhuyen.json';
export const NHU_YEN_ATLAS_PATH = 'assets/characters/nhuyen/atlas';

/* ------------------------------------------------------------------- clips */

/**
 * One baked clip per unique frame set. Facing left is `flipX` on the
 * right-facing art rather than a second copy in the atlas.
 */
interface ClipSpec {
  /** Frame-name prefix in the atlas, e.g. `atk2_side` -> `atk2_side_0`. */
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
  /**
   * Marks a locomotion clip: its rate responds to how fast she is moving.
   * See `locomotionTimeScale`.
   */
  locomotion?: boolean;
}

const CLIPS: readonly ClipSpec[] = [
  // the artist drew all four facings for idle, so none of these is mirrored
  { clip: 'idle_down', frames: 4, frameRate: 5, repeat: -1 },
  { clip: 'idle_up', frames: 4, frameRate: 5, repeat: -1 },
  { clip: 'idle_right', frames: 4, frameRate: 5, repeat: -1 },
  { clip: 'idle_left', frames: 4, frameRate: 5, repeat: -1 },

  // Locomotion rates are authored for how they *read*, not derived from a
  // stride — the art has no planted foot to sync to. See `locomotionTimeScale`.
  // Consecutive frames of these rows differ by ~17-24% of the silhouette
  // (`node tools/analyse-cycle.mjs walk_side run_side`), nearly all of it hair
  // and sword arm, so every extra frame per second is felt as churn.
  { clip: 'walk_down', frames: 7, frameRate: 9, repeat: -1, locomotion: true },
  { clip: 'walk_up', frames: 7, frameRate: 9, repeat: -1, locomotion: true },
  { clip: 'walk_side', frames: 7, frameRate: 9, repeat: -1, locomotion: true },
  { clip: 'run_side', frames: 7, frameRate: 10, repeat: -1, locomotion: true },

  // Hàn Băng Tam Thức — the three hits are one continuous sweep on the sheet
  { clip: 'atk1_front', frames: 4, frameRate: 14, repeat: 0 },
  { clip: 'atk1_side', frames: 4, frameRate: 14, repeat: 0 },
  { clip: 'atk2_side', frames: 3, frameRate: 12, repeat: 0 },
  { clip: 'atk3_side', frames: 3, frameRate: 11, repeat: 0 },

  { clip: 'cast_side', frames: 6, frameRate: 9, repeat: 0 },

  { clip: 'hurt', frames: 3, frameRate: 11, repeat: 0 },
  { clip: 'death', frames: 11, frameRate: 8, repeat: 0 },
];

const PREFIX = 'nhuyen-';
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
  if (!found) throw new Error(`unknown Như Yên clip "${clip}"`);
  return found;
};

/** Playback time of a clip in ms — action durations are read from the art. */
function clipDuration(clip: string): number {
  const { frames, frameRate } = spec(clip);
  return (frames / frameRate) * 1000;
}

/** Side art is drawn facing right, so only `left` needs mirroring. */
const side = (clip: string, direction: Direction): ClipRef => ({
  key: key(clip),
  flip: direction === 'left',
});

/**
 * The three combo steps. Only step 1 has real front-facing art; steps 2 and 3
 * were drawn from the side only, so facing up or down she swings sideways for
 * them. Six more front-view frames on the attack sheet would fix it here and
 * nowhere else.
 */
const COMBO_CLIPS = ['atk1', 'atk2', 'atk3'] as const;

export const NhuYenClip = {
  idle: (direction: Direction): ClipRef => ({ key: key(`idle_${direction}`), flip: false }),

  /** Sprinting up/down reuses the walk cycle; `timeScale` speeds it up. */
  move: (direction: Direction, running: boolean): ClipRef => {
    if (direction === 'left' || direction === 'right') {
      return side(running ? 'run_side' : 'walk_side', direction);
    }
    return { key: key(`walk_${direction}`), flip: false };
  },

  /** `step` is 0-based: 0, 1, 2 of Hàn Băng Tam Thức. */
  attack: (direction: Direction, step: number): ClipRef => {
    const stage = COMBO_CLIPS[Math.min(step, COMBO_CLIPS.length - 1)];
    if (stage === 'atk1' && direction === 'down') {
      return { key: key('atk1_front'), flip: false };
    }
    return side(`${stage}_side`, direction);
  },

  /** Băng Phách Trảm borrows the wide sweep of combo step 2 to launch its qi. */
  qiSlash: (direction: Direction): ClipRef => side('atk2_side', direction),

  /** Băng Tinh Trận has its own six-frame channel. */
  channel: (direction: Direction): ClipRef => side('cast_side', direction),

  /** Sương Ảnh Bộ shows the sprint pose for the length of the lunge. */
  dash: (direction: Direction): ClipRef => NhuYenClip.move(direction, true),

  hurt: (): ClipRef => ({ key: key('hurt'), flip: false }),
  death: (): ClipRef => ({ key: key('death'), flip: false }),
} as const;

/**
 * 1-based frame on which each action actually connects — where the blade is
 * through the target, or where the vortex peaks. The entity fires damage on this
 * frame rather than on a timer, so retiming the art retimes the hit, and an
 * interrupted animation simply never reaches it.
 */
const IMPACT_FRAME: Record<string, number> = {
  atk1_front: 2,
  atk1_side: 2,
  atk2_side: 2,
  atk3_side: 2,
  // the last frame: the vortex is at full height there, and on the sheet the
  // two eruption frames follow it directly as the same continuous technique
  cast_side: 6,
};

export function impactFrameOf(ref: ClipRef): number {
  return IMPACT_FRAME[clipNameOf(ref)] ?? 1;
}

/** Playback time of the clip behind a ref, in ms. */
export function refDuration(ref: ClipRef): number {
  return clipDuration(clipNameOf(ref));
}

/**
 * How much faster than authored a locomotion clip plays, given her speed.
 *
 * This used to divide ground speed by a measured stride, to keep a planted foot
 * from sliding. That premise turned out to be false for this art: tracking the
 * boots across a row (`node tools/measure-stride.mjs walk_side run_side`) shows
 * the rear foot travelling **9-10px over the entire 7-frame row**, with both
 * feet staying essentially where they are. These rows are seven variations of a
 * stride pose, not a gait with a contact foot — there is nothing to sync to.
 *
 * Dividing by a stride that isn't drawn pushed the cycle to ~17fps at sprint
 * (and 17.6fps for vertical sprint, which plays the *walk* art). With ~20% of
 * the silhouette changing per frame — hair and sword arm, not legs — that read
 * as flailing rather than running.
 *
 * So the rate is authored for comfort, and speed only nudges it: sprinting
 * still looks busier than walking, but the clamp keeps the arm from ever
 * becoming noise. Feet cannot slide "more" than the art already does.
 */
const SPEED_RESPONSE = { min: 0.9, max: 1.2 } as const;

export function locomotionTimeScale(
  ref: ClipRef,
  speed: number,
  baseSpeed: number,
): number {
  const { locomotion } = spec(clipNameOf(ref));
  if (!locomotion || baseSpeed <= 0) return 1;
  return Phaser.Math.Clamp(speed / baseSpeed, SPEED_RESPONSE.min, SPEED_RESPONSE.max);
}

/* ----------------------------------------------------------------- effects */

/**
 * Effect frames cut from the same sheets. `crescent` and `shards` hang off
 * their own centre so they can be rotated into any facing; `eruption` hangs off
 * the base of its ground ring so it can be dropped on a world point.
 */
export const NHU_YEN_FX = {
  crescent: 'fx_crescent_0',
  shards: 'fx_shards_0',
  eruptionAnim: 'nhuyen-fx-eruption',
} as const;

/* ---------------------------------------------------------------- creation */

export function createNhuYenAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('idle_down'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(NHU_YEN_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }

  // The eruption only has two drawn frames, so each is held for two beats to
  // give the pillar time to read before it collapses.
  scene.anims.create({
    key: NHU_YEN_FX.eruptionAnim,
    frames: [
      { key: NHU_YEN_TEXTURE, frame: 'fx_eruption_0' },
      { key: NHU_YEN_TEXTURE, frame: 'fx_eruption_0' },
      { key: NHU_YEN_TEXTURE, frame: 'fx_eruption_1' },
      { key: NHU_YEN_TEXTURE, frame: 'fx_eruption_1' },
    ],
    frameRate: 9,
    repeat: 0,
  });
}
