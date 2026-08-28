import Phaser from 'phaser';
import {
  BOSS1_TEXTURE,
  Boss1Clip,
  createBoss1Animations,
  impactFrameOf,
} from '../animations/bossAnimations';
import type { ClipRef } from '../animations/bossAnimations';
import { directionFromVector } from '../types';
import type { Direction, Vector2Like } from '../types';
import type { AiActor } from '../systems/EnemyAI';
import type { Damageable, HitInfo } from '../systems/Damageable';

/** Footprint: a box at the boss's feet, like the players'. */
const BODY_WIDTH = 40;
const BODY_HEIGHT = 22;

/**
 * One swing / cast / nova, handed to the scene to resolve.
 *
 * The boss does not know what it can hit — the scene owns the target list — so
 * it describes the hit and lets the scene apply it. Same split as the players:
 * their entities emit payloads on the bus and the scene resolves those too.
 */
export interface BossStrike {
  kind: 'melee' | 'bolt' | 'nova';
  name: string;
  damage: number;
  /** Unit vector the strike is aimed along. */
  aim: Vector2Like;
  /** Origin on the ground plane. */
  x: number;
  y: number;
  /** Melee: centre of the arc, ahead of the boss. Bolt: how far it flies. */
  reach: number;
  /** Radius of the damaging area. */
  radius: number;
  knockback: number;
}

export interface Boss1Hooks {
  onStrike(strike: BossStrike): void;
  onDeath?(boss: Boss1): void;
}

export interface BossActionSpec {
  id: 'melee' | 'bolt' | 'nova';
  name: string;
  /** Multiplier on `attack`. */
  power: number;
  cooldown: number;
  reach: number;
  radius: number;
  knockback: number;
}

/**
 * The kit. Ranges are set to what the art actually draws: the crescent of the
 * swing reaches about 120px past her feet, the bolt is a projectile, and the
 * nova is the winged burst centred on her.
 */
export const BOSS1_ACTIONS: Record<BossActionSpec['id'], BossActionSpec> = {
  melee: {
    id: 'melee',
    name: 'Huyết Trảm',
    power: 1,
    cooldown: 1500,
    reach: 76,
    radius: 74,
    knockback: 16,
  },
  bolt: {
    id: 'bolt',
    name: 'Huyết Nhận',
    power: 0.85,
    cooldown: 3400,
    reach: 460,
    radius: 46,
    knockback: 10,
  },
  nova: {
    id: 'nova',
    name: 'Ma Dực Trận',
    power: 1.6,
    cooldown: 9000,
    reach: 0,
    radius: 210,
    knockback: 30,
  },
};

export interface BossStats {
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export const BOSS1_STATS: BossStats = {
  maxHp: 620,
  hp: 620,
  attack: 16,
  defense: 6,
  speed: 92,
};

type BossState = 'idle' | 'walk' | 'attack' | 'skill' | 'hurt' | 'dead';

interface PendingStrike {
  frame: number;
  action: BossActionSpec;
  aim: Vector2Like;
}

/** Height of the HP bar above the boss's feet. */
const BAR_LIFT = 196;

/** Shortest gap between two flinch animations, so hits cannot stun-lock it. */
const FLINCH_GAP = 1200;

/**
 * Boss 1. Drives its own body; the decisions come from `EnemyAI`, which talks to
 * it through `AiActor`. Damage in comes through `Damageable`, damage out through
 * `Boss1Hooks.onStrike` — so nothing here knows about the player.
 */
export class Boss1 extends Phaser.Physics.Arcade.Sprite implements AiActor, Damageable {
  readonly stats: BossStats;

