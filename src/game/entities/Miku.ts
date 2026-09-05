import Phaser from 'phaser';
import {
  MIKU_TEXTURE,
  MikuClip,
  createMikuAnimations,
  impactFrameOf,
  refDuration,
} from '../animations/mikuAnimations';
import type { ClipRef } from '../animations/mikuAnimations';
import { CombatSystem, MIKU_SKILLS, MikuSlot } from '../systems/CombatSystem';
import { COMBO_WINDOW, ComboChain, TINH_CA_TAM_LIEN } from '../systems/ComboChain';
import {
  DEFAULT_MIKU_STATS,
  DIRECTION_VECTORS,
  aimFromVector,
  directionFromVector,
} from '../types';
import type { CharacterState, CharacterStats, Direction, Vector2Like } from '../types';
import { GameBus, GameEvent, emitStats } from '../events';
import type {
  ComboPayload,
  ComboStatePayload,
  DashPayload,
  SkillPayload,
  StatePayload,
} from '../events';

/**
 * Miku of Ảo Âm Các — star-sword songstress.
 *
 * Geometry and combat both follow {@link NhuYen}: the sprite's (x, y) is the
 * point he stands on, because every atlas frame carries a pivot there, and each
 * action fires its damage on an animation frame rather than on a timer. His
 * frames vary in size far more than hers do — the overhead chop is 44px taller
 * than a walk step — so the physics body has to be re-placed whenever the
 * displayed frame changes; `syncBody` does that and `tick` notices.
 */

/** Feet-level collision box, so he overlaps props above the waist. */
const BODY_WIDTH = 28;
const BODY_HEIGHT = 16;

const DASH_DISTANCE = 168;
const DASH_DURATION = 170;
const DASH_SPEED = DASH_DISTANCE / (DASH_DURATION / 1000);

const STAR_SLASH_REACH = 48;
const STAR_ARRAY_REACH = 0;

const INPUT_BUFFER_FROM = 0.45;

export const MIKU_PROFILE = {
  id: 'miku',
  name: 'Miku',
  sect: 'Ảo Âm Các',
  skills: MIKU_SKILLS.map((s) => s.name),
  comboSteps: TINH_CA_TAM_LIEN.length,
} as const;

type PendingImpact =
  | { kind: 'combo'; payload: ComboPayload; frame: number }
  | { kind: 'skill'; payload: SkillPayload; slot: number; frame: number };

