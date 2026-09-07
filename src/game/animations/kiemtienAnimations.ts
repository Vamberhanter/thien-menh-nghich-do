import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';
import type { Direction } from '../types';

/**
 * Texture key + clips for Kiếm Tiên.
 *
 * Built from one 4×8 sheet by `npm run build:kiemtien`. Frames are variable-size
 * with a feet pivot, same geometry as the other kits, so a sprite's own position
 * is the point it stands on.
 *
 * **Movement only.** The sheet holds four walk cycles and nothing else — no
 * attack, cast, hurt or death art exists yet, so none is declared here. Adding
 * them is a sheet, a `CLIPS` row and a `KiemTienClip` entry; the atlas builder
 * already groups by clip-name prefix, so a new action becomes its own texture
 * without touching what is here.
 *
 * Unlike the other three kits this carries **four** facings rather than three
 * plus a flip. Left and right are separate drawings on the sheet, and mirroring
 * either would put the sword in the wrong hand — so `flip` is never set, and
 * `ClipRef` keeps the field only to stay the shape the entities expect.
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

/**
 * Eight walk frames at 10fps is a 0.8s cycle, which is the cadence the other
 * kits run at on their shorter cycles. The idle is the neutral walk pose given
 * a two-pixel bob by the builder, so it wants to be slow enough to read as
 * breathing rather than as a stutter.
 */
const CLIPS: readonly ClipSpec[] = [
  { clip: 'idle_up', frames: 4, frameRate: 4, repeat: -1 },
  { clip: 'idle_down', frames: 4, frameRate: 4, repeat: -1 },
  { clip: 'idle_left', frames: 4, frameRate: 4, repeat: -1 },
  { clip: 'idle_right', frames: 4, frameRate: 4, repeat: -1 },

  { clip: 'walk_up', frames: 8, frameRate: 10, repeat: -1 },
  { clip: 'walk_down', frames: 8, frameRate: 10, repeat: -1 },
  { clip: 'walk_left', frames: 8, frameRate: 10, repeat: -1 },
  { clip: 'walk_right', frames: 8, frameRate: 10, repeat: -1 },
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
const facing = (action: string, direction: Direction): ClipRef => ({
  key: key(`${action}_${direction}`),
  flip: false,
});

export const KiemTienClip = {
  idle: (direction: Direction): ClipRef => facing('idle', direction),
  move: (direction: Direction): ClipRef => facing('walk', direction),
} as const;

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
