import Phaser from 'phaser';
import type { Vector2Like } from '../types';
import { directionFromVector } from '../types';
import type { Direction } from '../types';
import type { AiActor, AiProfile } from '../systems/EnemyAI';
import type { Damageable, HitInfo } from '../systems/Damageable';
import { FrostMark } from '../systems/FrostMark';
import type { MobKind } from '../zones/types';
import { MobTexture } from '../scenes/BootScene';

const BODY = { width: 22, height: 14 };

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
  tint: number;
  scale: number;
  hitRadius: number;
}

export const MOB_SPECS: Record<MobKind, MobSpec> = {
  wolf: {
    kind: 'wolf',
    name: 'Sói linh',
    maxHp: 46,
    attack: 8,
    defense: 1,
    speed: 118,
    texture: MobTexture.Wolf,
    tint: 0xffffff,
    scale: 1,
    hitRadius: 14,
  },
  archer: {
    kind: 'archer',
    name: 'Cung thủ tà',
    maxHp: 38,
    attack: 9,
    defense: 1,
    speed: 96,
    texture: MobTexture.Archer,
    tint: 0xffffff,
    scale: 1,
    hitRadius: 12,
  },
  brute: {
    kind: 'brute',
    name: 'Lực sĩ huyết',
    maxHp: 88,
    attack: 12,
    defense: 3,
    speed: 72,
    texture: MobTexture.Brute,
    tint: 0xffffff,
    scale: 1.15,
    hitRadius: 18,
  },
};

export const MOB_AI: Record<MobKind, AiProfile> = {
  wolf: {
    aggroRadius: 280,
    leashRadius: 480,
    keepDistance: 42,
    patrolRadius: 110,
    patrolPause: [700, 1800],
    patrolSpeed: 0.4,
    actionGap: 700,
    strafe: 0.45,
    homeRadius: 360,
    actions: [{ id: 'melee', maxRange: 52, priority: 3, recover: 180 }],
  },
  archer: {
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
  },
  brute: {
    aggroRadius: 240,
    leashRadius: 420,
    keepDistance: 50,
    patrolRadius: 80,
    patrolPause: [1200, 2400],
    patrolSpeed: 0.3,
    actionGap: 900,
    strafe: 0.15,
    homeRadius: 300,
    actions: [{ id: 'melee', maxRange: 64, priority: 3, recover: 280 }],
  },
};

/**
 * Small enemy. Placeholder art, real AI and Frost — a second boss is still
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
  private readonly readyAt = new Map<string, number>();
  private readonly bar: Phaser.GameObjects.Graphics;
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
    this.setScale(spec.scale);
    this.setTint(spec.tint);
    this.setCollideWorldBounds(true);
    this.body?.setSize(BODY.width, BODY.height);
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
    this.hp = Math.max(0, this.hp - damage);

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

  tick(time: number): void {
    this.now = time;
    if (this.frost.update(time) && this.alive) this.paintFrost(time);
    if (this.frozen) this.setVelocity(0, 0);
    this.setDepth(this.y);
    this.drawBar();
  }

  /** Guest replica: match the host without firing death/loot hooks. */
  syncFromHost(x: number, y: number, hp: number, alive: boolean): void {
    this.setPosition(x, y);
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
    const y = Math.round(this.y) - 36;
    const fraction = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.bar.fillStyle(0x08060b, 0.85).fillRect(x - 1, y - 1, width + 2, 6);
    this.bar.fillStyle(0x2a1420, 1).fillRect(x, y, width, 4);
    this.bar.fillStyle(0xd2483f, 1).fillRect(x, y, Math.round(width * fraction), 4);
  }
}
