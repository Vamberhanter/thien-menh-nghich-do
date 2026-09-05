import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';
import type { Direction } from '../types';

/**
 * Texture key + asset locations for Miku.
 *
 * Built from one 4×6 Brave-Frontier-style sheet by `npm run build:miku`.
 * Frames are variable-size with a feet pivot, same geometry as Như Yên.
 */
export const MIKU_TEXTURE = 'miku';
const mikuAtlas = remoteAtlas('characters/miku/atlas/miku.json', 'characters/miku/atlas');
export const MIKU_ATLAS_URL = mikuAtlas.url;
export const MIKU_ATLAS_PATH = mikuAtlas.path;
export const MIKU_ATLAS_LOCAL_URL = mikuAtlas.localUrl;
export const MIKU_ATLAS_LOCAL_PATH = mikuAtlas.localPath;

interface ClipSpec {
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

const CLIPS: readonly ClipSpec[] = [
  { clip: 'idle_down', frames: 8, frameRate: 6, repeat: -1 },
  { clip: 'idle_up', frames: 8, frameRate: 6, repeat: -1 },
  { clip: 'idle_right', frames: 8, frameRate: 6, repeat: -1 },

  { clip: 'walk_down', frames: 13, frameRate: 12, repeat: -1 },
  { clip: 'walk_up', frames: 13, frameRate: 12, repeat: -1 },
  { clip: 'walk_side', frames: 13, frameRate: 12, repeat: -1 },

  { clip: 'atk1_side', frames: 9, frameRate: 14, repeat: 0 },
  { clip: 'atk2_side', frames: 7, frameRate: 13, repeat: 0 },
  { clip: 'atk3_side', frames: 7, frameRate: 13, repeat: 0 },

  { clip: 'cast_side', frames: 9, frameRate: 11, repeat: 0 },

  { clip: 'hurt', frames: 5, frameRate: 12, repeat: 0 },
  { clip: 'death', frames: 7, frameRate: 8, repeat: 0 },
];

const PREFIX = 'miku-';
const key = (clip: string) => `${PREFIX}${clip}`;

export interface ClipRef {
  key: string;
  flip: boolean;
}

export const clipNameOf = (ref: ClipRef): string => ref.key.slice(PREFIX.length);

const spec = (clip: string): ClipSpec => {
  const found = CLIPS.find((c) => c.clip === clip);
  if (!found) throw new Error(`unknown Miku clip "${clip}"`);
  return found;
};

const side = (clip: string, direction: Direction): ClipRef => ({
  key: key(clip),
  flip: direction === 'left',
});

const COMBO = ['atk1_side', 'atk2_side', 'atk3_side'] as const;

export const MikuClip = {
  idle: (direction: Direction): ClipRef =>
    direction === 'left' || direction === 'right'
      ? side('idle_right', direction)
      : { key: key(`idle_${direction}`), flip: false },

  move: (direction: Direction): ClipRef =>
    direction === 'left' || direction === 'right'
      ? side('walk_side', direction)
      : { key: key(`walk_${direction}`), flip: false },

  attack: (direction: Direction, step: number): ClipRef =>
    side(COMBO[Math.min(step, COMBO.length - 1)], direction),

  starSlash: (direction: Direction): ClipRef => side('atk1_side', direction),

  starArray: (direction: Direction): ClipRef => side('cast_side', direction),

  dash: (direction: Direction): ClipRef => MikuClip.move(direction),

  hurt: (): ClipRef => ({ key: key('hurt'), flip: false }),
  death: (): ClipRef => ({ key: key('death'), flip: false }),
} as const;

const IMPACT_FRAME: Record<string, number> = {
  atk1_side: 8,
  atk2_side: 5,
  atk3_side: 6,
  cast_side: 6,
};

export function impactFrameOf(ref: ClipRef): number {
  return IMPACT_FRAME[clipNameOf(ref)] ?? 1;
}

export function refDuration(ref: ClipRef): number {
  const { frames, frameRate } = spec(clipNameOf(ref));
  return (frames / frameRate) * 1000;
}

export const MIKU_FX = {
  crescent: 'fx_crescent_0',
  star: 'fx_star_0',
  eruptionAnim: 'miku-fx-eruption',
} as const;

export function createMikuAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('idle_down'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(MIKU_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }

  scene.anims.create({
    key: MIKU_FX.eruptionAnim,
    frames: [
      { key: MIKU_TEXTURE, frame: 'fx_eruption_0' },
      { key: MIKU_TEXTURE, frame: 'fx_eruption_0' },
      { key: MIKU_TEXTURE, frame: 'fx_eruption_1' },
      { key: MIKU_TEXTURE, frame: 'fx_eruption_1' },
      { key: MIKU_TEXTURE, frame: 'fx_eruption_2' },
      { key: MIKU_TEXTURE, frame: 'fx_eruption_2' },
    ],
    frameRate: 9,
    repeat: 0,
  });
}
