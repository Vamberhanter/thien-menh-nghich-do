import type { Vector2Like } from '../../types';

// No Phaser import on purpose: a trigger is plain geometry, and pulling the
// engine in for one distance call made this module — and therefore `ZoneDef`,
// which imports its type — untestable outside a browser. `Phaser.Device` reads
// `window` the moment it is loaded.

/**
 * Areas on a map that notice the player.
 *
 * The game had no way to say "when they get *here*, do this". Everything
 * position-driven was a hand-written distance check in the frame loop —
 * `nearShrine`, `nearWaypoint`, `tickPortals`, the shrine's safe circle — each
 * with its own radius constant and its own idea of what "entered" means. A
 * seventh one would have been a seventh method.
 *
 * A trigger is data: a shape, a name, and a bag of values the scene reads. It
 * does not know what it means. That is deliberate — the moment a trigger knows
 * how to start a quest, the map data owns gameplay, which is the thing the
 * whole zone format exists to avoid.
 *
 * Deliberately not on `GameBus`: that is the bridge to the React HUD, and a
 * trigger is a world event that mostly never reaches the UI. The scene gets a
 * callback and forwards the few that should.
 */

export type TriggerShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'circle'; x: number; y: number; radius: number };

/**
 * How often a trigger is allowed to fire.
 *
 * `once` needs somewhere to remember it across a save, which `SaveManager` does
 * not have yet — it is accepted and treated as `per-visit` until `worldFlags`
 * exists, and `TriggerManager` says so rather than pretending. `per-visit` is
 * the default because it is what an announcement wants: once each time you walk
 * into the zone, not once every step you take inside the circle.
 */
export type TriggerRepeat = 'once' | 'per-visit' | 'always';

export interface TriggerDef {
  id: string;
  shape: TriggerShape;
  /** What happened, for the scene to interpret. Never behaviour. */
  event: string;
  /** Values the event carries — a quest id, a label, a flag name. */
  data?: Readonly<Record<string, string | number | boolean>>;
  repeat?: TriggerRepeat;
  /** Also report the moment the player leaves. */
  exit?: boolean;
}

export type TriggerPhase = 'enter' | 'exit';

export interface TriggerHooks {
  /** Called on every firing. The scene decides what `def.event` means. */
  fire(def: TriggerDef, phase: TriggerPhase): void;
  /**
   * Vetoes a firing — a gate the map data must not encode itself, like a level
   * or a finished quest. Absent means everything fires.
   */
  allow?(def: TriggerDef): boolean;
}

interface TriggerState {
  def: TriggerDef;
  inside: boolean;
  /** Enter firings so far this map load. */
  fired: number;
}

export class TriggerManager {
  private states: TriggerState[] = [];

  constructor(private readonly hooks: TriggerHooks) {}

  load(defs: readonly TriggerDef[] = []): void {
    this.states = defs.map((def) => ({ def, inside: false, fired: 0 }));
  }

  clear(): void {
    this.states = [];
  }

  get count(): number {
    return this.states.length;
  }

  /** Ids the player is standing in, for the debug overlay. */
  get occupied(): readonly string[] {
    return this.states.filter((s) => s.inside).map((s) => s.def.id);
  }

  /**
   * Tests the player against every trigger and reports the crossings.
   *
   * Enter and exit are edges, not states: a trigger fires on the frame the
   * player crosses in, not on every frame they stand inside. `always` is the
   * one exception, and it exists for a damage floor or a slow field where
   * "still inside" is the thing that matters.
   */
  tick(at: Vector2Like | null): void {
    if (!at) return;
    for (const state of this.states) {
      const inside = contains(state.def.shape, at);
      const wasInside = state.inside;
      state.inside = inside;

      if (inside && !wasInside) {
        if (this.allowed(state)) {
          state.fired++;
          this.hooks.fire(state.def, 'enter');
        }
        continue;
      }
      if (inside && wasInside && state.def.repeat === 'always') {
        if (this.allowed(state)) this.hooks.fire(state.def, 'enter');
        continue;
      }
      if (!inside && wasInside && state.def.exit) {
        this.hooks.fire(state.def, 'exit');
      }
    }
  }

  /**
   * Three genuinely different answers, which the first version collapsed into
   * two: `per-visit` and `once` both refused a second firing, so a location
   * label that clears itself on the way out never came back. Walking off the
   * forest road and back on left the road nameless for the rest of the visit.
   *
   *   always     — every frame the player is inside
   *   per-visit  — every crossing in (the default)
   *   once       — the first crossing only, this map load
   */
  private allowed(state: TriggerState): boolean {
    if ((state.def.repeat ?? 'per-visit') === 'once' && state.fired > 0) return false;
    return this.hooks.allow?.(state.def) ?? true;
  }
}

export function contains(shape: TriggerShape, at: Vector2Like): boolean {
  if (shape.kind === 'circle') {
    const dx = at.x - shape.x;
    const dy = at.y - shape.y;
    // Squared both sides rather than taking a root, which is measured against
    // every trigger on every frame.
    return dx * dx + dy * dy <= shape.radius * shape.radius;
  }
  return (
    at.x >= shape.x && at.x <= shape.x + shape.width && at.y >= shape.y && at.y <= shape.y + shape.height
  );
}
