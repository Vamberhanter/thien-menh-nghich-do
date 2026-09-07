import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { WorldScene } from '../scenes/WorldScene';

/** The world the cameras show, in world units. Not the canvas size. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * How many device pixels the game draws for each world unit.
 *
 * The canvas used to be 1280x720 whatever the display, and the browser then
 * stretched it to fill: on a screen at devicePixelRatio 1.25 every pixel was
 * blown up by a quarter, on a 4K laptop by two or more. That is thrown-away
 * sharpness the art already has and paid for — measured on the character, the
 * display was asking for 144 pixels of him where the texture held 115.
 *
 * So the canvas is sized in device pixels and every camera is zoomed by the
 * same factor, which keeps the visible world identical while drawing more
 * pixels into it.
 *
 * Quantised to halves and capped at 2. The cap is cost: at 2 the renderer is
 * pushing four times the pixels. The quantising is `roundPixels` — the scenery
 * is pixel art and wants to land on whole pixels, and a ratio like 1.37 puts it
 * between them, which shows up as shimmer while the camera pans.
 */
export const RENDER_SCALE = Math.min(
  2,
  Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 2) / 2),
);

/** Layout width in world units, for a scene that positions against the screen. */
export const viewWidth = (scene: Phaser.Scene): number => scene.scale.width / RENDER_SCALE;
export const viewHeight = (scene: Phaser.Scene): number => scene.scale.height / RENDER_SCALE;

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,

    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,

    backgroundColor: '#0d1220',

    pixelArt: true,

    render: {
      antialias: false,
      // Whole-pixel snapping only helps when a world unit *is* a whole number of
      // device pixels; at 1.5 it fights the half and the scenery shimmers.
      roundPixels: Number.isInteger(RENDER_SCALE),
      /*
       * The lighting cap, and it has to live here: Phaser bakes it into the
       * `Light2D` fragment shader as a loop bound, so it cannot be raised at
       * runtime. Past the cap `LightsManager` sorts the visible lights and
       * silently slices the rest away — nothing errors, some of the lights just
       * stop existing, which is the worst way for a limit to make itself known.
       *
       * The default of 10 is not enough for this game: Băng Tinh Trận alone
       * throws one light per eruption, a projectile carries one for its whole
       * flight, every blow that lands sparks one, and the huyết mạch burns
       * permanently. Measured peak in a deliberately busy fight was 21.
       *
       * 24 is that peak plus a little. It is not free — the shader loops this
       * many times for every lit pixel — so it is a ceiling, not a target.
       */
      maxLights: 24,
    },

    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },

    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },

    scene: [BootScene, WorldScene],
  };
}
