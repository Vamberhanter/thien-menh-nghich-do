import Phaser from 'phaser';
import {
  NHU_YEN_TEXTURE,
  NhuYenClip,
  createNhuYenAnimations,
  impactFrameOf,
  locomotionTimeScale,
  refDuration,
} from '../animations/nhuYenAnimations';
import type { ClipRef } from '../animations/nhuYenAnimations';
import { CombatSystem, NHU_YEN_SKILLS, NhuYenSlot } from '../systems/CombatSystem';
import { COMBO_WINDOW, ComboChain, HAN_BANG_TAM_THUC } from '../systems/ComboChain';
import {
  DEFAULT_NHU_YEN_STATS,
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
 * Như Yên of Băng Cung.
 *
 * Two things work differently from {@link LinYuan}:
 *
 *  * **The sprite's (x, y) is the point she stands on.** Her atlas frames each
 *    carry a pivot on her feet, so there is no half-frame offset to add for
 *    hitboxes or depth sorting. The catch is that her frames are not all the
 *    same size — the ice channel is 366x276, idle is 104x128 — so the physics
 *    body offset has to be recomputed whenever the displayed frame changes.
 *    `syncBody` does that; `tick` notices the change.
 *
 *  * **Actions fire their damage on an animation frame, not on a timer.** The
 *    frame is listed in the animations module next to the art it belongs to, so
 *    retiming a swing retimes its hit, and an interrupted swing (she gets hit
 *    mid-combo) simply never reaches its impact frame and deals nothing.
 */

/** Feet-level collision box, so she overlaps props above the waist. */
const BODY_WIDTH = 24;
const BODY_HEIGHT = 14;

/** Sprint multiplier on `stats.speed`. */
const RUN_MULTIPLIER = 1.6;

/** Sương Ảnh Bộ: how far the lunge carries her and how long it takes. */
const DASH_DISTANCE = 168;
const DASH_DURATION = 170;
const DASH_SPEED = DASH_DISTANCE / (DASH_DURATION / 1000);

/**
 * Reach of the two techniques, measured from her feet.
 *
 * Băng Tinh Trận has none: the sheet draws its last two frames as the ice
 * bursting up **around the caster** — the small figure inside the pillar is her —
 * so its own pillar rises where she stands. The rest of the array spreads
 * outward from there; that spread lives in the scene with the other ranges.
 */
const QI_SLASH_REACH = 48;
const ICE_ARRAY_REACH = 0;

/** How far into a swing a press starts being buffered for the next one. */
const INPUT_BUFFER_FROM = 0.45;

export const NHU_YEN_PROFILE = {
  id: 'nhuyen',
  name: 'Như Yên',
  sect: 'Băng Cung',
  skills: NHU_YEN_SKILLS.map((s) => s.name),
  comboSteps: HAN_BANG_TAM_THUC.length,
} as const;

/** What a queued action should emit once its animation reaches the hit frame. */
type PendingImpact =
  | { kind: 'combo'; payload: ComboPayload; frame: number }
  | { kind: 'skill'; payload: SkillPayload; slot: number; frame: number };

export class NhuYen extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  readonly combo: ComboChain;

  private currentState: CharacterState = 'idle';
  private facing: Direction = 'down';
  /**
   * Where she is aimed, as a unit vector. Tracks the movement keys at full
   * eight-way resolution while `facing` rounds to the nearest drawn view, so a
   * diagonal press attacks diagonally.
   */
  private aim: Vector2Like = { ...DIRECTION_VECTORS.down };
  private playedKey = '';
  /** Frame name the body offset was last computed for. */
  private syncedFrame = '';
  private dashEndsAt = 0;
  /** Where the current lunge started, so it can stop on distance, not on time. */
  private dashFrom = { x: 0, y: 0 };
  /** Earliest a cast may end, for skills whose effect outlives their animation. */
  private castHoldUntil = 0;
  /** A combo press taken during a swing, spent when that swing ends. */
  private bufferedAttack = false;
  private pending: PendingImpact | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, stats?: Partial<CharacterStats>) {
    super(scene, x, y, NHU_YEN_TEXTURE, 'idle_down_0');

    this.stats = { ...DEFAULT_NHU_YEN_STATS, ...stats };
    this.combat = new CombatSystem(this.stats, NHU_YEN_SKILLS);
    this.combo = new ComboChain(HAN_BANG_TAM_THUC, COMBO_WINDOW);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    createNhuYenAnimations(scene);

    this.setCollideWorldBounds(true);
    (this.body as Phaser.Physics.Arcade.Body | null)?.setSize(BODY_WIDTH, BODY_HEIGHT, false);

    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onAnimationUpdate, this);
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimationComplete, this);

    this.playState('idle', this.idleClip(), true);
    emitStats(this.stats);
    this.emitComboState();
  }

  /* ------------------------------------------------------------- accessors */

  get characterState(): CharacterState {
    return this.currentState;
  }

  get facingDirection(): Direction {
    return this.facing;
  }

  /** Unit vector she is aimed along — eight-way, unlike `facingDirection`. */
  get aimVector(): Vector2Like {
    return { ...this.aim };
  }

  get isDead(): boolean {
    return this.currentState === 'dead';
  }

  /** True while an action owns the character and input is ignored. */
  get isBusy(): boolean {
    return (
      this.currentState === 'attack' ||
      this.currentState === 'skill' ||
      this.currentState === 'dash' ||
      this.currentState === 'hurt' ||
      this.currentState === 'dead'
    );
  }

  /** Sương Ảnh Bộ phases through damage — that is the whole point of it. */
  get isInvulnerable(): boolean {
    return this.currentState === 'dash';
  }

  /* ---------------------------------------------------------------- update */

  tick(time: number, delta: number): void {
    if (this.combat.update(time, delta)) emitStats(this.stats);

    if (this.combo.update(time)) this.emitComboState();

    if (this.currentState === 'dash') {
      // Ends on distance as well as on time, so the lunge covers the same
      // ground at any frame rate. `tick` runs before the physics step, so the
      // step about to happen is counted in: checking the distance already
      // travelled would only notice the overshoot after it happened.
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

    // release a cast that was holding its last pose for its effect
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

  /* --------------------------------------------------------------- actions */

  /** `sprint` is the sprint key's state; it only applies while moving. */
  move(direction: Vector2Like, sprint = false): void {
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

    const speed = this.stats.speed * (sprint ? RUN_MULTIPLIER : 1);
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.facing = directionFromVector(direction, this.facing);
    this.aim = aimFromVector(direction, this.aim);

    const clip = NhuYenClip.move(this.facing, sprint);
    this.playState(sprint ? 'run' : 'walk', clip);
    // Speed only nudges the rate — the art has no planted foot to sync to, and
    // chasing one made the arms flail. See `locomotionTimeScale`.
    this.anims.timeScale = locomotionTimeScale(clip, speed, this.stats.speed);
  }

  /**
   * Hàn Băng Tam Thức. Each press advances the chain if the window is still
   * open, otherwise it starts again at the first form.
   *
   * A press landing in the back half of a swing is remembered and spent the
   * instant that swing ends, so chaining does not demand frame-perfect timing.
   * Pacing is the animation's and the chain's; there is deliberately no attack
   * cooldown on top, which would only eat presses the chain would have taken.
   */
  attack(): boolean {
    if (this.isDead) return false;

    if (this.currentState === 'attack') {
      if (this.anims.getProgress() >= INPUT_BUFFER_FROM) this.bufferedAttack = true;
      return this.bufferedAttack;
    }
    if (this.isBusy) return false;

    const now = this.scene.time.now;
    const hit = this.combo.press(now, (index) =>
      refDuration(NhuYenClip.attack(this.facing, index)),
    );

    const clip = NhuYenClip.attack(this.facing, hit.index);
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

  /** Băng Phách Trảm — a crescent of qi thrown along the facing. */
  castQiSlash(): boolean {
    return this.cast(NhuYenSlot.QiSlash, NhuYenClip.qiSlash(this.facing), QI_SLASH_REACH);
  }

  /** Băng Tinh Trận — a channelled ice eruption on the ground ahead. */
  castIceArray(): boolean {
    return this.cast(NhuYenSlot.IceArray, NhuYenClip.channel(this.facing), ICE_ARRAY_REACH);
  }

  /** Sương Ảnh Bộ — a short invulnerable lunge that leaves afterimages. */
  dash(): boolean {
    if (this.isBusy || this.isDead) return false;
    const slot = NhuYenSlot.ShadowStep;
    if (!this.combat.canCastSkill(slot)) {
      this.rejectSkill(slot);
      return false;
    }

    this.combat.beginSkill(slot);
    this.bufferedAttack = false;
    this.combo.reset();
    this.emitComboState();
    emitStats(this.stats);

    // the lunge follows the aim, so it can be thrown along a diagonal too
    this.dashEndsAt = this.scene.time.now + DASH_DURATION;
    this.dashFrom = { x: this.x, y: this.y };
    this.setVelocity(this.aim.x * DASH_SPEED, this.aim.y * DASH_SPEED);
    const clip = NhuYenClip.dash(this.facing);
    this.playState('dash', clip, true);
    // the lunge is far faster than any run, so it just takes the top of the
    // response range rather than a rate of its own
    this.anims.timeScale = locomotionTimeScale(clip, DASH_SPEED, this.stats.speed);

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

    // being staggered drops both the pending hit and the chain
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.emitComboState();
    this.setVelocity(0, 0);
    this.playState('hurt', NhuYenClip.hurt(), true);
  }

  die(): void {
    if (this.isDead) return;
    this.stats.hp = 0;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setVelocity(0, 0);
    this.playState('dead', NhuYenClip.death(), true);
    emitStats(this.stats);
    GameBus.emit(GameEvent.Death, { facing: this.facing });
  }

  /** Full reset — used by the demo scene's respawn. */
  revive(x = this.x, y = this.y): void {
    this.stats.hp = this.stats.maxHp;
    this.stats.spiritualPower = this.stats.maxSpiritualPower;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    // route through playState so the HUD hears the state change
    this.currentState = 'dead';
    this.playState('idle', this.idleClip(), true);
    emitStats(this.stats);
    this.emitComboState();
  }

  /* ------------------------------------------------------------- internals */

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
    // The channel's last frame is the peak pose, and `repeat: 0` parks the
    // animation on it. Holding there for `recovery` lets the ice erupt around
    // her instead of her popping back to idle inside her own pillar.
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
    return NhuYenClip.idle(this.facing);
  }

  /**
   * Where a hit lands: `reach` px ahead of her feet, **on the ground plane**.
   *
   * Ranges are resolved on the ground rather than at chest height because in
   * this three-quarter view a target's screen Y encodes how far away it is, not
   * how tall it is. Mixing the two makes the vertical gap between a standing
   * character and a waist-high prop eat the whole hit radius. Effects lift
   * themselves off the ground when they are drawn; the numbers stay flat.
   */
  private hitOrigin(reach: number): Vector2Like {
    return { x: this.x + this.aim.x * reach, y: this.y + this.aim.y * reach };
  }

  /**
   * Puts the collision box under her feet for the frame on display.
   *
   * Arcade places a body at `gameObject.position + offset - displayOrigin`, and
   * the displayed origin comes from the frame's baked pivot, which sits on her
   * feet. Adding it back means the box lands at (x - w/2, y - h) whatever size
   * the current frame happens to be.
   */
  private syncBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setOffset(
      this.displayOriginX - BODY_WIDTH / 2,
      this.displayOriginY - BODY_HEIGHT,
    );
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
      if (force) this.pending = null;
      this.anims.timeScale = 1;
      this.play(clip.key, !force);
      // play() applies the first frame, so the body can be placed right away
      this.syncedFrame = this.frame.name;
      this.syncBody();
    }
  }

  private emitComboState(): void {
    const payload: ComboStatePayload = { pending: this.combo.pending, of: this.combo.length };
    GameBus.emit(GameEvent.ComboChanged, payload);
  }

  /** Fires a queued hit the moment its animation reaches the impact frame. */
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
    if (this.isDead) return; // death holds on its last frame
    if (animation.key !== this.playedKey) return;

    // a cast whose effect is still playing keeps its final pose; tick releases it
    if (this.currentState === 'skill' && this.scene.time.now < this.castHoldUntil) return;

    const wasAttacking = this.currentState === 'attack';
    const finished = wasAttacking || this.currentState === 'skill' || this.currentState === 'hurt';
    if (!finished) return;

    this.playState('idle', this.idleClip(), true);

    // spend a press that arrived mid-swing, chaining without a dropped input
    if (wasAttacking && this.bufferedAttack) {
      this.bufferedAttack = false;
      this.attack();
    }
  }
}
