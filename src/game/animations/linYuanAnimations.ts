import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';
import type { Direction } from '../types';

/**
 * Texture key + asset locations.
 *
 * The art comes from the hand-made sheet `lamuyen.png`, cut into per-action
 * sheets by `npm run build:lamuyen`. Frames are 160x144 with the character's
 * standing point at (80, 126) — see FRAME/ANCHOR in tools/build-lamuyen-atlas.mjs.
 */
export const LIN_YUAN_TEXTURE = 'lamuyen';
const lamuyenAtlas = remoteAtlas('characters/lamuyen/lamuyen.json', 'characters/lamuyen');
export const LIN_YUAN_ATLAS_URL = lamuyenAtlas.url;
export const LIN_YUAN_ATLAS_PATH = lamuyenAtlas.path;

/** Frame geometry, needed by the entity to place its physics body. */
export const FRAME_WIDTH = 160;
export const FRAME_HEIGHT = 144;
export const STANDING_POINT = { x: 80, y: 126 } as const;

export const DIRECTIONS: readonly Direction[] = ['down', 'up', 'left', 'right'] as const;

/** Single source of truth for animation keys. */
export const LinYuanAnim = {
  idle: (dir: Direction) => `linyuan-idle-${dir}` as const,
  walk: (dir: Direction) => `linyuan-walk-${dir}` as const,
  attack: (dir: Direction) => `linyuan-attack-${dir}` as const,
  skill: (dir: Direction) => `linyuan-skill-${dir}` as const,
  hurt: 'linyuan-hurt',
  death: 'linyuan-death',
} as const;

type DirectionalAction = 'idle' | 'walk' | 'attack' | 'skill';

interface DirectionalSpec {
  action: DirectionalAction;
  frames: number;
  frameRate: number;
  repeat: number;
}

const DIRECTIONAL_SPECS: readonly DirectionalSpec[] = [
  { action: 'idle', frames: 4, frameRate: 5, repeat: -1 },
  { action: 'walk', frames: 6, frameRate: 10, repeat: -1 },
  { action: 'attack', frames: 4, frameRate: 12, repeat: 0 },
  { action: 'skill', frames: 6, frameRate: 11, repeat: 0 },
];

/** Total playback time of an action, in ms. */
export function animationDuration(action: DirectionalAction): number {
  const spec = DIRECTIONAL_SPECS.find((s) => s.action === action);
  if (!spec) return 0;
  return (spec.frames / spec.frameRate) * 1000;
}

export function createLinYuanAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(LinYuanAnim.idle('down'))) return;

  for (const spec of DIRECTIONAL_SPECS) {
    for (const dir of DIRECTIONS) {
      scene.anims.create({
        key: LinYuanAnim[spec.action](dir),
        frames: scene.anims.generateFrameNames(LIN_YUAN_TEXTURE, {
          prefix: `${spec.action}_${dir}_`,
          start: 0,
          end: spec.frames - 1,
        }),
        frameRate: spec.frameRate,
        repeat: spec.repeat,
      });
    }
  }

  scene.anims.create({
    key: LinYuanAnim.hurt,
    frames: scene.anims.generateFrameNames(LIN_YUAN_TEXTURE, {
      prefix: 'hurt_',
      start: 0,
      end: 2,
    }),
    frameRate: 10,
    repeat: 0,
  });

  scene.anims.create({
    key: LinYuanAnim.death,
    frames: scene.anims.generateFrameNames(LIN_YUAN_TEXTURE, {
      prefix: 'death_',
      start: 0,
      end: 5,
    }),
    frameRate: 7,
    repeat: 0,
  });
}

/* ----------------------------------------------------------------- effects */

/**
 * Qi crescent cut from the same sheet, used for the Hư Vô Kiếm Khí projectile.
 * It is a single frame: the scene animates it by moving and scaling the sprite.
 */
export const QI_SLASH_FRAME = 'fx_slash_0';