  private currentState: BossState = 'idle';
  private facing: Direction = 'down';
  private playedKey = '';
  private syncedFrame = '';
  private pending: PendingStrike | null = null;
  private readonly readyAt = new Map<string, number>();
  private now = 0;
  private nextFlinchAt = 0;
  private bar: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly hooks: Boss1Hooks,
    stats?: Partial<BossStats>,
  ) {
    super(scene, x, y, BOSS1_TEXTURE, 'idle_front_0');

    this.stats = { ...BOSS1_STATS, ...stats };

    scene.add.existing(this);
    scene.physics.add.existing(this);
    createBoss1Animations(scene);

    this.setCollideWorldBounds(true);
    (this.body as Phaser.Physics.Arcade.Body | null)?.setSize(BODY_WIDTH, BODY_HEIGHT, false);

    this.bar = scene.add.graphics().setDepth(20000);

    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onAnimationUpdate, this);
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete, this);

    this.playState('idle', Boss1Clip.idle(), true);
  }

  /* --------------------------------------------------------- AiActor: read */

  get position(): Vector2Like {
    return { x: this.x, y: this.y };
  }

  get alive(): boolean {
    return this.currentState !== 'dead';
  }

  /** True while an action or a flinch owns the body. */
  get busy(): boolean {
    return (
      this.currentState === 'attack' ||
      this.currentState === 'skill' ||
      this.currentState === 'hurt' ||
      this.currentState === 'dead'
    );
  }

  get bossState(): BossState {
    return this.currentState;
  }

  /* -------------------------------------------------------- AiActor: write */

  move(direction: Vector2Like, speedScale = 1): void {
    if (this.busy) {
      this.setVelocity(0, 0);
      return;
    }
    const length = Math.hypot(direction.x, direction.y);
    if (length === 0) {
      this.halt();
      return;
    }
    const speed = this.stats.speed * speedScale;
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.face(direction);
    this.playState('walk', Boss1Clip.walk(this.facing));
  }

  halt(): void {
    if (this.currentState === 'dead') return;
    this.setVelocity(0, 0);
    if (!this.busy) this.playState('idle', Boss1Clip.idle());
  }

  look(direction: Vector2Like): void {
    if (this.busy) return;
    this.face(direction);
    if (this.currentState === 'walk') this.playState('walk', Boss1Clip.walk(this.facing));
  }

  ready(actionId: string): boolean {
    if (!this.alive || this.busy) return false;
    return this.now >= (this.readyAt.get(actionId) ?? 0);
  }

  /**
   * Starts an action. The damage is not dealt here: it is queued against the
   * animation's impact frame, so an interrupted swing never lands and retiming
   * the art retimes the hit.
   */
  perform(actionId: string, aim: Vector2Like): boolean {
    const action = BOSS1_ACTIONS[actionId as BossActionSpec['id']];
    if (!action || !this.ready(actionId)) return false;

    this.face(aim);
    this.setVelocity(0, 0);
    this.readyAt.set(actionId, this.now + action.cooldown);

    const clip =
      action.id === 'melee'
        ? Boss1Clip.melee(this.facing)
        : action.id === 'bolt'
          ? Boss1Clip.cast(this.facing)
          : Boss1Clip.nova();

    this.playState(action.id === 'melee' ? 'attack' : 'skill', clip, true);
    this.pending = { frame: impactFrameOf(clip), action, aim: { ...aim } };
    return true;
  }

  /* ------------------------------------------------------------ Damageable */

  hitPoint(): Vector2Like {
    // the sprite is pivoted on its feet, so this is already the ground point
    return { x: this.x, y: this.y };
  }

  hitRadius(): number {
    return 34;
  }

  applyHit(hit: HitInfo): void {
    if (hit.side !== 'player' || !this.alive) return;

    const damage = Math.max(1, Math.round(hit.damage - this.stats.defense));
    this.stats.hp = Math.max(0, this.stats.hp - damage);

    if (this.stats.hp <= 0) {
      this.die();
      return;
    }

    // A boss that plays its flinch on every hit can be stun-locked out of the
    // fight, so most hits only flash it; the flinch itself is rate limited and
    // never interrupts an action.
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.alive) this.clearTint();
    });

    if (hit.knockback) {
      this.x += hit.aim.x * Math.min(hit.knockback, 10);
      this.y += hit.aim.y * Math.min(hit.knockback, 10) * 0.5;
    }

    if (!this.busy && this.now >= this.nextFlinchAt) {
      this.nextFlinchAt = this.now + FLINCH_GAP;
      this.playState('hurt', Boss1Clip.hurt(), true);
    }
  }

  /* ---------------------------------------------------------------- update */

  tick(time: number, _delta: number): void {
    this.now = time;

    // Frame boxes differ per clip, so the feet-relative body offset only holds
    // until the displayed frame changes.
    if (this.frame.name !== this.syncedFrame) {
      this.syncedFrame = this.frame.name;
      this.syncBody();
    }

    this.setDepth(this.y);
    this.drawBar();
  }

  private drawBar(): void {
    this.bar.clear();
    if (!this.alive) return;

    const width = 88;
    const height = 7;
    const x = Math.round(this.x - width / 2);
    // fixed lift off the feet: frame boxes differ per clip, so hanging the bar
    // off the art's top edge would make it jump when the wings unfold
    const y = Math.round(this.y) - BAR_LIFT;
    const fraction = Phaser.Math.Clamp(this.stats.hp / this.stats.maxHp, 0, 1);

    this.bar.fillStyle(0x08060b, 0.85).fillRect(x - 1, y - 1, width + 2, height + 2);
    this.bar.fillStyle(0x2a1420, 1).fillRect(x, y, width, height);
    this.bar.fillStyle(0xd42a3c, 1).fillRect(x, y, Math.round(width * fraction), height);
    this.bar.fillStyle(0xff8b96, 1).fillRect(x, y, Math.round(width * fraction), 2);
  }

  die(): void {
    if (!this.alive) return;
    this.stats.hp = 0;
    this.setVelocity(0, 0);
    this.clearTint();
    this.pending = null;
    this.playState('dead', Boss1Clip.death(), true);
    this.bar.clear();
    // the corpse stays drawn but stops being solid, so the player can walk over it
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
    this.hooks.onDeath?.(this);
  }

  destroy(fromScene?: boolean): void {
    this.bar.destroy();
    super.destroy(fromScene);
  }

  /* -------------------------------------------------------------- internals */

  private face(direction: Vector2Like): void {
    const length = Math.hypot(direction.x, direction.y);
    if (length === 0) return;
    this.facing = directionFromVector(direction, this.facing);
  }

  private syncBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setOffset(this.displayOriginX - BODY_WIDTH / 2, this.displayOriginY - BODY_HEIGHT);
  }

  private playState(next: BossState, clip: ClipRef, force = false): void {
    this.currentState = next;
    this.setFlipX(clip.flip);
    if (force || this.playedKey !== clip.key) {
      this.playedKey = clip.key;
      if (force) this.pending = null;
      this.play(clip.key, !force);
      this.syncedFrame = this.frame.name;
      this.syncBody();
    }
  }

  /** Fires a queued strike the moment its animation reaches the impact frame. */
  private onAnimationUpdate(
    _animation: Phaser.Animations.Animation,
    frame: Phaser.Animations.AnimationFrame,
  ): void {
    const pending = this.pending;
    if (!pending || frame.index < pending.frame) return;
    this.pending = null;

    const { action, aim } = pending;
    this.hooks.onStrike({
      kind: action.id,
      name: action.name,
      damage: Math.round(this.stats.attack * action.power),
      aim,
      x: this.x,
      y: this.y,
      reach: action.reach,
      radius: action.radius,
      knockback: action.knockback,
    });
  }

  private onAnimationComplete(animation: Phaser.Animations.Animation): void {
    if (this.currentState === 'dead') return;
    // an action or flinch finished: hand the body back to the AI
    if (animation.key !== Boss1Clip.idle().key && !animation.key.includes('walk')) {
      this.playState('idle', Boss1Clip.idle(), true);
    }
  }

}