export class Miku extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  readonly combo: ComboChain;

  private currentState: CharacterState = 'idle';
  private facing: Direction = 'down';
  private aim: Vector2Like = { ...DIRECTION_VECTORS.down };
  private playedKey = '';
  /** Frame name the body offset was last computed for. */
  private syncedFrame = '';
  private dashEndsAt = 0;
  private dashFrom = { x: 0, y: 0 };
  private castHoldUntil = 0;
  private bufferedAttack = false;
  private pending: PendingImpact | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, stats?: Partial<CharacterStats>) {
    super(scene, x, y, MIKU_TEXTURE, 'idle_down_0');

    this.stats = { ...DEFAULT_MIKU_STATS, ...stats };
    this.combat = new CombatSystem(this.stats, MIKU_SKILLS);
    this.combo = new ComboChain(TINH_CA_TAM_LIEN, COMBO_WINDOW);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    createMikuAnimations(scene);

    this.setCollideWorldBounds(true);
    (this.body as Phaser.Physics.Arcade.Body | null)?.setSize(BODY_WIDTH, BODY_HEIGHT, false);

    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onAnimationUpdate, this);
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete, this);

    this.playState('idle', this.idleClip(), true);
    emitStats(this.stats);
    this.emitComboState();
  }

  get characterState(): CharacterState {
    return this.currentState;
  }

  get facingDirection(): Direction {
    return this.facing;
  }

  get aimVector(): Vector2Like {
    return { ...this.aim };
  }

  get isDead(): boolean {
    return this.currentState === 'dead';
  }

  get isBusy(): boolean {
    return (
      this.currentState === 'attack' ||
      this.currentState === 'skill' ||
      this.currentState === 'dash' ||
      this.currentState === 'hurt' ||
      this.currentState === 'dead'
    );
  }

  get isInvulnerable(): boolean {
    return this.currentState === 'dash';
  }

  tick(time: number, delta: number): void {
    if (this.combat.update(time, delta)) emitStats(this.stats);
    if (this.combo.update(time)) this.emitComboState();

    if (this.currentState === 'dash') {
      const travelled = Phaser.Math.Distance.Between(
        this.dashFrom.x,
        this.dashFrom.y,
        this.x,
        this.y,
      );
      const nextStep = (DASH_SPEED * delta) / 1000;
      if (time >= this.dashEndsAt || travelled + nextStep >= DASH_DISTANCE) {
        this.setVelocity(0, 0);
        this.playState('idle', this.idleClip(), true);
      }
    }

    if (this.currentState === 'skill' && time >= this.castHoldUntil && !this.anims.isPlaying) {
      this.playState('idle', this.idleClip(), true);
    }

    // Frame sizes differ between clips, so the feet-relative body offset only
    // holds until the displayed frame changes.
    if (this.frame.name !== this.syncedFrame) {
      this.syncedFrame = this.frame.name;
      this.syncBody();
    }
  }

  move(direction: Vector2Like): void {
    if (this.isBusy) {
      if (this.currentState !== 'dash') this.setVelocity(0, 0);
      return;
    }

    const length = Math.hypot(direction.x, direction.y);
    if (length === 0) {
      this.setVelocity(0, 0);
      this.playState('idle', this.idleClip());
      return;
    }

    const speed = this.stats.speed;
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.facing = directionFromVector(direction, this.facing);
    this.aim = aimFromVector(direction, this.aim);
    this.playState('walk', MikuClip.move(this.facing));
  }

  attack(): boolean {
    if (this.isDead) return false;

    if (this.currentState === 'attack') {
      if (this.anims.getProgress() >= INPUT_BUFFER_FROM) this.bufferedAttack = true;
      return this.bufferedAttack;
    }
    if (this.isBusy) return false;

    const now = this.scene.time.now;
    const clip = MikuClip.attack(this.facing, this.combo.pending);
    const hit = this.combo.press(now, () => refDuration(clip));

    this.setVelocity(0, 0);
    this.playState('attack', clip, true);

    const origin = this.hitOrigin(hit.step.reach);
    this.pending = {
      kind: 'combo',
      frame: impactFrameOf(clip),
      payload: {
        damage: this.combat.scaleDamage(hit.step.damageMultiplier),
        direction: this.facing,
        aim: this.aimVector,
        step: hit.index,
        of: this.combo.length,
        final: hit.final,
        frost: hit.step.frost,
        reach: hit.step.reach,
        radius: hit.step.radius,
        knockback: hit.step.knockback,
        ...origin,
      },
    };
    this.emitComboState();
    return true;
  }

  castStarSlash(): boolean {
    return this.cast(MikuSlot.StarSlash, MikuClip.starSlash(this.facing), STAR_SLASH_REACH);
  }

  castStarArray(): boolean {
    return this.cast(MikuSlot.StarArray, MikuClip.starArray(this.facing), STAR_ARRAY_REACH);
  }

  dash(steer?: Vector2Like): boolean {
    if (this.isDead) return false;
    if (this.isBusy && this.currentState !== 'hurt') return false;
    const slot = MikuSlot.ShadowStep;
    if (!this.combat.canCastSkill(slot)) {
      this.rejectSkill(slot);
      return false;
    }

    if (steer) {
      const length = Math.hypot(steer.x, steer.y);
      if (length > 0) {
        this.facing = directionFromVector(steer, this.facing);
        this.aim = aimFromVector(steer, this.aim);
      }
    }

    this.combat.beginSkill(slot);
    this.bufferedAttack = false;
    this.combo.reset();
    this.emitComboState();
    emitStats(this.stats);

    this.dashEndsAt = this.scene.time.now + DASH_DURATION;
    this.dashFrom = { x: this.x, y: this.y };
    this.setVelocity(this.aim.x * DASH_SPEED, this.aim.y * DASH_SPEED);
    this.playState('dash', MikuClip.dash(this.facing), true);

    const payload: DashPayload = {
      direction: this.facing,
      aim: this.aimVector,
      x: this.x,
      y: this.y,
      distance: DASH_DISTANCE,
      duration: DASH_DURATION,
    };
    GameBus.emit(GameEvent.Dash, payload);
    return true;
  }

  takeDamage(amount: number): void {
    if (this.isDead || this.isInvulnerable) return;

    const damage = this.combat.resolveIncoming(amount);
    this.stats.hp = Math.max(0, this.stats.hp - damage);
    emitStats(this.stats);
    GameBus.emit(GameEvent.Hurt, { damage, hp: this.stats.hp });

    if (this.stats.hp <= 0) {
      this.die();
      return;
    }

    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.emitComboState();
    this.setVelocity(0, 0);
    this.playState('hurt', MikuClip.hurt(), true);
  }

  die(): void {
    if (this.isDead) return;
    this.stats.hp = 0;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setVelocity(0, 0);
    this.playState('dead', MikuClip.death(), true);
    emitStats(this.stats);
    GameBus.emit(GameEvent.Death, { facing: this.facing });
  }

  revive(x = this.x, y = this.y): void {
    this.stats.hp = this.stats.maxHp;
    this.stats.spiritualPower = this.stats.maxSpiritualPower;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.currentState = 'dead';
    this.playState('idle', this.idleClip(), true);
    emitStats(this.stats);
    this.emitComboState();
  }

  private cast(slot: number, clip: ClipRef, reach: number): boolean {
    if (this.isBusy || this.isDead) return false;
    if (!this.combat.canCastSkill(slot)) {
      this.rejectSkill(slot);
      return false;
    }

    const skill = this.combat.skillAt(slot);
    const damage = this.combat.beginSkill(slot);
    this.bufferedAttack = false;
    this.combo.reset();
    this.emitComboState();
    this.setVelocity(0, 0);
    this.playState('skill', clip, true);
    this.castHoldUntil = this.scene.time.now + refDuration(clip) + (skill.recovery ?? 0);
    emitStats(this.stats);

    this.pending = {
      kind: 'skill',
      slot,
      frame: impactFrameOf(clip),
      payload: {
        damage,
        direction: this.facing,
        aim: this.aimVector,
        name: skill.name,
        cost: skill.spiritCost,
        frost: skill.frost ?? 0,
        ...this.hitOrigin(reach),
      },
    };
    return true;
  }

  private rejectSkill(slot: number): void {
    const skill = this.combat.skillAt(slot);
    GameBus.emit(GameEvent.SkillRejected, {
      name: skill.name,
      slot,
      reason: this.combat.hasSpiritFor(skill) ? 'cooldown' : 'spirit',
    });
  }

  private idleClip(): ClipRef {
    return MikuClip.idle(this.facing);
  }

  /**
   * Where a hit lands: `reach` px ahead of his paws, on the ground plane — the
   * same convention as Như Yên's, and for the same reason (screen Y encodes
   * distance in this view, so ranges have to be resolved flat).
   */
  private hitOrigin(reach: number): Vector2Like {
    return { x: this.x + this.aim.x * reach, y: this.y + this.aim.y * reach };
  }

  /**
   * Puts the collision box under his paws for the frame on display.
   *
   * Arcade places a body at `gameObject.position + offset - displayOrigin`, and
   * the displayed origin comes from the frame's baked pivot. Adding it back
   * means the box lands at (x - w/2, y - h) whatever size the frame is.
   */
  private syncBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setOffset(this.displayOriginX - BODY_WIDTH / 2, this.displayOriginY - BODY_HEIGHT);
  }

  private playState(next: CharacterState, clip: ClipRef, force = false): void {
    if (this.currentState !== next) {
      this.currentState = next;
      const payload: StatePayload = { state: next, facing: this.facing };
      GameBus.emit(GameEvent.StateChanged, payload);
    }

    this.setFlipX(clip.flip);
    if (force || this.playedKey !== clip.key) {
      this.playedKey = clip.key;
      if (force && next !== 'attack' && next !== 'skill') this.pending = null;
      if (this.anims && this.scene.anims.exists(clip.key)) {
        this.play(clip.key, !force);
      }
      // play() applies the first frame, so the body can be placed right away
      this.syncedFrame = this.frame.name;
      this.syncBody();
    }
  }

  private emitComboState(): void {
    const payload: ComboStatePayload = { pending: this.combo.pending, of: this.combo.length };
    GameBus.emit(GameEvent.ComboChanged, payload);
  }

  private onAnimationUpdate(
    _animation: Phaser.Animations.Animation,
    frame: Phaser.Animations.AnimationFrame,
  ): void {
    const pending = this.pending;
    if (!pending || frame.index < pending.frame) return;
    this.pending = null;

    if (pending.kind === 'combo') {
      GameBus.emit(GameEvent.Combo, pending.payload);
      GameBus.emit(GameEvent.Attack, pending.payload);
      return;
    }
    GameBus.emit(GameEvent.Skill, pending.payload);
  }

  private onAnimationComplete(animation: Phaser.Animations.Animation): void {
    if (this.isDead) return;
    if (animation.key !== this.playedKey) return;
    if (this.currentState === 'skill' && this.scene.time.now < this.castHoldUntil) return;

    const wasAttacking = this.currentState === 'attack';
    const finished = wasAttacking || this.currentState === 'skill' || this.currentState === 'hurt';
    if (!finished) return;

    this.playState('idle', this.idleClip(), true);

    if (wasAttacking && this.bufferedAttack) {
      this.bufferedAttack = false;
      this.attack();
    }
  }
}
