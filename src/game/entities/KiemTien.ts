import Phaser from 'phaser';
import {
  KIEMTIEN_ART_SCALE,
  KIEMTIEN_TEXTURE,
  KiemTienClip,
  createKiemTienAnimations,
  impactFrameOf,
  refDuration,
} from '../animations/kiemtienAnimations';
import type { ClipRef } from '../animations/kiemtienAnimations';
import { CombatSystem, KIEM_TIEN_SKILLS, KiemTienSlot } from '../systems/CombatSystem';
import { GroundShadow } from '../systems/GroundShadow';
import { COMBO_WINDOW, ComboChain } from '../systems/ComboChain';
import type { ComboStep } from '../systems/ComboChain';
import {
  DEFAULT_KIEM_TIEN_STATS,
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
 * Kiếm Tiên of Thanh Vân Kiếm Các — one sword, eight headings, and a blade she
 * rides.
 *
 * Geometry and combat follow {@link Wukong}, whose shape hers matches: four
 * techniques plus a flight, five slots where the older three kits carry three.
 * The sprite's (x, y) is the point she stands on, and each action fires its
 * damage on an animation frame rather than on a timer.
 *
 * Three things are her own:
 *
 *  * **One swing, not a chain.** Her attack sheet draws a single complete cut
 *    per heading rather than a three-beat combo, so `ComboChain` runs with one
 *    step. It stays in the picture regardless — the buffered follow-up press,
 *    the HUD's chain readout and the net `atk` index all key off it, and a
 *    one-step chain answers all three without a special case.
 *  * **She swings where she aims.** All eight headings were drawn, diagonals
 *    included, so a diagonal press cuts diagonally instead of rounding to the
 *    nearest of four.
 *  * **Ngự Kiếm Hành is a mode, not a move**, exactly as Cân Đẩu Vân is: press
 *    to step onto the blade, press again to step off. What is different is that
 *    she has no sprint, so speed in the air is flat rather than geared.
 */

/** Feet-level collision box, so she overlaps props above the waist. */
const BODY_WIDTH = 22;
const BODY_HEIGHT = 14;

/**
 * The flight, and why the numbers are what they are.
 *
 * `FLY_LIFT` is a *drawing* offset. Her position, depth and collision box stay
 * on the tile she is over; only the picture rises, and the gap that opens
 * between her and her shadow is what reads as height. The two ramps are how
 * long the picture takes to get up and back, and the lift eases between them on
 * its own — which is why taking off, landing, being hit out of it and dying in
 * the air need no special case each. They only change what the lift heads
 * towards.
 *
 * Lower and slower than the cloud: she rides a sword a few feet up, where he
 * sits on a cloud. `FLY_SPEED` is flat because her sheet draws one speed —
 * there are no gear rows to switch between.
 */
const FLY_LIFT = 34;
const FLY_RISE_MS = 140;
const FLY_FALL_MS = 120;
const FLY_SPEED = 1.7;

/*
 * Where each technique is resolved *from* — the reach itself lives in
 * WorldScene, measured off the art. The cut and the lance leave the blade a
 * step ahead of her; the two ultimates break around her, so they resolve on her
 * own feet and a forward offset would only drag the centre off the picture.
 */
const CUT_REACH = 46;
const LANCE_REACH = 40;
const RAIN_REACH = 0;
const BLOOD_REACH = 0;

const INPUT_BUFFER_FROM = 0.45;

/** Shortest gap between two stagger animations — see {@link Wukong}. */
const FLINCH_GAP = 900;

/**
 * Her basic cut, as one step.
 *
 * The numbers are read off the impact frame the same way the staff chain's
 * were: her arc runs from about 30px behind her out to 150 in front, so the
 * hit is a near-circle centred just ahead of her boots rather than a disc
 * flung out to the tip. It has to open behind her or a mob standing in melee
 * would be inside the swing and outside the hit.
 */
export const THANH_VAN_KIEM_PHAP: readonly ComboStep[] = [
  { damageMultiplier: 1.3, frost: 0, reach: 46, radius: 92, knockback: 10 },
];

export const KIEM_TIEN_PROFILE = {
  id: 'kiemtien',
  name: 'Kiếm Tiên',
  sect: 'Thanh Vân Kiếm Các',
  skills: KIEM_TIEN_SKILLS.map((s) => s.name),
  comboSteps: THANH_VAN_KIEM_PHAP.length,
} as const;

type PendingImpact =
  | { kind: 'combo'; payload: ComboPayload; frame: number }
  | { kind: 'skill'; payload: SkillPayload; slot: number; frame: number };

export class KiemTien extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  readonly combo: ComboChain;

  private currentState: CharacterState = 'idle';
  private facing: Direction = 'down';
  private aim: Vector2Like = { ...DIRECTION_VECTORS.down };
  private playedKey = '';
  /** Frame name the body offset was last computed for. */
  private syncedFrame = '';
  /** Whether she is on the blade. Toggled by the Ngự Kiếm Hành button. */
  private flying = false;
  /** The mark she leaves on the floor — what attaches her to the ground. */
  private readonly shadow = new GroundShadow(this.scene, { lift: FLY_LIFT });
  /** How far off the ground she is *drawn*. See FLY_LIFT. */
  private flyLift = 0;
  private castHoldUntil = 0;
  private bufferedAttack = false;
  private pending: PendingImpact | null = null;
  private nextFlinchAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, stats?: Partial<CharacterStats>) {
    super(scene, x, y, KIEMTIEN_TEXTURE, 'idle_down_0');

    this.stats = { ...DEFAULT_KIEM_TIEN_STATS, ...stats };
    this.combat = new CombatSystem(this.stats, KIEM_TIEN_SKILLS);
    this.combo = new ComboChain(THANH_VAN_KIEM_PHAP, COMBO_WINDOW);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    createKiemTienAnimations(scene);

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

  /**
   * `dash` is deliberately absent: riding the blade is a way of moving, not an
   * action that has to finish. She steers, turns and lands exactly as she does
   * on foot.
   */
  get isBusy(): boolean {
    return (
      this.currentState === 'attack' ||
      this.currentState === 'skill' ||
      this.currentState === 'dead'
    );
  }

  /**
   * Never. Height is the reward for flying, not immunity — a flight you can
   * hold indefinitely and steer out of cannot also turn hits off.
   */
  get isInvulnerable(): boolean {
    return false;
  }

  /** How far off the ground she is drawn. The scene sorts her over scenery by it. */
  get airHeight(): number {
    return this.flyLift;
  }

  tick(time: number, delta: number): void {
    if (this.combat.update(time, delta)) emitStats(this.stats);
    if (this.combo.update(time)) this.emitComboState();

    this.flyLiftTowards(delta);
    this.syncShadow();

    if (this.currentState === 'skill' && time >= this.castHoldUntil && !this.anims.isPlaying) {
      this.playState('idle', this.idleClip(), true);
    }

    // Frame sizes differ between clips, so the feet-relative body offset only
    // holds until the displayed frame changes.
    if (this.frame.name !== this.syncedFrame) {
      this.syncedFrame = this.frame.name;
      this.syncBody();
    }
    this.applyFlyLift();
  }

  move(direction: Vector2Like): void {
    if (this.isBusy) {
      if (this.currentState !== 'dash') this.setVelocity(0, 0);
      return;
    }

    const length = Math.hypot(direction.x, direction.y);
    if (length === 0) {
      this.setVelocity(0, 0);
      // A stagger is allowed to finish while she stands there, but never to
      // hold her: pressing a direction falls through to the walk below.
      if (this.currentState === 'hurt' && this.anims.isPlaying) return;
      // Hovering is the same art as travelling — the blade is already moving
      // under her — but it still has to follow the facing.
      if (this.flying) this.playState('dash', KiemTienClip.fly(this.facing));
      else this.playState('idle', this.idleClip());
      return;
    }

    this.facing = directionFromVector(direction, this.facing);
    this.aim = aimFromVector(direction, this.aim);

    if (this.flying) {
      const speed = this.stats.speed * FLY_SPEED;
      this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
      this.playState('dash', KiemTienClip.fly(this.facing));
      return;
    }

    const speed = this.stats.speed;
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.playState('walk', KiemTienClip.move(this.facing));
  }

  attack(steer?: Vector2Like): boolean {
    if (this.isDead) return false;

    if (this.currentState === 'attack') {
      if (this.anims.getProgress() >= INPUT_BUFFER_FROM) this.bufferedAttack = true;
      return this.bufferedAttack;
    }
    if (this.isBusy) return false;

    this.turn(steer);
    const now = this.scene.time.now;
    // The aim, not just the facing: all eight headings are drawn, so a diagonal
    // press cuts diagonally rather than playing the nearest of four.
    const clip = KiemTienClip.attack(this.facing, this.aim);
    const hit = this.combo.press(now, () => refDuration(clip));

    this.setVelocity(0, 0);
    this.playState('attack', clip, true);

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
        ...this.hitOrigin(hit.step.reach),
      },
    };
    this.emitComboState();
    return true;
  }

  /*
   * Each cast takes the heading held at the moment of the press. The controller
   * checks actions before movement so a press wins its frame, which means
   * `move` has not run yet and the facing on the sprite is one frame stale —
   * turning to face something and striking is one motion for the player, so it
   * has to be one here.
   */
  castCut(steer?: Vector2Like): boolean {
    return this.cast(KiemTienSlot.Cut, KiemTienClip.skill1, CUT_REACH, steer);
  }

  castLance(steer?: Vector2Like): boolean {
    return this.cast(KiemTienSlot.Lance, KiemTienClip.skill2, LANCE_REACH, steer);
  }

  castRain(steer?: Vector2Like): boolean {
    return this.cast(KiemTienSlot.Rain, KiemTienClip.skill3, RAIN_REACH, steer);
  }

  castBlood(steer?: Vector2Like): boolean {
    return this.cast(KiemTienSlot.Blood, KiemTienClip.skill4, BLOOD_REACH, steer);
  }

  /**
   * Ngự Kiếm Hành: step onto the blade, or step off it.
   *
   * A switch rather than a dash. Taking off costs its spirit once and nothing
   * after, so the only limit on staying up is how often she wants to pay to get
   * back on. Landing is always allowed and always free; there is no state a
   * player can be stranded in.
   *
   * The state key stays `dash`, which is what the rest of the codebase, the
   * network and the other kits call this slot.
   */
  dash(steer?: Vector2Like): boolean {
    if (this.isDead) return false;
    if (this.flying) {
      this.land();
      return true;
    }
    if (this.isBusy) return false;

    const slot = KiemTienSlot.Ride;
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

    this.flying = true;
    this.setVelocity(0, 0);
    this.playState('dash', KiemTienClip.fly(this.facing), true);

    const payload: DashPayload = {
      direction: this.facing,
      aim: this.aimVector,
      x: this.x,
      y: this.y,
      distance: 0,
      duration: FLY_RISE_MS,
    };
    GameBus.emit(GameEvent.Dash, payload);
    return true;
  }

  /** Off the blade. The lift runs itself down from here. */
  private land(): void {
    this.flying = false;
    this.setVelocity(0, 0);
    this.playState('idle', this.idleClip(), true);
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

    this.setTintFill(0xbfe4ff);
    this.scene.time.delayedCall(70, () => {
      // `scene` is what Phaser nulls on destroy, and the timer outlives the
      // sprite. Cleared even when the hit was lethal, so the death plays in her
      // own colours.
      if (this.scene) this.clearTint();
    });

    // A swing or a cast is left to finish: an action the player committed to is
    // exactly what must not be snatched away. Nor while she is on the blade —
    // the flinch is a grounded animation and would drop her out of the sky on
    // every scratch.
    const now = this.scene.time.now;
    if (this.isBusy || this.flying || now < this.nextFlinchAt) return;
    this.nextFlinchAt = now + FLINCH_GAP;

    this.combo.reset();
    this.emitComboState();
    this.playState('hurt', KiemTienClip.hurt(), true);
  }

  die(): void {
    if (this.isDead) return;
    this.stats.hp = 0;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setVelocity(0, 0);
    this.playState('dead', KiemTienClip.death(), true);
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

  private rejectSkill(slot: number): void {
    const skill = this.combat.skillAt(slot);
    GameBus.emit(GameEvent.SkillRejected, {
      name: skill.name,
      slot,
      reason: this.combat.hasSpiritFor(skill) ? 'cooldown' : 'spirit',
    });
  }

  private idleClip(): ClipRef {
    return KiemTienClip.idle(this.facing);
  }

  /** Where a hit lands: `reach` px ahead of her boots, on the ground plane. */
  private hitOrigin(reach: number): Vector2Like {
    return { x: this.x + this.aim.x * reach, y: this.y + this.aim.y * reach };
  }

  /**
   * Eases the drawn height towards wherever the flight flag says it belongs.
   *
   * Nothing else has to know about landing. Being hit, dying, swinging or
   * pressing the button again all just clear `flying`, and she settles out of
   * the air over FLY_FALL_MS while whatever caused it plays.
   */
  private flyLiftTowards(delta: number): void {
    const target = this.flying ? FLY_LIFT : 0;
    if (this.flyLift === target) return;
    const step = (FLY_LIFT * delta) / (target > this.flyLift ? FLY_RISE_MS : FLY_FALL_MS);
    this.flyLift =
      target > this.flyLift
        ? Math.min(target, this.flyLift + step)
        : Math.max(target, this.flyLift - step);
  }

  private syncShadow(): void {
    if (this.isDead) {
      this.shadow.hide();
      return;
    }
    this.shadow.sync(this.x, this.y, this.flyLift);
  }

  /** Takes the shadow with her, since it is a scene object rather than a child. */
  destroy(fromScene?: boolean): void {
    this.shadow.destroy();
    super.destroy(fromScene);
  }

  /**
   * Draws her `flyLift` px higher without moving her.
   *
   * The lift goes into the *origin*, not into `y`: `y` is the tile she is over,
   * and moving it would take her shadow, her depth and her collision box into
   * the air with her. Every frame carries its own baked pivot which Phaser
   * re-applies as the animation runs, so the offset goes back on top of that
   * pivot each tick rather than being set once.
   */
  private applyFlyLift(): void {
    const custom = this.frame.customPivot;
    const baseX = custom ? this.frame.pivotX : 0.5;
    const baseY = custom ? this.frame.pivotY : 0.5;
    // Against the drawn size, not the texture size: moving the origin by `d`
    // shifts the picture `d * height * scaleY` on screen, so the offset that
    // buys `flyLift` world pixels depends on the scale in force — which is
    // never 1 here, because the art is baked large (KIEMTIEN_ART_SCALE).
    const lift = baseY + this.flyLift / (this.height * this.scaleY);
    if (this.originX === baseX && this.originY === lift && this.flyLift === 0) return;
    this.setOrigin(baseX, lift);
    // unconditional, even when the origin did not move: `syncBody` may have run
    // since, off an un-lifted origin, and left the box in the air
    this.syncBody();
  }

  /**
   * Puts the collision box under her boots for the frame on display.
   *
   * Arcade places a body at `x + scale * (offset - displayOrigin)`, and the
   * displayed origin comes from the frame's baked pivot. Cancelling the origin
   * lands the box at (x - w/2, y - h) whatever size the frame is. Dividing the
   * source box by the scale Arcade is about to multiply it by leaves the same
   * BODY_WIDTH x BODY_HEIGHT standing on the ground rather than a box grown to
   * match art that is baked 1.6x.
   */
  private syncBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    body.setSize(BODY_WIDTH / sx, BODY_HEIGHT / sy, false);
    body.setOffset(this.displayOriginX - BODY_WIDTH / 2 / sx, this.displayOriginY - BODY_HEIGHT / sy);
    // Arcade only notices a scale change on its next step. Deliberately NOT
    // `updateFromGameObject`, which also rewrites the body position from the
    // sprite's and throws away the frame of movement — see the note on
    // Wukong.syncBody, where doing that pinned him to the spot at full speed.
    body.updateBounds();
  }

  private playState(next: CharacterState, clip: ClipRef, force = false): void {
    if (this.currentState !== next) {
      this.currentState = next;
      const payload: StatePayload = { state: next, facing: this.facing };
      GameBus.emit(GameEvent.StateChanged, payload);
    }

    // Anything that is not the flight takes her off the blade: swinging,
    // casting, being staggered, dying. The lift is not zeroed here — it eases
    // down over FLY_FALL_MS while that action plays, so she settles rather than
    // being snapped to the floor.
    if (next !== 'dash') this.flying = false;

    this.setFlipX(clip.flip);
    // The art is baked 1.6x the world; nothing here is blown up per technique
    // the way Tôn Ngộ Không's is, because her skill sheets already draw the
    // effect at the size it should read.
    this.setScale(1 / KIEMTIEN_ART_SCALE);
    if (force || this.playedKey !== clip.key) {
      this.playedKey = clip.key;
      if (force && next !== 'attack' && next !== 'skill') this.pending = null;
      this.play(clip.key, !force);
      // play() applies the first frame, so the body can be placed right away
      this.syncedFrame = this.frame.name;
      this.syncBody();
      this.applyFlyLift();
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
    // a new frame means a new baked pivot; put the lift back on top of it here
    this.applyFlyLift();

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
