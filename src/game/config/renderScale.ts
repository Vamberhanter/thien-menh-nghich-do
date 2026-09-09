import type Phaser from 'phaser';

/**
 * The canvas/world scale, and nothing else.
 *
 * Split out of `gameConfig` because that module imports the scenes, and the
 * scenes import this: `CameraManager` reading `RENDER_SCALE` at module scope
 * closed the loop and threw "Cannot access 'RENDER_SCALE' before
 * initialization" the moment it was added. TypeScript cannot see that — the
 * types are all fine — so the only defence is for the value to live in a leaf
 * with no game imports of its own. `gameConfig` re-exports it, so every
 * existing importer is unaffected.
 */

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

/**
 * Whole-pixel snapping is only right when a world unit *is* a whole number of
 * device pixels. At 1.5 it fights the half: the scenery shimmers and a smooth
 * camera follow arrives in 1px jerks.
 */
export const PIXEL_SNAP = Number.isInteger(RENDER_SCALE);

/** Layout width in world units, for a scene that positions against the screen. */
export const viewWidth = (scene: Phaser.Scene): number => scene.scale.width / RENDER_SCALE;
export const viewHeight = (scene: Phaser.Scene): number => scene.scale.height / RENDER_SCALE;

/**
 * The camera zoom that shows at least `GAME_WIDTH x GAME_HEIGHT` world units,
 * given the canvas's actual backing size — and never less than that in
 * either axis, only ever more.
 *
 * `backingWidth / GAME_WIDTH` is the zoom at which the width shown is exactly
 * the design width; anything higher would show *less* width than designed.
 * Taking the smaller of the two axis limits is what turns "the canvas is now
 * bigger" into "the world visible is now bigger", in whichever axis actually
 * has room: a screen wider than 16:9 hits its height limit first and gains
 * width, a taller/narrower one hits its width limit first and gains height.
 * At exactly 16:9 the two limits are equal and this returns `RENDER_SCALE`,
 * unchanged from before there was a formula at all.
 */
export const fovZoom = (backingWidth: number, backingHeight: number): number =>
  Math.min(backingWidth / GAME_WIDTH, backingHeight / GAME_HEIGHT);
