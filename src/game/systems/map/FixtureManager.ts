import Phaser from 'phaser';
import type { WorldLights } from '../WorldLights';

/**
 * The landmarks on a map: the huyết mạch, the travel altar, the storage chest,
 * a boss arena's floor, a portal, an NPC's marker.
 *
 * These were five hand-written `place*` methods in `WorldScene` that all did
 * the same four things in the same order — a body, some ground markings, a
 * label, a pulse — and each kept its own pair of fields to destroy later. Ten
 * fields, five methods, ten lines of teardown, for what is one shape declared
 * six ways. Declaring it once means a seventh landmark is data, not another
 * method, and it cannot be the one that forgets to destroy its label.
 *
 * Only presentation lives here. Whether the player is *near* a shrine and what
 * happens when they press F stays in the scene, because that talks to spawn
 * binding, the bag and the warp list.
 */

/** Ground decoration drawn under a fixture, in declaration order. */
export type Marking =
  /** Flat ring — the perspective circle a standing thing sits inside. */
  | { kind: 'ellipse'; rx: number; ry: number; lift?: number; colour: number; alpha: number; width: number }
  /** True circle, for a floor plan rather than a base. */
  | { kind: 'circle'; radius: number; colour: number; alpha: number; width: number }
  /** Filled circle, under the strokes. */
  | { kind: 'disc'; radius: number; colour: number; alpha: number };

/** What the fixture actually is. */
export type FixtureBody =
  | { kind: 'sprite'; texture: string; width: number; height: number }
  /** A coloured block, for a marker with no art yet. */
  | { kind: 'block'; width: number; height: number; colour: number; alpha: number; stroke?: number }
  /** Nothing standing — an arena is a floor and a name. */
  | { kind: 'none' };

export interface FixtureSpec {
  /** Looked up with `get`; unique per map. */
  id: string;
  /** The point it stands on. Depth sorts against characters by this Y. */
  x: number;
  y: number;
  body: FixtureBody;
  /** Soft ellipse on the ground, drawn before the markings. */
  shadow?: { rx: number; ry: number; alpha?: number };
  markings?: readonly Marking[];
  label?: {
    text: string;
    /** How far above the anchor it sits. */
    lift: number;
    colour: string;
    size?: string;
    strokeWidth?: number;
    strokeColour?: string;
  };
  /**
   * Breathes the markings and the label together, or the label alone when
   * there is nothing on the ground to breathe with it.
   */
  pulse?: { ms: number; from: number; targets?: 'all' | 'label' };
  /** A light that stands here, for a landmark meant to be seen across a zone. */
  light?: { lift: number; radius: number; colour: number; intensity: number };
  /** Overrides the default `depth = y` — an arena floor goes under everything. */
  depth?: number;
}

export interface Fixture {
  readonly spec: FixtureSpec;
  readonly sprite?: Phaser.GameObjects.Sprite;
  readonly block?: Phaser.GameObjects.Rectangle;
  readonly label?: Phaser.GameObjects.Text;
}

const LABEL_FONT = 'monospace';

export class FixtureManager {
  private readonly list = new Map<string, Fixture>();
  private made: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lighting: WorldLights,
  ) {}

  get(id: string): Fixture | undefined {
    return this.list.get(id);
  }

  get ids(): readonly string[] {
    return [...this.list.keys()];
  }

  place(spec: FixtureSpec): Fixture {
    const depth = spec.depth ?? spec.y;

    if (spec.shadow) {
      const shadow = this.scene.add
        .ellipse(spec.x, spec.y - 2, spec.shadow.rx, spec.shadow.ry, 0x05070d, spec.shadow.alpha ?? 0.4)
        .setDepth(depth - 1);
      this.made.push(shadow);
    }

    // One Graphics for every marking: they are drawn once and never queried,
    // so a shape each would be objects the scene has to carry for nothing.
    let markings: Phaser.GameObjects.Graphics | undefined;
    if (spec.markings?.length) {
      markings = this.scene.add.graphics().setDepth(spec.depth ?? spec.y - 2);
      for (const mark of spec.markings) {
        if (mark.kind === 'disc') {
          markings.fillStyle(mark.colour, mark.alpha);
          markings.fillCircle(spec.x, spec.y, mark.radius);
          continue;
        }
        markings.lineStyle(mark.width, mark.colour, mark.alpha);
        if (mark.kind === 'circle') markings.strokeCircle(spec.x, spec.y, mark.radius);
        else markings.strokeEllipse(spec.x, spec.y - (mark.lift ?? 0), mark.rx, mark.ry);
      }
      this.made.push(markings);
    }

    let sprite: Phaser.GameObjects.Sprite | undefined;
    let block: Phaser.GameObjects.Rectangle | undefined;
    if (spec.body.kind === 'sprite') {
      sprite = this.scene.add
        .sprite(spec.x, spec.y, spec.body.texture)
        .setOrigin(0.5, 1)
        .setDepth(depth)
        .setDisplaySize(spec.body.width, spec.body.height);
      this.lighting.light(sprite);
      this.made.push(sprite);
    } else if (spec.body.kind === 'block') {
      const { width, height, colour, alpha, stroke } = spec.body;
      block = this.scene.add
        .rectangle(spec.x, spec.y - height / 2, width, height, colour, alpha)
        .setDepth(depth);
      if (stroke !== undefined) block.setStrokeStyle(2, stroke, 0.7);
      this.made.push(block);
    }

    let label: Phaser.GameObjects.Text | undefined;
    if (spec.label) {
      label = this.scene.add
        .text(spec.x, spec.y - spec.label.lift, spec.label.text, {
          fontFamily: LABEL_FONT,
          fontSize: spec.label.size ?? '11px',
          color: spec.label.colour,
          stroke: spec.label.strokeColour ?? '#05070d',
          strokeThickness: spec.label.strokeWidth ?? 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(depth + 2);
      this.made.push(label);
    }

    if (spec.pulse) {
      const targets: Phaser.GameObjects.GameObject[] = [];
      if (spec.pulse.targets !== 'label' && markings) targets.push(markings);
      if (label) targets.push(label);
      if (targets.length) {
        this.tweens.push(
          this.scene.tweens.add({
            targets,
            alpha: { from: spec.pulse.from, to: 1 },
            duration: spec.pulse.ms,
            yoyo: true,
            repeat: -1,
          }),
        );
      }
    }

    if (spec.light) {
      this.lighting.standing(
        spec.x,
        spec.y - spec.light.lift,
        spec.light.radius,
        spec.light.colour,
        spec.light.intensity,
      );
    }

    const fixture: Fixture = { spec, sprite, block, label };
    this.list.set(spec.id, fixture);
    return fixture;
  }

  clear(): void {
    // Tweens first: one still running against a destroyed target throws on the
    // next frame, and a zone change destroys everything it was pointed at.
    for (const tween of this.tweens) tween.stop();
    this.tweens = [];
    for (const object of this.made) object.destroy();
    this.made = [];
    this.list.clear();
  }
}
