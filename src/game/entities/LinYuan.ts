import Phaser from 'phaser';
import {
  FRAME_HEIGHT,
  LIN_YUAN_TEXTURE,
  LinYuanAnim,
  STANDING_POINT,
  createLinYuanAnimations,
} from '../animations/linYuanAnimations';
import { CombatSystem } from '../systems/CombatSystem';
import {
  DEFAULT_LIN_YUAN_STATS,
  DIRECTION_VECTORS,
  directionFromVector,
} from '../types';
import type { CharacterState, CharacterStats, Direction, Vector2Like } from '../types';
import { GameBus, GameEvent, emitStats } from '../events';
import type { AttackPayload, DashPayload, SkillPayload, StatePayload } from '../events';

/**
 * Physics body: feet-sized, so the character overlaps props above the waist.
 * Derived from the atlas geometry, so replacing the art only means rebuilding
 * the atlas — no constants to hunt down here.
 */
const BODY_WIDTH = 26;
const BODY_HEIGHT = 16;
const BODY_OFFSET_X = STANDING_POINT.x - BODY_WIDTH / 2;
const BODY_OFFSET_Y = STANDING_POINT.y - BODY_HEIGHT;
/** Feet offset from the sprite's centre — used for hit origins and depth. */
export const FEET_OFFSET_Y = STANDING_POINT.y - FRAME_HEIGHT / 2;

/** How far in front of the character a hit lands. */
const ATTACK_REACH = 68;
const SKILL_REACH = 100;

