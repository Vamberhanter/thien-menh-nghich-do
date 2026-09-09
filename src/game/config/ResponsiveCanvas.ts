import type Phaser from 'phaser';
import { RENDER_SCALE } from './renderScale';

/**
 * Keeps the canvas's backing store matched to its container, at
 * `RENDER_SCALE` device pixels per CSS pixel — the piece Phaser's own
 * `RESIZE` scale mode does not do.
 *
 * Checked against the engine source rather than assumed: `RESIZE` mode sets
 * `canvas.width`/`height` to the parent's *CSS* size directly, with no
 * multiplication by `RENDER_SCALE` anywhere in it. Left alone, that is a
 * regression on every screen this project already measured RENDER_SCALE
 * against — a high-DPI display gets a canvas with exactly one device pixel
 * per CSS pixel, however many it actually has to draw with.
 *
 * So the game runs in `NONE` mode instead (see `gameConfig`) and this module
 * does the resizing by hand, the way the Scale Manager's own `resize()` docs
 * say `NONE` is meant to: a `ResizeObserver` on the container drives
 * `scale.resize(cssWidth * RENDER_SCALE, cssHeight * RENDER_SCALE)`, and the
 * Scale Manager's `zoom` — its own unit-conversion knob, not the camera's —
 * is set once to `1 / RENDER_SCALE` so the CSS display size `resize()`
 * computes lands back on the container's real size instead of the inflated
 * backing store.
 *
 * `CameraManager` listens for the `RESIZE` event this produces and turns the
 * new backing size into a camera zoom — see `fovZoom`. This module only ever
 * touches the canvas; it has no opinion about what a camera does with it.
 */
export function attachResponsiveCanvas(game: Phaser.Game, container: HTMLElement): () => void {
  game.scale.setZoom(1 / RENDER_SCALE);

  const apply = (cssWidth: number, cssHeight: number) => {
    // Zero on the first observer callback of a container mid-mount is not a
    // real size; resizing to it would leave the backing store at 0x0 until
    // something else happened to trigger a second resize.
    const width = Math.max(1, Math.round(cssWidth));
    const height = Math.max(1, Math.round(cssHeight));
    game.scale.resize(width * RENDER_SCALE, height * RENDER_SCALE);
  };

  const initial = container.getBoundingClientRect();
  apply(initial.width, initial.height);

  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    apply(box.width, box.height);
  });
  observer.observe(container);

  return () => observer.disconnect();
}
