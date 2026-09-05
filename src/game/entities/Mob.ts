import Phaser from 'phaser';
import type { Vector2Like } from '../types';
import { directionFromVector } from '../types';
import type { Direction } from '../types';
import type { AiActor, AiProfile } from '../systems/EnemyAI';
import type { Damageable, HitInfo } from '../systems/Damageable';
import { FrostMark } from '../systems/FrostMark';
import type { MobKind } from '../zones/types';
import { MobTexture, monsterArt } from '../env';
import { SNAP_LERP_MS, SNAP_TELEPORT_PX } from '../../net/types';

/** Gap between the top of a mob's sprite and its health bar. */
const BAR_LIFT = 8;

export interface MobStrike {
  kind: 'melee' | 'bolt';
  damage: number;
  aim: Vector2Like;
  x: number;
  y: number;
  reach: number;
  radius: number;
}

export interface MobHooks {
  onStrike(mob: Mob, strike: MobStrike): void;
  onDeath(mob: Mob): void;
  onFrost?(mob: Mob, froze: boolean): void;
}

export interface MobSpec {
  kind: MobKind;
  name: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  texture: string;
  hitRadius: number;
  /**
   * Footprint the mob collides on, parked at the bottom of the sprite. Sized off
   * the art rather than shared, because the roster spans a 45px toad and a 74px
   * troll — one box would either swallow the small mobs or let the big ones stand
   * inside a tree.
   */
  body: { width: number; height: number };
}

/**
 * The roster, easiest first. Each species is one of three shapes — a fast
 * skirmisher, a slow armoured wall, or a ranged caster — and the three zones draw
 * from progressively harder tiers of them.
 */
export const MOB_SPECS: Record<MobKind, MobSpec> = {
  toad: {
    kind: 'toad',
    name: 'Yêu Thiềm',
    maxHp: 40,
    attack: 7,
    defense: 0,
    speed: 112,
    texture: MobTexture.Toad,
    hitRadius: 18,
    body: { width: 28, height: 12 },
  },
  crab: {
    kind: 'crab',
    name: 'Thiết Giáp Trùng',
    maxHp: 56,
    attack: 8,
    defense: 4,
    speed: 62,
    texture: MobTexture.Crab,
    hitRadius: 18,
    body: { width: 28, height: 12 },
  },
  serpent: {
    kind: 'serpent',
    name: 'Lục Lân Xà',
    maxHp: 62,
    attack: 10,
    defense: 2,
    speed: 104,
    texture: MobTexture.Serpent,
    hitRadius: 20,
    body: { width: 32, height: 14 },
  },
  drake: {
    kind: 'drake',
    name: 'Thanh Giao',
    maxHp: 46,
    attack: 11,
    defense: 1,
    speed: 92,
    texture: MobTexture.Drake,
    hitRadius: 24,
    body: { width: 38, height: 14 },
  },
  golem: {
    kind: 'golem',
    name: 'Mộc Thạch Khôi',
    maxHp: 96,
    attack: 13,
    defense: 5,
    speed: 66,
    texture: MobTexture.Golem,
    hitRadius: 22,
    body: { width: 34, height: 16 },
  },
  troll: {
    kind: 'troll',
    name: 'Đằng Mao Yêu',
    maxHp: 84,
    attack: 15,
    defense: 3,
    speed: 84,
    texture: MobTexture.Troll,
    hitRadius: 26,
    body: { width: 42, height: 16 },
  },
  'blood-serpent': {
    kind: 'blood-serpent',
    name: 'Huyết Lân Giao',
    maxHp: 88,
    attack: 16,
    defense: 3,
    speed: 116,
    texture: MobTexture.BloodSerpent,
    hitRadius: 24,
    body: { width: 38, height: 15 },
  },
  'fire-drake': {
    kind: 'fire-drake',
    name: 'Hỏa Giao',
    maxHp: 64,
    attack: 15,
    defense: 2,
    speed: 96,
    texture: MobTexture.FireDrake,
    hitRadius: 24,
    body: { width: 38, height: 14 },
  },
  'ember-golem': {
    kind: 'ember-golem',
    name: 'Dung Nham Khôi',
    maxHp: 130,
    attack: 18,
    defense: 7,
    speed: 60,
    texture: MobTexture.EmberGolem,
    hitRadius: 22,
    body: { width: 34, height: 16 },
  },
};

/** Closes in and swings. `reach` is how far the swing lands from the body. */
function meleeAi(reach: number, over: Partial<AiProfile> = {}): AiProfile {
  return {
    aggroRadius: 280,
    leashRadius: 480,
    keepDistance: Math.round(reach * 0.8),
    patrolRadius: 110,
    patrolPause: [700, 1800],
    patrolSpeed: 0.4,
    actionGap: 700,
    strafe: 0.45,
    homeRadius: 360,
    actions: [{ id: 'melee', maxRange: reach, priority: 3, recover: 180 }],
    ...over,
  };
}