export class LinYuan extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;

  private currentState: CharacterState = 'idle';
  private facing: Direction = 'down';
  /** Facing the last time an animation was started, to avoid restarts. */
  private playedKey = '';

  constructor(scene: Phaser.Scene, x: number, y: number, stats?: Partial<CharacterStats>) {
    super(scene, x, y, LIN_YUAN_TEXTURE, 'idle_down_0');

    this.stats = { ...DEFAULT_LIN_YUAN_STATS, ...stats };
    this.combat = new CombatSystem(this.stats);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    createLinYuanAnimations(scene);

    this.setOrigin(0.5, 0.5);
    this.setCollideWorldBounds(true);
    this.body?.setSize(BODY_WIDTH, BODY_HEIGHT);
    (this.body as Phaser.Physics.Arcade.Body | null)?.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete, this);
    this.playState('idle');
    emitStats(this.stats);
  }

  /* ------------------------------------------------------------- accessors */

  get characterState(): CharacterState {
    return this.currentState;
  }

  get facingDirection(): Direction {
    return this.facing;
  }

  get isDead(): boolean {
    return this.currentState === 'dead';
  }

  /** True while an action animation owns the character (no input allowed). */
  get isBusy(): boolean {
    return (
      this.currentState === 'attack' ||
      this.currentState === 'skill' ||
      this.currentState === 'hurt' ||
      this.currentState === 'dead'
    );
  }

  /* ---------------------------------------------------------------- update */

  /** Called every frame by the controller; drives cooldowns and SP regen. */
  tick(time: number, delta: number): void {
    if (this.combat.update(time, delta)) emitStats(this.stats);
  }

  /* --------------------------------------------------------------- actions */

  move(direction: Vector2Like): void {
    if (this.isBusy) {
      this.setVelocity(0, 0);
      return;
    }

    const length = Math.hypot(direction.x, direction.y);
    if (length === 0) {
      this.setVelocity(0, 0);
      this.playState('idle');
      return;
    }

    const speed = this.stats.speed;
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.facing = directionFromVector(direction, this.facing);
    this.playState('walk');
  }

  attack(): boolean {
    if (this.isBusy || this.isDead || !this.combat.canAttack()) return false;

    const damage = this.combat.beginAttack();
    this.setVelocity(0, 0);
    this.playState('attack', true);

    const origin = this.hitOrigin(ATTACK_REACH);
    const payload: AttackPayload = {
      damage,
      direction: this.facing,
      // Lâm Uyên only ever aims along a cardinal facing; Như Yên aims eight-way.
      aim: DIRECTION_VECTORS[this.facing],
      ...origin,
    };
    GameBus.emit(GameEvent.Attack, payload);
    return true;
  }

  castSkill(slot = 0): boolean {
    if (this.isBusy || this.isDead) return false;
    if (!this.combat.canCastSkill(slot)) {
      const skill = this.combat.skillAt(slot);
      GameBus.emit(GameEvent.SkillRejected, {
        name: skill.name,
        reason: this.combat.isSkillLocked(slot)
          ? 'locked'
          : this.combat.hasSpiritFor(skill)
            ? 'cooldown'
            : 'spirit',
      });
      return false;
    }

    const skill = this.combat.skillAt(slot);
    // Dash slot (2): short lunge without a dedicated dash clip.
    if (slot === 2 && skill.damageMultiplier <= 0) {
      this.combat.beginSkill(slot);
      emitStats(this.stats);
      const aim = DIRECTION_VECTORS[this.facing];
      this.setVelocity(aim.x * 420, aim.y * 420);
      this.scene.time.delayedCall(140, () => {
        if (!this.isDead) this.setVelocity(0, 0);
      });
      GameBus.emit(GameEvent.Dash, {
        direction: this.facing,
        aim,
        x: this.x,
        y: this.y + FEET_OFFSET_Y,
        distance: 90,
        duration: 140,
      } satisfies DashPayload);
      return true;
    }

    const damage = this.combat.beginSkill(slot);
    this.setVelocity(0, 0);
    this.playState('skill', true);
    emitStats(this.stats);

    const origin = this.hitOrigin(slot === 3 ? SKILL_REACH * 1.4 : SKILL_REACH);
    const payload: SkillPayload = {
      damage,
      direction: this.facing,
      aim: DIRECTION_VECTORS[this.facing],
      name: skill.name,
      cost: skill.spiritCost,
      ...origin,
    };
    GameBus.emit(GameEvent.Skill, payload);
    return true;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;

    const damage = this.combat.resolveIncoming(amount);
    this.stats.hp = Math.max(0, this.stats.hp - damage);
    emitStats(this.stats);
    GameBus.emit(GameEvent.Hurt, { damage, hp: this.stats.hp });

    if (this.stats.hp <= 0) {
      this.die();
      return;
    }

    this.setVelocity(0, 0);
    this.playState('hurt', true);
  }

  die(): void {
    if (this.isDead) return;
    this.stats.hp = 0;
    this.setVelocity(0, 0);
    this.playState('dead', true);
    emitStats(this.stats);
    GameBus.emit(GameEvent.Death, { facing: this.facing });
  }

  /** Full reset — used by the demo scene's respawn. */
  revive(x = this.x, y = this.y): void {
    this.stats.hp = this.stats.maxHp;
    this.stats.spiritualPower = this.stats.maxSpiritualPower;
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    // go through playState so the HUD hears about the state change
    this.currentState = 'dead';
    this.playState('idle', true);
    emitStats(this.stats);
  }

  /* --------------------------------------------------------------- internals */

  /** World position of the hit centre, `reach` px in front of the character. */
  private hitOrigin(reach: number): Vector2Like {
    const vec = DIRECTION_VECTORS[this.facing];
    return { x: this.x + vec.x * reach, y: this.y + FEET_OFFSET_Y - 18 + vec.y * reach };
  }

  private playState(next: CharacterState, force = false): void {
    const key = this.animationKeyFor(next);
    if (this.currentState !== next) {
      this.currentState = next;
      const payload: StatePayload = { state: next, facing: this.facing };
      GameBus.emit(GameEvent.StateChanged, payload);
    }
    if (force || this.playedKey !== key) {
      this.playedKey = key;
      this.play(key, !force);
    }
  }

  private animationKeyFor(state: CharacterState): string {
    switch (state) {
      case 'walk':
        return LinYuanAnim.walk(this.facing);
      case 'attack':
        return LinYuanAnim.attack(this.facing);
      case 'skill':
        return LinYuanAnim.skill(this.facing);
      case 'hurt':
        return LinYuanAnim.hurt;
      case 'dead':
        return LinYuanAnim.death;
      case 'idle':
      default:
        return LinYuanAnim.idle(this.facing);
    }
  }

  private onAnimationComplete(animation: Phaser.Animations.Animation): void {
    if (animation.key === LinYuanAnim.death) return; // stays on the last frame
    if (this.isDead) return;
    if (
      animation.key === LinYuanAnim.attack(this.facing) ||
      animation.key === LinYuanAnim.skill(this.facing) ||
      animation.key === LinYuanAnim.hurt
    ) {
      this.currentState = 'idle';
      this.playState('idle', true);
    }
  }
}
