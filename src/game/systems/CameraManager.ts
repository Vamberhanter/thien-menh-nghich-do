import Phaser from 'phaser';
import { PIXEL_SNAP, fovZoom } from '../config/renderScale';

/**
 * The main camera's whole contract, in one place.
 *
 * It was four calls repeated at two sites in `WorldScene` — bounds, zoom,
 * round-pixels, follow — and the pair had already drifted once: one of them
 * passed `true` for the follow's rounding argument, which quietly overrode the
 * `setRoundPixels` line two lines above it and put the smooth follow back to
 * arriving in 1px jerks. One object, one truth.
 *
 * The zoom is not a look, it is the bridge between two coordinate systems. The
 * canvas is sized in *device* pixels (see `RENDER_SCALE`) and every position in
 * the game is in *world* units; zooming the camera by the same factor puts the
 * visible world back where it was while drawing more pixels into it. So zoom is
 * derived here, never passed in — from `fovZoom`, which also folds in
 * `ResponsiveCanvas`'s resizing: the canvas's actual backing size, not the
 * design 1280x720, is what the zoom is computed against, so a screen with an
 * odd aspect ratio shows more world instead of being letterboxed.
 */

/** How fast the camera closes on the player, per axis. */
const FOLLOW_LERP = 0.12;

export class CameraManager {
  /** Set once bounds exist; `onResize` is a no-op before then. */
  private hasBounds = false;

  constructor(private readonly scene: Phaser.Scene) {
    // `ResponsiveCanvas` drives this by resizing the Scale Manager (the game
    // runs in scale mode `NONE`, so nothing else does). Registered once in
    // the constructor rather than per `bindTo` — `WorldScene` builds exactly
    // one `CameraManager` for its whole lifetime, never one per zone.
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  private get camera(): Phaser.Cameras.Scene2D.Camera {
    return this.scene.cameras.main;
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    if (!this.hasBounds) return;
    this.camera.setZoom(fovZoom(gameSize.width, gameSize.height));
  }

  /** Clamps the camera to a map. Call whenever the map changes size. */
  bindTo(width: number, height: number): void {
    this.camera.setBounds(0, 0, width, height);
    this.hasBounds = true;
    this.camera.setZoom(fovZoom(this.scene.scale.width, this.scene.scale.height));
    this.camera.setRoundPixels(PIXEL_SNAP);
  }

  /** Follows a target smoothly, without re-snapping what `bindTo` decided. */
  follow(target: Phaser.GameObjects.GameObject & { x: number; y: number }): void {
    this.camera.startFollow(target, PIXEL_SNAP, FOLLOW_LERP, FOLLOW_LERP);
  }

  stopFollow(): void {
    this.camera.stopFollow();
  }

  /** Fades to black and resolves when the screen is fully out. */
  fadeOut(duration = 280): Promise<void> {
    this.camera.fadeOut(duration, 6, 8, 15);
    return new Promise((resolve) => {
      this.camera.once('camerafadeoutcomplete', () => resolve());
    });
  }

  fadeIn(duration = 280): void {
    this.camera.fadeIn(duration, 6, 8, 15);
  }
}
