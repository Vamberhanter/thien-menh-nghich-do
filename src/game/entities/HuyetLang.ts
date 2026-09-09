import Phaser from 'phaser';
import { GroundShadow } from '../systems/GroundShadow';
import {
  HUYET_LANG_TEXTURE,
  HuyetLangClip,
  createHuyetLangAnimations,
  impactFrameOf,
  refDuration,
} from '../animations/huyetLangAnimations';
import type { ClipRef } from '../animations/huyetLangAnimations';
import { CombatSystem, HUYET_LANG_SKILLS, HuyetLangSlot } from '../systems/CombatSystem';
import { COMBO_WINDOW, ComboChain, TAM_THU_LIET_CHAM } from '../systems/ComboChain';
import {
  DEFAULT_HUYET_LANG_STATS,
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
 * Huyết Lang of Tam Thủ Môn — three-headed magma mecha.
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

const MAGMA_SLASH_REACH = 48;
const ROAR_REACH = 0;

const INPUT_BUFFER_FROM = 0.45;

/**
 * Shortest gap between two stagger animations.
 *
 * Every hit flashes the character; only some of them play the flinch. Without
 * the gap a pack of three mobs restarts the animation on top of itself several
 * times a second, and it reads as juddering in place even though nothing is
 * actually holding them — the same rate limit the boss has had since it could
 * be stun-locked out of its own fight.
 */
const FLINCH_GAP = 900;

export const HUYET_LANG_PROFILE = {
  id: 'huyetlang',
  name: 'Huyết Lang',
  sect: 'Tam Thủ Môn',
  skills: HUYET_LANG_SKILLS.map((s) => s.name),
  comboSteps: TAM_THU_LIET_CHAM.length,
} as const;

type PendingImpact =
  | { kind: 'combo'; payload: ComboPayload; frame: number }
  | { kind: 'skill'; payload: SkillPayload; slot: number; frame: number };

export class HuyetLang extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  readonly combo: ComboChain;
  /**
   * The mark he leaves on the floor. Nothing in this kit leaves the ground, so
   * it never lifts — it is here to attach the sprite to the tile it stands on,
   * which is what stops it reading as a picture laid over the world.
   */
  private readonly shadow = new GroundShadow(this.scene, { size: { w: 46, h: 18 }, lift: 0 });

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
  /** Earliest time another hit may play the stagger — see `FLINCH_GAP`. */
  private nextFlinchAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, stats?: Partial<CharacterStats>) {
    super(scene, x, y, HUYET_LANG_TEXTURE, 'idle_down_0');

    this.stats = { ...DEFAULT_HUYET_LANG_STATS, ...stats };
    this.combat = new CombatSystem(this.stats, HUYET_LANG_SKILLS);
    this.combo = new ComboChain(TAM_THU_LIET_CHAM, COMBO_WINDOW);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    createHuyetLangAnimations(scene);

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
      this.currentState === 'dead'
    );
  }

  get isInvulnerable(): boolean {
    return this.currentState === 'dash';
  }

  tick(time: number, delta: number): void {
    if (this.isDead) this.shadow.hide();
    else this.shadow.sync(this.x, this.y);
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
      // A stagger is allowed to *finish* while he stands there, which is where
      // the hit reads best. It is never allowed to stop him: pressing a
      // direction falls through to the walk below and cuts it short.
      if (this.currentState === 'hurt' && this.anims.isPlaying) return;
      this.playState('idle', this.idleClip());
      return;
    }

    const speed = this.stats.speed;
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.facing = directionFromVector(direction, this.facing);
    this.aim = aimFromVector(direction, this.aim);
    this.playState('walk', HuyetLangClip.move(this.facing));
  }

  attack(steer?: Vector2Like): boolean {
    if (this.isDead) return false;

    if (this.currentState === 'attack') {
      if (this.anims.getProgress() >= INPUT_BUFFER_FROM) this.bufferedAttack = true;
      return this.bufferedAttack;
    }
    if (this.isBusy) return false;

    // same one-frame staleness as the casts — see above
    this.turn(steer);
    const now = this.scene.time.now;
    const clip = HuyetLangClip.attack(this.facing, this.combo.pending);
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

  /*
   * Each of these takes the heading held at the moment of the press, the way
   * the dash does. Without it a skill fired in the same frame as the direction
   * key went out along the *previous* facing: the controller checks actions
   * before movement so a press wins its frame, which means `move` has not run
   * yet and the facing is one frame stale. Turning to face an enemy and
   * striking is a single motion for the player, so it has to be one here.
   */
  castMagmaSlash(steer?: Vector2Like): boolean {
    return this.cast(HuyetLangSlot.MagmaSlash, HuyetLangClip.magmaSlash, MAGMA_SLASH_REACH, steer);
  }

  /** Their ultimate, through the factory signature the cast takes now. */
  castUltimate(steer?: Vector2Like): boolean {
    return this.cast(
      HuyetLangSlot.Ultimate,
      HuyetLangClip.magmaSlash,
      MAGMA_SLASH_REACH * 1.35,
      steer,
    );
  }

  castRoar(steer?: Vector2Like): boolean {
    return this.cast(HuyetLangSlot.Roar, HuyetLangClip.roar, ROAR_REACH, steer);
  }

  dash(steer?: Vector2Like): boolean {
    if (this.isDead) return false;
    if (this.isBusy) return false;
    const slot = HuyetLangSlot.ShadowStep;
    if (!this.combat.canCastSkill(slot)) {
      this.rejectSkill(slot);
      return false;
    }

    this.turn(steer);

    this.combat.beginSkill(slot);
    this.bufferedAttack = false;
    this.combo.reset();
    this.emitComboState();
    emitStats(this.stats);

    this.dashEndsAt = this.scene.time.now + DASH_DURATION;
    this.dashFrom = { x: this.x, y: this.y };
    this.setVelocity(this.aim.x * DASH_SPEED, this.aim.y * DASH_SPEED);
    this.playState('dash', HuyetLangClip.dash(this.facing), true);

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

    /*
     * Every hit flashes, and that flash is the whole of the feedback most of
     * the time.
     *
     * Being hit used to hand the body over to the stagger: velocity zeroed,
     * `isBusy` true, no input accepted until the clip ran out. Against one mob
     * that is a beat of drama; against three it is a quarter of a second of
     * dead controls every time any of them connects, which is what the
     * juddering was. It never takes the body now — the flinch plays only when
     * there is nothing else to show, and moving away cuts it short.
     */
    this.setTintFill(0xff9aa6);
    this.scene.time.delayedCall(70, () => {
      // `scene` is what Phaser nulls on destroy, and the timer outlives the
      // sprite. Cleared even when the hit was lethal, so the death animation
      // plays in the character's own colours.
      if (this.scene) this.clearTint();
    });

    // A swing or a cast is left to finish, damage and all: an action the
    // player already committed to is exactly what must not be snatched away.
    const now = this.scene.time.now;
    if (this.isBusy || now < this.nextFlinchAt) return;
    this.nextFlinchAt = now + FLINCH_GAP;

    // Reaching here means the character was idle or walking, so there is no
    // pending hit to drop — but the chain window may still be open, and a hit
    // closes it.
    this.combo.reset();
    this.emitComboState();
    this.playState('hurt', HuyetLangClip.hurt(), true);
  }

  die(): void {
    if (this.isDead) return;
    this.stats.hp = 0;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setVelocity(0, 0);
    this.playState('dead', HuyetLangClip.death(), true);
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

  private cast(
    slot: number,
    clipFor: (direction: Direction) => ClipRef,
    reach: number,
    steer?: Vector2Like,
  ): boolean {
    if (this.isBusy || this.isDead) return false;
    if (!this.combat.canCastSkill(slot)) {
      this.rejectSkill(slot);
      return false;
    }

    // turn before the clip is chosen: which art plays depends on the facing
    this.turn(steer);
    const clip = clipFor(this.facing);

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

  /** Face a held heading, if one is held. Ignores a neutral stick. */
  private turn(steer?: Vector2Like): void {
    if (!steer) return;
    if (Math.hypot(steer.x, steer.y) === 0) return;
    this.facing = directionFromVector(steer, this.facing);
    this.aim = aimFromVector(steer, this.aim);
  }
  /** The shadow is a scene object rather than a child, so it needs saying. */
  destroy(fromScene?: boolean): void {
    this.shadow.destroy();
    super.destroy(fromScene);
  }

  private rejectSkill(slot: number): void {
    const skill = this.combat.skillAt(slot);
    const reason = this.combat.isSkillLocked(slot)
      ? 'locked'
      : this.combat.hasSpiritFor(skill)
        ? 'cooldown'
        : 'spirit';
    GameBus.emit(GameEvent.SkillRejected, {
      name: skill.name,
      slot,
      reason,
    });
  }

  private idleClip(): ClipRef {
    return HuyetLangClip.idle(this.facing);
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
   * means the box lands at (x - w/2, y - h/2) whatever size the frame is.
   *
   * The box is centred on the feet, not hung behind them. It used to sit at
   * (x - w/2, y - h) — the whole footprint *behind* the foot line — and every
   * prop's box is the bottom band of its art, so the two together made a solid
   * strip that reached BODY_HEIGHT further downhill than anything drawn there.
   * Measured against a manaseed rock (base row y, box 18 tall): walking along
   * a lane up to 12px in front of the rock was blocked, and free only from
   * 14px. Worse than a wall, it was a *silent* one — Arcade separates Y first,
   * but a purely horizontal walk has no Y delta to reverse, so the graze could
   * not be pushed out on Y and fell through to X, which reads as the character
   * jamming on empty grass. Centred, the strip straddles the base it belongs
   * to and the same lane clears at 8px.
   */
  private syncBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setOffset(this.displayOriginX - BODY_WIDTH / 2, this.displayOriginY - BODY_HEIGHT / 2);
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
