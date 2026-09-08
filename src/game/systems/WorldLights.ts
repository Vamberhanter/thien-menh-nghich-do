import Phaser from 'phaser';

/**
 * Real light in the world, without touching a single texture.
 *
 * The point of this is not to darken the game. It is that the effects in it
 * currently *are* bright without *being* bright: Cửu U Nộ Diễm erupts beside a
 * mob and the mob does not change by one shade; the grass under a pillar of
 * flame stays the same green as the grass 500px away. A flame that lights
 * nothing is a picture of a flame.
 *
 * Phaser's `Light2D` pipeline is what closes that gap, and it needs less than it
 * looks like it does. `LightPipeline.getNormalMap()` falls back to the renderer's
 * built-in flat `__NORMAL` texture for any object that has no normal map of its
 * own, so a sprite can be lit with nothing added to the download — the light
 * treats it as a flat surface facing the camera and brightens it by distance.
 * Normal maps would add per-pixel form on top of that; they are a separate,
 * much more expensive question, and nothing here needs them.
 *
 * Two kinds of thing exist in this scheme and they must not be confused:
 *
 *  * **Lit** — the ground, the scenery, the characters, the mobs. These get the
 *    pipeline, and their brightness is `ambient + whatever light reaches them`.
 *  * **Emitters** — the effects. These keep the normal pipeline, so they stay at
 *    the brightness they were drawn at, and they *add a light* instead. An
 *    effect that is both lit and emitting would dim itself in its own glow.
 */
export class WorldLights {
  /** Lights that fade and remove themselves, so a flash cannot leak. */
  private readonly transient = new Set<Phaser.GameObjects.Light>();

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Turns lighting on for the scene at a given base brightness.
   *
   * `ambient` is a grey: 0xffffff leaves every lit object exactly as bright as
   * it is today and lights only ever *add*, which is the setting that changes
   * nothing until an effect fires. Lower it and the zone gets a mood — a cave
   * wants far less than a meadow — but that is a per-zone decision, not a
   * global one, so it is a parameter rather than a constant.
   */
  enable(ambient: number): void {
    this.scene.lights.enable().setAmbientColor(ambient);
  }

  /** Every object that should be *lit* rather than emit. Safe on empties. */
  light(...objects: Array<Phaser.GameObjects.GameObject | undefined | null>): void {
    for (const object of objects) {
      // `setPipeline` lives on the Pipeline component, which not every game
      // object has — a Graphics or a Text does not.
      const target = object as { setPipeline?: (name: string) => unknown } | null | undefined;
      target?.setPipeline?.(Phaser.Renderer.WebGL.Pipelines.LIGHT_PIPELINE);
    }
  }

  /** A group's current members, for the static scenery. */
  lightGroup(group?: Phaser.GameObjects.Group): void {
    group?.getChildren().forEach((child) => this.light(child));
  }

  /**
   * A light that lives as long as the scene: a shrine, a portal, a brazier.
   * Returned so the caller can move or kill it.
   */
  standing(
    x: number,
    y: number,
    radius: number,
    colour: number,
    intensity = 1,
  ): Phaser.GameObjects.Light {
    return this.scene.lights.addLight(x, y, radius, colour, intensity);
  }

  /**
   * The flash an effect throws — the whole reason for any of this.
   *
   * Rises fast and falls slowly, because that is what an explosion does to the
   * things around it, and it takes itself out of the world at the end. Tracked
   * in `transient` so tearing the scene down cannot leave a light burning over
   * an empty map.
   */
  flash(
    x: number,
    y: number,
    radius: number,
    colour: number,
    intensity = 2,
    duration = 320,
  ): void {
    const light = this.scene.lights.addLight(x, y, radius, colour, 0);
    const rise = Math.min(90, duration * 0.25);
    this.scene.tweens.add({ targets: light, intensity, duration: rise, ease: 'Quad.easeOut' });
    this.scene.tweens.add({
      targets: light,
      intensity: 0,
      delay: rise,
      duration: duration - rise,
      ease: 'Quad.easeIn',
    });
    this.retire(light, duration);
  }

  /**
   * Light gathering, rather than light going off.
   *
   * `flash` is an explosion — up in 90ms and down over everything after. A
   * charge is the opposite curve: it builds for as long as the technique is
   * winding up and is gone the instant the thing it was feeding lets go. That
   * is what makes the burst read as earned rather than as arriving from
   * nowhere, and it is why this is its own method: a flag on `flash` would have
   * callers picking between two opposite shapes by boolean.
   */
  swell(
    x: number,
    y: number,
    radius: number,
    colour: number,
    intensity = 2,
    duration = 600,
  ): void {
    const light = this.scene.lights.addLight(x, y, radius, colour, 0);
    const release = Math.min(140, duration * 0.25);
    const build = duration - release;
    // easeIn, so most of the brightness arrives in the last moments before it
    // goes — a charge that rose evenly would peak too early to be a build-up.
    this.scene.tweens.add({ targets: light, intensity, duration: build, ease: 'Quad.easeIn' });
    this.scene.tweens.add({
      targets: light,
      intensity: 0,
      delay: build,
      duration: release,
      ease: 'Quad.easeOut',
    });
    this.retire(light, duration);
  }

  /**
   * A light that rides a projectile.
   *
   * A crescent or a bolt is not an event, it is a thing crossing the map, and a
   * flash at either end of that is the wrong shape entirely: it says something
   * happened *there* when what is happening is a lit object *travelling*. What
   * this gives instead is a light that follows, so the grass brightens ahead of
   * the projectile and goes dark behind it.
   *
   * It owns its own lifetime rather than taking an end callback, because the
   * effect modules already report every step and nothing there knows when the
   * tween finished. `life` should be the flight time; the light holds through it
   * and then goes out over a short tail, which is also the safety net — a
   * projectile destroyed early cannot leave a light stranded mid-air.
   */
  travelling(
    x: number,
    y: number,
    radius: number,
    colour: number,
    intensity: number,
    life: number,
  ): { moveTo(x: number, y: number): void } {
    const light = this.scene.lights.addLight(x, y, radius, colour, 0);
    const rise = Math.min(70, life * 0.2);
    const tail = 200;
    this.scene.tweens.add({ targets: light, intensity, duration: rise, ease: 'Quad.easeOut' });
    this.scene.tweens.add({
      targets: light,
      intensity: 0,
      delay: life,
      duration: tail,
      ease: 'Quad.easeIn',
    });
    this.retire(light, life + tail);

    return {
      moveTo: (nx: number, ny: number) => {
        light.x = nx;
        light.y = ny;
      },
    };
  }

  /**
   * Books a light out of the world after `life`, and this is deliberately a
   * timer rather than the tail of the fade animation.
   *
   * Hanging removal off a tween's `onComplete` looked tidier and leaked: a tween
   * that is killed — by another tween taking its target, by the scene shutting
   * down mid-fade — never completes, and the light it was going to remove stays
   * lit forever. Measured: a busy fight ended with three lights burning over an
   * empty map where there should have been one. The fade is decoration; the
   * timer is the contract.
   */
  private retire(light: Phaser.GameObjects.Light, life: number): void {
    this.transient.add(light);
    this.scene.time.delayedCall(life, () => {
      if (!this.transient.delete(light)) return; // already gone with the scene
      this.scene.lights.removeLight(light);
    });
  }

  /** Scene teardown: kill anything still burning. */
  destroy(): void {
    for (const light of this.transient) this.scene.lights.removeLight(light);
    this.transient.clear();
  }
}
