import Phaser from 'phaser';
import type { Direction } from '../types';

/**
 * Boss 1 — "Huyết Ma", the horned swordswoman.
 *
 * Cut from five hand-made sheets in `public/assets/boss/boss1/` by
 * `npm run build:boss`. Like Như Yên's atlas, frames are NOT all one size:
 * every output file has its own box (222x212 for idle, 540x378 for the winged
 * nova) and each frame carries a normalised pivot on the boss's feet, which
 * Phaser re-applies per animation frame. So the sprite's (x, y) IS the point it
 * stands on, and that doubles as the depth-sort key.
 */
export const BOSS1_TEXTURE = 'boss1';
export const BOSS1_ATLAS_URL = 'assets/boss/boss1/atlas/boss1.json';
export const BOSS1_ATLAS_PATH = 'assets/boss/boss1/atlas';

interface ClipSpec {
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

/**
 * Frame rates are authored for how they read, not derived: same lesson as Như
 * Yên's locomotion — these rows are pose variations rather than a gait with a
 * planted foot, so a fast cycle reads as flailing.
 */
const CLIPS: readonly ClipSpec[] = [
  { clip: 'idle_front', frames: 4, frameRate: 4, repeat: -1 },

  // all four facings are drawn on the sheet, so none of these is mirrored
  { clip: 'walk_down', frames: 8, frameRate: 9, repeat: -1 },
  { clip: 'walk_up', frames: 8, frameRate: 9, repeat: -1 },
  { clip: 'walk_left', frames: 8, frameRate: 9, repeat: -1 },
  { clip: 'walk_right', frames: 8, frameRate: 9, repeat: -1 },

  // the sword swing exists facing right only; left is `flipX`
  { clip: 'atk_side', frames: 4, frameRate: 9, repeat: 0 },
  { clip: 'cast_side', frames: 3, frameRate: 7, repeat: 0 },
  // the nova is drawn from the front and used for every facing
  { clip: 'nova_front', frames: 5, frameRate: 6, repeat: 0 },

  { clip: 'hurt', frames: 5, frameRate: 12, repeat: 0 },
  { clip: 'death', frames: 5, frameRate: 5, repeat: 0 },
];

const PREFIX = 'boss1-';
const key = (clip: string) => `${PREFIX}${clip}`;

export interface ClipRef {
  key: string;
  flip: boolean;
}

export const clipNameOf = (ref: ClipRef): string => ref.key.slice(PREFIX.length);

const spec = (clip: string): ClipSpec => {
  const found = CLIPS.find((c) => c.clip === clip);
  if (!found) throw new Error(`unknown boss clip "${clip}"`);
  return found;
};

function clipDuration(clip: string): number {
  const { frames, frameRate } = spec(clip);
  return (frames / frameRate) * 1000;
}

/** Side art is drawn facing right, so only `left` needs mirroring. */
const side = (clip: string, direction: Direction): ClipRef => ({
  key: key(clip),
  flip: direction === 'left',
});

export const Boss1Clip = {
  /** Only a front idle was drawn; every facing uses it. */
  idle: (): ClipRef => ({ key: key('idle_front'), flip: false }),

  walk: (direction: Direction): ClipRef => ({ key: key(`walk_${direction}`), flip: false }),

  /** Sword swing. Facing up or down plays the side art, as the sheet has no other. */
  melee: (direction: Direction): ClipRef => side('atk_side', direction),

  /** Huyết Nhận: gathers an orb, then throws it. */
  cast: (direction: Direction): ClipRef => side('cast_side', direction),

  /** Ma Dực Trận: the rune opens and the wings unfold. Front art, any facing. */
  nova: (): ClipRef => ({ key: key('nova_front'), flip: false }),

  hurt: (): ClipRef => ({ key: key('hurt'), flip: false }),
  death: (): ClipRef => ({ key: key('death'), flip: false }),
} as const;

/**
 * 1-based frame each action connects on — where the crescent is through the
 * target, where the orb leaves the hand, where the nova peaks. Damage fires on
 * the frame rather than on a timer, so retiming the art retimes the hit and an
 * interrupted animation simply never lands.
 */
const IMPACT_FRAME: Record<string, number> = {
  atk_side: 3,
  cast_side: 3,
  nova_front: 4,
};

export function impactFrameOf(ref: ClipRef): number {
  return IMPACT_FRAME[clipNameOf(ref)] ?? 1;
}

export function refDuration(ref: ClipRef): number {
  return clipDuration(clipNameOf(ref));
}

/* ----------------------------------------------------------------- effects */

/** Effect frames cut from the same sheets. */
export const BOSS1_FX = {
  /** Flying blood bolt — three frames, played as a loop while it travels. */
  boltAnim: 'boss1-fx-bolt',
  crescent: 'fx_crescent_0',
  /** Ground explosion where a bolt lands. */
  burstAnim: 'boss1-fx-burst',
  /** Dark ring under the nova. */
  ringAnim: 'boss1-fx-ring',
} as const;

/* ---------------------------------------------------------------- creation */

export function createBoss1Animations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('idle_front'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(BOSS1_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }

  scene.anims.create({
    key: BOSS1_FX.boltAnim,
    frames: scene.anims.generateFrameNames(BOSS1_TEXTURE, {
      prefix: 'fx_bolt_',
      start: 0,
      end: 2,
    }),
    frameRate: 14,
    repeat: -1,
  });

  // two drawn frames, each held two beats so the burst reads before it fades
  scene.anims.create({
    key: BOSS1_FX.burstAnim,
    frames: [
      { key: BOSS1_TEXTURE, frame: 'fx_burst_0' },
      { key: BOSS1_TEXTURE, frame: 'fx_burst_0' },
      { key: BOSS1_TEXTURE, frame: 'fx_burst_1' },
      { key: BOSS1_TEXTURE, frame: 'fx_burst_1' },
    ],
    frameRate: 10,
    repeat: 0,
  });

  scene.anims.create({
    key: BOSS1_FX.ringAnim,
    frames: scene.anims.generateFrameNames(BOSS1_TEXTURE, {
      prefix: 'fx_ring_',
      start: 0,
      end: 1,
    }),
    frameRate: 6,
    repeat: 2,
  });
}