/** Holds its ground and throws bolts, backing off if the target closes. */
function rangedAi(over: Partial<AiProfile> = {}): AiProfile {
  return {
    aggroRadius: 340,
    leashRadius: 560,
    keepDistance: 170,
    patrolRadius: 90,
    patrolPause: [900, 2000],
    patrolSpeed: 0.35,
    actionGap: 900,
    strafe: 0.5,
    homeRadius: 400,
    actions: [{ id: 'bolt', minRange: 70, maxRange: 280, priority: 3, recover: 260 }],
    ...over,
  };
}

/** Slow and heavy: notices late, barely strafes, and stays near its anchor. */
function wallAi(reach: number, over: Partial<AiProfile> = {}): AiProfile {
  return meleeAi(reach, {
    aggroRadius: 240,
    leashRadius: 420,
    patrolRadius: 80,
    patrolPause: [1200, 2400],
    patrolSpeed: 0.3,
    actionGap: 900,
    strafe: 0.15,
    homeRadius: 300,
    actions: [{ id: 'melee', maxRange: reach, priority: 3, recover: 280 }],
    ...over,
  });
}

export const MOB_AI: Record<MobKind, AiProfile> = {
  toad: meleeAi(52),
  crab: wallAi(56),
  serpent: meleeAi(58),
  drake: rangedAi(),
  golem: wallAi(64),
  troll: wallAi(70, { strafe: 0.3, patrolSpeed: 0.36, actionGap: 800 }),
  'blood-serpent': meleeAi(60, { aggroRadius: 320, leashRadius: 540, actionGap: 620 }),
  'fire-drake': rangedAi({ aggroRadius: 380, actionGap: 780 }),
  'ember-golem': wallAi(72, { actionGap: 1000 }),
};

/**
 * Small enemy. Monster Pack 1 art, real AI and Frost — a second boss is still
 * `Boss1`, a pack of these is just more profiles.
 */
export class Mob extends Phaser.Physics.Arcade.Sprite implements AiActor, Damageable {
  readonly kind: MobKind;
  readonly spec: MobSpec;
  readonly frost = new FrostMark();
  hp: number;
  maxHp: number;
  private facing: Direction = 'down';
  private now = 0;
  private busyUntil = 0;
  private dead = false;
  private netTarget: Vector2Like | null = null;
  private readonly readyAt = new Map<string, number>();
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly barLift: number;
  /** Sprite centre to the ground it stands on — the depth-sort key. */
  private readonly footLift: number;
  private readonly home: Vector2Like;

  constructor(
    scene: Phaser.Scene,
    spawn: Vector2Like,
    kind: MobKind,
    private readonly hooks: MobHooks,
  ) {
    const spec = MOB_SPECS[kind];
    super(scene, spawn.x, spawn.y, spec.texture);
    this.kind = kind;
    this.spec = spec;
    this.hp = spec.maxHp;
    this.maxHp = spec.maxHp;
    this.home = { ...spawn };

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    const art = monsterArt(spec.texture);
    this.footLift = Math.round(art.height / 2);
    this.barLift = this.footLift + BAR_LIFT;
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(spec.body.width, spec.body.height);
    body?.setOffset((art.width - spec.body.width) / 2, art.height - spec.body.height);

    this.bar = scene.add.graphics().setDepth(20000);
  }

  get position(): Vector2Like {
    return { x: this.x, y: this.y };
  }

  get alive(): boolean {
    return !this.dead && this.hp > 0;
  }

  get busy(): boolean {
    return this.now < this.busyUntil;
  }

  get frozen(): boolean {
    return this.frost.frozen(this.now);
  }

  hitPoint(): Vector2Like {
    return { x: this.x, y: this.y };
  }

  hitRadius(): number {
    return this.spec.hitRadius;
  }

  move(direction: Vector2Like, speedScale = 1): void {
    if (this.busy || this.frozen || !this.alive) {
      this.setVelocity(0, 0);
      return;
    }
    const length = Math.hypot(direction.x, direction.y);
    if (length === 0) {
      this.halt();
      return;
    }
    const speed = this.spec.speed * speedScale;
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.facing = directionFromVector(direction, this.facing);
    this.setFlipX(this.facing === 'left');
  }

  halt(): void {
    this.setVelocity(0, 0);
  }

  look(direction: Vector2Like): void {
    if (this.busy) return;
    this.facing = directionFromVector(direction, this.facing);
    this.setFlipX(this.facing === 'left');
  }

  ready(actionId: string): boolean {
    if (!this.alive || this.busy || this.frozen) return false;
    return this.now >= (this.readyAt.get(actionId) ?? 0);
  }

  perform(actionId: string, aim: Vector2Like): boolean {
    if (!this.ready(actionId)) return false;
    const melee = actionId === 'melee';
    this.readyAt.set(actionId, this.now + (melee ? 1100 : 1600));
    this.busyUntil = this.now + (melee ? 280 : 360);
    this.setVelocity(0, 0);
    this.setTintFill(0xffd0a8);
    this.scene.time.delayedCall(melee ? 140 : 220, () => {
      this.clearTint();
      if (!this.alive) return;
      this.hooks.onStrike(this, {
        kind: melee ? 'melee' : 'bolt',
        damage: this.spec.attack,
        aim: { ...aim },
        x: this.x,
        y: this.y,
        reach: melee ? 36 : 220,
        radius: melee ? 28 : 22,
      });
    });
    return true;
  }

