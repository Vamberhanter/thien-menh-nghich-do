import type { Vector2Like } from '../types';

/**
 * Shared brain for anything that fights on its own.
 *
 * It knows nothing about Phaser, about sprites, or about which enemy it is
 * driving: an actor exposes a handful of verbs, a profile says how that actor
 * likes to fight, and this decides what to do each frame. So a second boss or a
 * pack of mobs needs a profile and an entity — not another AI.
 *
 * The loop, in priority order:
 *
 *   1. dead / mid-animation  -> hands off entirely; the entity owns its body
 *      while an attack is playing, or the AI would cancel its own swings.
 *   2. recovering            -> hold still for the tail of the action it just
 *      used, so attacks read as committed rather than as a stream.
 *   3. a target in reach     -> pick the best action that fits the range band
 *      and fire it.
 *   4. a target out of reach -> close in, but only to `keepDistance`, then
 *      strafe. Walking into the target and stopping dead looks like a bug.
 *   5. no target             -> patrol around the anchor, pausing between legs,
 *      and walk home if something dragged it away.
 *
 * Aggro has hysteresis on purpose: `aggroRadius` to notice you, the larger
 * `leashRadius` to give up. One radius for both makes an enemy at the edge
 * flicker between chasing and patrolling every few frames.
 */

export type AiState =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'strike'
  | 'recover'
  | 'return'
  | 'dead';

/** What the AI is allowed to do to its body. */
export interface AiActor {
  readonly position: Vector2Like;
  readonly alive: boolean;
  /** True while an action animation owns the body — the AI must not steer. */
  readonly busy: boolean;
  /** `speedScale` lets the AI walk a patrol leg slower than a charge. */
  move(direction: Vector2Like, speedScale?: number): void;
  /**
   * Stand still. Named `halt` rather than `stop` because Phaser sprites
   * already own `stop()` for animations, and an actor built on one could not
   * implement both.
   */
  halt(): void;
  /** Turn to face a direction without moving. */
  look(direction: Vector2Like): void;
  /** Start an action. False if it could not start (cooldown, wrong state). */
  perform(actionId: string, aim: Vector2Like): boolean;
  /** Off cooldown and affordable right now. */
  ready(actionId: string): boolean;
}

/** What the AI is chasing. Anything with a position that can die. */
export interface AiTarget {
  readonly position: Vector2Like;
  readonly alive: boolean;
}

export interface AiActionSpec {
  id: string;
  /** Furthest the action can be used from, measured between the two bodies. */
  maxRange: number;
  /** Closest — a ranged attack the enemy cannot use point-blank sets this. */
  minRange?: number;
  /** Higher wins when several actions fit; ties fall to declaration order. */
  priority?: number;
  /** Hold still this long after the action's animation ends, ms. */
  recover?: number;
}

export interface AiProfile {
  /** Distance at which an idle enemy notices a target. */
  aggroRadius: number;
  /** Distance at which it gives up. Must be larger than `aggroRadius`. */
  leashRadius: number;
  /** Stops closing in here, so it does not stand inside the target. */
  keepDistance: number;
  /** How far from its anchor it wanders while unaware. */
  patrolRadius: number;
  /** Pause between patrol legs, ms — [min, max]. */
  patrolPause: [number, number];
  /** Fraction of full speed used on patrol. */
  patrolSpeed: number;
  /** Minimum gap between two actions, ms. */
  actionGap: number;
  /** Sideways drift while in range and waiting, as a fraction of speed. */
  strafe: number;
  /** Anchor drift allowed before it walks home while unaware. */
  homeRadius: number;
  actions: AiActionSpec[];
}

export interface AiDebug {
  state: AiState;
  action: string | null;
  distance: number;
  engaged: boolean;
}

const ZERO: Vector2Like = { x: 0, y: 0 };

export class EnemyAI {
  private state: AiState = 'idle';
  /** Where it patrols around; set at spawn, and re-set by `anchorHere`. */
  private anchor: Vector2Like;
  private engaged = false;
  private nextActionAt = 0;
  private recoverUntil = 0;
  private lastAction: string | null = null;
  private patrolGoal: Vector2Like | null = null;
  private patrolWaitUntil = 0;
  private strafeSign = 1;
  private strafeUntil = 0;

  constructor(
    private readonly actor: AiActor,
    private readonly profile: AiProfile,
    private readonly random: () => number = Math.random,
  ) {
    this.anchor = { ...actor.position };
  }

  /** Re-home the patrol, e.g. after a teleport or a scripted move. */
  anchorHere(): void {
    this.anchor = { ...this.actor.position };
    this.patrolGoal = null;
  }

  get debug(): AiDebug {
    return {
      state: this.state,
      action: this.lastAction,
      distance: this.distanceTo(this.currentTarget),
      engaged: this.engaged,
    };
  }

  private currentTarget: AiTarget | null = null;

