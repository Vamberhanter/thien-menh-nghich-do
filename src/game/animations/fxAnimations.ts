import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';

/**
 * The shared gameplay-effect atlas: art that belongs to no one kit.
 *
 * Every other atlas here is a character's. This one holds what happens to the
 * *world* rather than what a caster does — ground torn open, and whatever else
 * of that kind gets drawn later. It is shared because the ground breaks the same
 * way whoever broke it: a boss slam, a mob's charge and a player's ultimate all
 * want the same rubble, and giving each of them their own copy would be three
 * copies of one texture and three places to fix a mistake.
 *
 * Cut from `source-art/gameplay/phahoai.png` by `npm run fx:build`. Frames carry
 * a normalised anchor on the **bottom** of the art rather than on feet: none of
 * this has feet, and the bottom is the floor it opens out of, so a sprite's
 * (x, y) is the point on the ground that broke.
 */
export const FX_TEXTURE = 'fx';
const fxAtlas = remoteAtlas('fx/atlas/fx.json', 'fx/atlas');
export const FX_ATLAS_URL = fxAtlas.url;
export const FX_ATLAS_PATH = fxAtlas.path;
export const FX_ATLAS_LOCAL_URL = fxAtlas.localUrl;
export const FX_ATLAS_LOCAL_PATH = fxAtlas.localPath;

interface ClipSpec {
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

const CLIPS: readonly ClipSpec[] = [
  /*
   * Ground destruction, twenty frames of one escalation: the crust cracks,
   * rubble is thrown, the crater rings, dust boils up and settles, and the
   * cracks are the last thing left.
   *
   * 24fps, so the whole thing runs 833ms. Slower than that and the debris
   * floats; faster and the dust never reads as dust. It does not loop — the
   * ground only breaks once, and what remains afterwards is a `GroundScars`
   * decal rather than a held frame.
   */
  { clip: 'ground_break', frames: 20, frameRate: 24, repeat: 0 },
];

const PREFIX = 'fx-';
const key = (clip: string) => `${PREFIX}${clip}`;

/** Playback time of a clip, in ms — for callers timing anything against it. */
export function fxDuration(clip: string): number {
  const spec = CLIPS.find((c) => c.clip === clip);
  if (!spec) throw new Error(`unknown fx clip "${clip}"`);
  return (spec.frames / spec.frameRate) * 1000;
}

export const FX_CLIP = {
  groundBreak: { frame: 'ground_break_0', anim: key('ground_break') },
} as const;

export function createFxAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('ground_break'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(FX_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }
}