  applyHit(hit: HitInfo): void {
    if (hit.side !== 'player' || !this.alive) return;
    const now = this.now || this.scene.time.now;
    let damage = Math.max(1, Math.round(hit.damage - this.spec.defense));
    damage = this.frost.amplify(damage, now);
    this.hp = Math.max(hit.predicted ? 1 : 0, this.hp - damage);

    if (hit.frost) {
      const result = this.frost.add(hit.frost, now);
      this.hooks.onFrost?.(this, result.froze);
    }

    if (hit.knockback) {
      this.x += hit.aim.x * Math.min(hit.knockback, 8);
      this.y += hit.aim.y * Math.min(hit.knockback, 8) * 0.45;
    }

    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.alive) this.paintFrost(now);
    });

    if (this.hp <= 0) this.die();
  }

  tick(time: number, delta = 16): void {
    this.now = time;
    this.glide(delta);
    if (this.frost.update(time) && this.alive) this.paintFrost(time);
    if (this.frozen) this.setVelocity(0, 0);
    // Props sort on the ground they sit on, so a mob has to as well or it draws
    // in front of a tree it is standing behind.
    this.setDepth(this.y + this.footLift);
    this.drawBar();
  }

  /**
   * Guest replica: aim at the host's position instead of snapping to it, so a
   * mob walks between snapshots rather than jumping ten times a second.
   */
  syncFromHost(x: number, y: number, hp: number, alive: boolean): void {
    if (Phaser.Math.Distance.Between(this.x, this.y, x, y) > SNAP_TELEPORT_PX) {
      this.setPosition(x, y);
    }
    this.netTarget = { x, y };
    this.setVelocity(0, 0);
    this.hp = hp;
    if (!alive) {
      this.quietDie();
      return;
    }
    if (this.dead) {
      this.dead = false;
      this.setVisible(true);
      this.setActive(true);
      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body) body.enable = true;
      this.frost.reset();
      this.clearTint();
      this.setAlpha(1);
    }
  }

  /** Host's word on this mob's hp, ahead of the next snapshot. */
  setNetHp(hp: number): void {
    this.hp = Math.max(0, hp);
    if (this.hp <= 0) this.quietDie();
  }

  /** Promoted to host: stop chasing the old host and start simulating. */
  releaseNet(): void {
    this.netTarget = null;
  }

  private glide(delta: number): void {
    const target = this.netTarget;
    if (!target) return;
    const t = Math.min(1, delta / SNAP_LERP_MS);
    const x = Phaser.Math.Linear(this.x, target.x, t);
    const y = Phaser.Math.Linear(this.y, target.y, t);
    const dx = x - this.x;
    const dy = y - this.y;
    this.setPosition(x, y);
    if (Math.hypot(dx, dy) > 0.4) {
      this.facing = directionFromVector({ x: dx, y: dy }, this.facing);
      this.setFlipX(this.facing === 'left');
    }
  }

  private quietDie(): void {
    if (this.dead) {
      this.hp = 0;
      return;
    }
    this.dead = true;
    this.hp = 0;
    this.setVelocity(0, 0);
    this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
    this.bar.clear();
  }

  respawn(): void {
    this.dead = false;
    this.hp = this.maxHp;
    this.netTarget = null;
    this.setPosition(this.home.x, this.home.y);
    this.setVelocity(0, 0);
    this.setVisible(true);
    this.setActive(true);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = true;
    this.frost.reset();
    this.clearTint();
    this.setAlpha(1);
  }

  destroy(fromScene?: boolean): void {
    this.bar.destroy();
    super.destroy(fromScene);
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.setVelocity(0, 0);
    this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
    this.bar.clear();
    this.hooks.onDeath(this);
  }

  private paintFrost(now: number): void {
    if (!this.alive) return;
    if (this.frost.frozen(now)) {
      this.setTint(0x6fc8ff);
      return;
    }
    const stacks = this.frost.stacks(now);
    if (stacks === 0) {
      this.clearTint();
      return;
    }
    this.setTint(stacks === 1 ? 0xbcd8ec : 0x93c4e8);
  }

  private drawBar(): void {
    this.bar.clear();
    if (!this.alive) return;
    const width = 28;
    const x = Math.round(this.x - width / 2);
    const y = Math.round(this.y) - this.barLift;
    const fraction = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.bar.fillStyle(0x08060b, 0.85).fillRect(x - 1, y - 1, width + 2, 6);
    this.bar.fillStyle(0x2a1420, 1).fillRect(x, y, width, 4);
    this.bar.fillStyle(0xd2483f, 1).fillRect(x, y, Math.round(width * fraction), 4);
  }
}