  update(time: number, _delta: number, target: AiTarget | null): void {
    this.currentTarget = target;

    if (!this.actor.alive) {
      this.state = 'dead';
      return;
    }

    // An action animation owns the body: never steer through a swing, or the
    // enemy slides across the ground mid-attack and the hit lands somewhere
    // the animation never reached.
    if (this.actor.busy) {
      this.state = 'strike';
      return;
    }

    if (time < this.recoverUntil) {
      this.state = 'recover';
      this.actor.halt();
      if (target?.alive) this.actor.look(this.towards(target));
      return;
    }

    this.updateEngagement(target);

    if (this.engaged && target) {
      this.fight(time, target);
      return;
    }

    this.wander(time);
  }

  /* ------------------------------------------------------------- targeting */

  /**
   * Aggro with hysteresis: noticing you takes `aggroRadius`, losing you takes
   * the larger `leashRadius`.
   */
  private updateEngagement(target: AiTarget | null): void {
    if (!target?.alive) {
      this.engaged = false;
      return;
    }
    const distance = this.distanceTo(target);
    this.engaged = this.engaged
      ? distance <= this.profile.leashRadius
      : distance <= this.profile.aggroRadius;
  }

  /* --------------------------------------------------------------- fighting */

  private fight(time: number, target: AiTarget): void {
    const distance = this.distanceTo(target);
    const aim = this.towards(target);
    this.actor.look(aim);

    const action = this.pickAction(distance);
    if (action && time >= this.nextActionAt) {
      if (this.actor.perform(action.id, aim)) {
        this.lastAction = action.id;
        this.state = 'strike';
        this.nextActionAt = time + this.profile.actionGap;
        this.recoverUntil = time + (action.recover ?? 0);
        this.actor.halt();
        return;
      }
    }

    // Nothing to fire: close the gap, or hold the line and shuffle sideways so
    // it does not stand frozen in front of the player.
    if (distance > this.profile.keepDistance) {
      this.state = 'chase';
      this.actor.move(aim);
      return;
    }

    this.state = 'idle';
    if (this.profile.strafe > 0) {
      if (time >= this.strafeUntil) {
        this.strafeSign = this.random() < 0.5 ? -1 : 1;
        this.strafeUntil = time + 500 + this.random() * 700;
      }
      // perpendicular to the aim, i.e. an arc around the target
      this.actor.move({ x: -aim.y * this.strafeSign, y: aim.x * this.strafeSign }, this.profile.strafe);
    } else {
      this.actor.halt();
    }
  }

  /**
   * Best action for this range: highest priority among the ones whose band
   * contains the target and whose cooldown is up. Declaration order breaks
   * ties, so a profile reads top-down as "prefer this, else that".
   */
  private pickAction(distance: number): AiActionSpec | null {
    let best: AiActionSpec | null = null;
    let bestPriority = -Infinity;
    for (const action of this.profile.actions) {
      if (distance > action.maxRange) continue;
      if (action.minRange !== undefined && distance < action.minRange) continue;
      if (!this.actor.ready(action.id)) continue;
      const priority = action.priority ?? 0;
      if (priority > bestPriority) {
        best = action;
        bestPriority = priority;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------- patrol */

  private wander(time: number): void {
    const { position } = this.actor;
    const home = Math.hypot(position.x - this.anchor.x, position.y - this.anchor.y);

    // dragged too far from the anchor: walk back before resuming the patrol
    if (home > this.profile.homeRadius) {
      this.state = 'return';
      this.patrolGoal = null;
      this.actor.move(this.unit(this.anchor.x - position.x, this.anchor.y - position.y));
      return;
    }

    if (time < this.patrolWaitUntil) {
      this.state = 'idle';
      this.actor.halt();
      return;
    }

    if (!this.patrolGoal) {
      const angle = this.random() * Math.PI * 2;
      const radius = this.profile.patrolRadius * (0.35 + this.random() * 0.65);
      this.patrolGoal = {
        x: this.anchor.x + Math.cos(angle) * radius,
        y: this.anchor.y + Math.sin(angle) * radius,
      };
    }

    const dx = this.patrolGoal.x - position.x;
    const dy = this.patrolGoal.y - position.y;
    if (Math.hypot(dx, dy) < 12) {
      this.patrolGoal = null;
      const [min, max] = this.profile.patrolPause;
      this.patrolWaitUntil = time + min + this.random() * (max - min);
      this.state = 'idle';
      this.actor.halt();
      return;
    }

    this.state = 'patrol';
    this.actor.move(this.unit(dx, dy), this.profile.patrolSpeed);
  }

  /* ----------------------------------------------------------------- maths */

  private distanceTo(target: AiTarget | null): number {
    if (!target) return Infinity;
    const { position } = this.actor;
    return Math.hypot(target.position.x - position.x, target.position.y - position.y);
  }

  private towards(target: AiTarget): Vector2Like {
    const { position } = this.actor;
    return this.unit(target.position.x - position.x, target.position.y - position.y);
  }

  private unit(x: number, y: number): Vector2Like {
    const length = Math.hypot(x, y);
    return length === 0 ? ZERO : { x: x / length, y: y / length };
  }
}
