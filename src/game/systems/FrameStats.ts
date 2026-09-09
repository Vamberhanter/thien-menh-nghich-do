import Phaser from 'phaser';
import { viewHeight } from '../config/renderScale';

/**
 * An on-screen readout of where a frame's time goes. F3 to show it.
 *
 * **Why this exists.** Chasing a stutter by reading code and changing things is
 * how you fix the wrong thing: an attempt at exactly that moved 150 scenery
 * decals onto the lit pipeline, which looked like an obvious win and made the
 * renderer flush 247 times a frame instead of 140. The only way to know is to
 * measure, and the person who can see the stutter is the player, not whoever is
 * reading the source.
 *
 * So it reports the four numbers that separate the possible causes:
 *
 *   * **fps and worst** — worst is the longest frame in the last second. A game
 *     that averages 144 and spikes to 40ms once a second *is* a stutter, and an
 *     average alone cannot show it.
 *   * **upd** — everything the game does per frame: input, physics, AI, effects.
 *   * **gpu** — the renderer's own submit time.
 *   * **flush** — batches broken per frame. Two sprites next to each other in
 *     depth that use different pipelines or textures cannot be drawn together,
 *     and each break is a draw call. This is the number that catches a scene
 *     whose sorting order is fighting its batching.
 *
 * If `upd + gpu` is comfortably under the frame budget and `worst` still spikes,
 * the time is going somewhere outside the game loop — React re-rendering the
 * HUD, or the browser collecting garbage — and that is worth knowing before
 * touching anything in here.
 *
 * Costs nothing while hidden: the hooks are installed on the first toggle and
 * the per-frame work is three additions.
 */

const WINDOW_MS = 500;

export class FrameStats {
  private label: Phaser.GameObjects.Text | null = null;
  private hooked = false;
  private frames = 0;
  private updateMs = 0;
  private renderMs = 0;
  private flushes = 0;
  private worstMs = 0;
  private sinceMs = 0;
  private lastFrameAt = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** F3. Builds the overlay and installs the hooks the first time it is asked for. */
  toggle(): void {
    if (this.label) {
      this.label.destroy();
      this.label = null;
      return;
    }
    /*
     * Top centre, worked out rather than guessed.
     *
     * A `scrollFactor(0)` object ignores the camera's scroll but *not* its
     * zoom, and the zoom scales about the camera's centre — so its coordinates
     * are camera pixels measured from that centre outwards, not screen pixels
     * from the corner. At 1920x1080 and zoom 1.5 the visible range is
     * 960 ± 640 across and 540 ± 360 down: (640, 150) looks like the top middle
     * and lands off the top of the canvas entirely, which is where the first
     * version of this went.
     *
     * Centred horizontally so it clears the HUD panels in both upper corners,
     * which are DOM over the canvas and would hide it.
     */
    const camera = this.scene.cameras.main;
    const top = camera.height / 2 - viewHeight(this.scene) / 2;
    this.label = this.scene.add
      .text(camera.width / 2, top + 24, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9fe8ff',
        backgroundColor: '#0a0f18cc',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      // Above the world and everything in it, including a flying character.
      .setDepth(1_000_000);
    this.hook();
  }

  /**
   * Folds one frame in. Called last in the scene's update, so `updateMs` covers
   * the frame that just ran rather than the one before it.
   */
  tick(time: number, delta: number): void {
    if (!this.label) return;
    this.frames++;
    // The gap between frames, not the work in one: a frame that stalls waiting
    // on something outside the loop shows up here and nowhere else.
    if (this.lastFrameAt > 0) {
      const gap = time - this.lastFrameAt;
      if (gap > this.worstMs) this.worstMs = gap;
    }
    this.lastFrameAt = time;

    this.sinceMs += delta;
    if (this.sinceMs < WINDOW_MS) return;

    const fps = Math.round((this.frames * 1000) / this.sinceMs);
    const upd = this.updateMs / this.frames;
    const gpu = this.renderMs / this.frames;
    const flush = Math.round(this.flushes / this.frames);
    this.label.setText(
      `fps ${fps}  worst ${this.worstMs.toFixed(1)}ms\n` +
        `upd ${upd.toFixed(2)}  gpu ${gpu.toFixed(2)}\n` +
        `flush ${flush}  objs ${this.scene.children.list.length}  tw ${this.scene.tweens.getTweens().length}`,
    );

    this.frames = 0;
    this.updateMs = 0;
    this.renderMs = 0;
    this.flushes = 0;
    this.worstMs = 0;
    this.sinceMs = 0;
  }

  /**
   * Wraps the scene's step, the renderer's render and every pipeline's flush.
   *
   * Installed once and left in place — unwrapping them again would mean holding
   * the originals for the life of the scene to put back something that costs an
   * increment. Everything they add is skipped while the overlay is off.
   */
  private hook(): void {
    if (this.hooked) return;
    this.hooked = true;

    const sys = this.scene.sys;
    const step = sys.step.bind(sys);
    sys.step = (time: number, delta: number) => {
      if (!this.label) return step(time, delta);
      const at = performance.now();
      step(time, delta);
      this.updateMs += performance.now() - at;
      return undefined;
    };

    const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!renderer.pipelines) return;
    const render = renderer.render.bind(renderer);
    (renderer as unknown as { render: typeof render }).render = (...args) => {
      if (!this.label) return render(...args);
      const at = performance.now();
      render(...args);
      this.renderMs += performance.now() - at;
      return undefined;
    };

    renderer.pipelines.pipelines.each((_key, pipeline) => {
      const target = pipeline as unknown as { flush?: (...a: unknown[]) => unknown };
      if (typeof target.flush !== 'function') return true;
      const flush = target.flush.bind(pipeline);
      target.flush = (...args: unknown[]) => {
        if (this.label) this.flushes++;
        return flush(...args);
      };
      return true;
    });
  }

  destroy(): void {
    this.label?.destroy();
    this.label = null;
  }
}
