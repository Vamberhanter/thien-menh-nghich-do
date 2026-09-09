import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { WorldScene } from '../WorldScene';
import { GAME_HEIGHT, GAME_WIDTH, PIXEL_SNAP, RENDER_SCALE } from './renderScale';

// Re-exported so every existing importer keeps working; the values live in a
// leaf module because this one imports the scenes and the scenes import them.
export {
  GAME_WIDTH,
  GAME_HEIGHT,
  RENDER_SCALE,
  PIXEL_SNAP,
  viewWidth,
  viewHeight,
} from './renderScale';

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,

    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,

    backgroundColor: '#0d1220',

    render: {
      /*
       * Nearest-neighbour filtering, spelled out rather than taken from
       * `pixelArt`.
       *
       * `pixelArt: true` looks like it means "keep the textures crisp", and it
       * does — by setting `antialias`, `antialiasGL` and `roundPixels` all at
       * once, the last of which is not wanted here and was quietly overriding
       * the line below that says so. These three are what it did, minus that.
       */
      antialias: false,
      antialiasGL: false,
      // Whole-pixel snapping only helps when a world unit *is* a whole number of
      // device pixels; at 1.5 it fights the half and the scenery shimmers.
      roundPixels: PIXEL_SNAP,
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
      // Without this the WebGL buffer is empty by the time anything outside the
      // render loop reads it, so dev screenshots come out blank.
      preserveDrawingBuffer: import.meta.env.DEV,
    },

    scale: {
      /*
       * NONE, not FIT: the old FIT mode fit a fixed 1280x720 backing store
       * inside the parent and letterboxed whatever didn't match its aspect
       * ratio — measured at over 400 CSS px of dead margin, either side, on
       * an ultrawide monitor, no matter how wide the window got.
       *
       * `RESIZE` mode looks like the fix and is not quite it: read against
       * the engine source, it sets the canvas backing store to the parent's
       * *CSS* pixel size with no `RENDER_SCALE` factored in at all, which
       * would undo the crispness that constant exists for on every
       * high-DPI screen. `NONE` does no automatic scaling of its own, which
       * is what leaves `ResponsiveCanvas` free to size the backing store
       * itself (container size times `RENDER_SCALE`) and `CameraManager`
       * free to turn that into a camera zoom that shows more world on an
       * odd-aspect screen instead of letterboxing it — see both modules'
       * headers.
       */
      mode: Phaser.Scale.NONE,
    },

    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
        /*
         * Step physics with the frame, not on a fixed 60Hz tick.
         *
         * Arcade defaults to a fixed step at 60, and a 144Hz display renders
         * 144 frames over those 60 steps — so a walking character's position
         * changes on some frames and not others. Measured on one: 47% of
         * rendered frames had the sprite at exactly the pixel it was on the
         * frame before, moving in visible pairs of 2px jumps rather than
         * gliding. That is the stutter, and it gets worse the better the
         * player's monitor is.
         *
         * The thing a fixed step buys is a simulation that behaves the same
         * whatever the frame rate. This one has no simulation to protect:
         * bodies carry a velocity and stop at walls, nothing stacks, bounces or
         * rests. The tunnelling a variable step risks needs a body to cross a
         * wall inside one step — at 151px/s and a 22px box that would take a
         * frame longer than a seventh of a second, and Phaser's own loop clamps
         * the delta well before that.
         */
        fixedStep: false,
      },
    },

    scene: [BootScene, WorldScene],
  };
}
