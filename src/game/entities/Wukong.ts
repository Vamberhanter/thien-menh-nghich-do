import Phaser from 'phaser';
import {
  WUKONG_TEXTURE,
  WukongClip,
  createWukongAnimations,
  castScaleOf,
  impactFrameOf,
  refDuration,
  WUKONG_ART_SCALE,
} from '../animations/wukongAnimations';
import type { ClipRef } from '../animations/wukongAnimations';
import { CombatSystem, WUKONG_SKILLS, WukongSlot } from '../systems/CombatSystem';
import { GroundShadow } from '../systems/GroundShadow';
import { COMBO_WINDOW, ComboChain, CUU_CHUYEN_CON_PHAP } from '../systems/ComboChain';
import {
  DEFAULT_WUKONG_STATS,
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
 * Tôn Ngộ Không of Hoa Quả Sơn — staff, cloak and three drawn techniques.
 *
 * Geometry and combat follow {@link NhuYen} and {@link HuyetLang}: the sprite's
 * (x, y) is the point he stands on, because every atlas frame carries a pivot
 * there, and each action fires its damage on an animation frame rather than on
 * a timer.
 *
 * Two things are his own:
 *
 *  * He carries **five** skill slots — four techniques and the cloud dash —
 *    where the other two carry three. Nothing in CombatSystem cared about the
 *    count; what it changes is the HUD, which reads the slot list off the
 *    profile, and the controller, which has two more keys to bind.
 *  * He sprints. Như Yên is the only other character whose sheet has the stride
 *    art for it, so `move` takes a `running` flag the way hers does. His frames
 *    vary in size (296x136 for a swing against 214x130 for a breath), so the
 *    feet-relative body offset only holds until the displayed frame changes;
 *    `syncBody` re-places it and `tick` notices.
 */

/** Feet-level collision box, so he overlaps props above the waist. */
const BODY_WIDTH = 24;
const BODY_HEIGHT = 14;

/**
 * Cân Đẩu Vân is a mode, not a move: press once to get on the cloud, press
 * again to get off. No cooldown and no duration — he stays up until he comes
 * down.
 *
 * `FLY_LIFT` is a *drawing* offset, not a move. His position, his depth and his
 * collision box stay on the tile he is over; only the picture rises. The two
 * ramps are how long that picture takes to reach the cloud and to come back,
 * and the lift eases between them on its own — which is why taking off,
 * landing, being knocked out of it and swinging on the way down need no
 * special case each. They only change what the lift is heading towards.
 */
const FLY_LIFT = 44;
const FLY_RISE_MS = 120;
const FLY_FALL_MS = 110;
/**
 * The cloud builds up speed rather than having one.
 *
 * Three side clips were drawn at rising speed — the trail lengthens each row —
 * so the flight has three gears to match, and holding a direction is what
 * changes gear. Let go, or stop, and it drops back to a cruise. No new key: the
 * art already says what the mechanic is.
 */
const FLY_GEAR_SPEED = [1.5, 1.9, 2.4];
const FLY_GEAR_AFTER_MS = [0, 420, 1050];

/*
 * Where each technique is *resolved from*, not how far it reaches — the reach
 * itself lives in WorldScene, measured off the art. The two that leave the
 * staff start a little ahead of his boots; the two that come up through the
 * ground he is standing on start under him.
 */
const DRAGON_REACH = 52;
/*
 * Zero, unlike the dragon, and the reason is the bolt.
 *
 * `reach` shifts the whole hit — origin and effect both — a step along the aim,
 * and that step is not foreshortened. Aimed sideways nobody notices; aimed up
 * it lifted the beam a further 40px, which together with the staff-tip offset
 * left it starting a clear gap above his head. So the lance resolves from his
 * boots and the staff tip is the only offset, which WukongEffects applies with
 * the ground-plane foreshortening this view needs. It also lines the lane up
 * with the art: the impact star is drawn 491px out, the lane runs 500.
 */
const LANCE_REACH = 0;
const NOVA_REACH = 0;
const WRATH_REACH = 0;

/** Sprint multiplier on the base stride, matching Như Yên's. */
const RUN_MULTIPLIER = 1.42;

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

export const WUKONG_PROFILE = {
  id: 'wukong',
  name: 'Tôn Ngộ Không',
  sect: 'Hoa Quả Sơn',
  skills: WUKONG_SKILLS.map((s) => s.name),
  comboSteps: CUU_CHUYEN_CON_PHAP.length,
} as const;

type PendingImpact =
  | { kind: 'combo'; payload: ComboPayload; frame: number }
  | { kind: 'skill'; payload: SkillPayload; slot: number; frame: number };

export class Wukong extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  readonly combo: ComboChain;

  private currentState: CharacterState = 'idle';
  private facing: Direction = 'down';
  private aim: Vector2Like = { ...DIRECTION_VECTORS.down };
  private playedKey = '';
  /** Frame name the body offset was last computed for. */
  private syncedFrame = '';
  /** Whether he is on the cloud. Toggled by the Cân Đẩu Vân button. */
  private flying = false;
  /** When the current unbroken run of held flight began; 0 when standing. */
  private flySince = 0;
  /**
   * The mark he leaves on the floor. Always on now, not only in flight: it is
   * what attaches him to the ground he is standing on, and the gap it opens up
   * when he takes off is what reads as height.
   */
  private readonly shadow = new GroundShadow(this.scene, { lift: FLY_LIFT });
  /** How far off the ground he is *drawn*. See FLY_LIFT. */
  private flyLift = 0;
  private castHoldUntil = 0;
  private bufferedAttack = false;
  private pending: PendingImpact | null = null;
  /** Earliest time another hit may play the stagger — see `FLINCH_GAP`. */
  private nextFlinchAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, stats?: Partial<CharacterStats>) {
    super(scene, x, y, WUKONG_TEXTURE, 'idle_down_0');

    this.stats = { ...DEFAULT_WUKONG_STATS, ...stats };
    this.combat = new CombatSystem(this.stats, WUKONG_SKILLS);
    this.combo = new ComboChain(CUU_CHUYEN_CON_PHAP, COMBO_WINDOW);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    createWukongAnimations(scene);

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
   * `dash` is deliberately absent: Cân Đẩu Vân is a way of moving now, not an
   * action that has to finish. He steers, turns and lands on the cloud exactly
   * as he does on foot.
   */
  get isBusy(): boolean {
    return (
      this.currentState === 'attack' ||
      this.currentState === 'skill' ||
      this.currentState === 'dead'
    );
  }

  /**
   * Never. The old dash bought a fifth of a second of it as the price of being
   * committed to a fixed lunge; a flight you can hold indefinitely and steer
   * out of cannot buy the same thing without being immunity with extra steps.
   * Height is the reward here, not invulnerability.
   */
  /**
   * How far off the ground he is *drawn*, in pixels. Zero on the ground.
   *
   * The scene reads this rather than the flight flag, because what matters to
   * it is the picture: he is over the scenery from the moment he starts to
   * climb, and back among it only once he has actually settled.
   */
  get airHeight(): number {
    return this.flyLift;
  }

  get isInvulnerable(): boolean {
    return false;
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
    // Every frame re-applies its own baked pivot, so a lift has to be put back
    // on top of it each time — including the frame the flight ends on, which is
    // how the lift gets cleared.
    this.applyFlyLift();
  }

  move(direction: Vector2Like, running = false): void {
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
      // Hovering is the same art as travelling — the cloud is already moving
      // under him — but it still has to follow the facing, so he shows his back
      // when he is pointed away from the camera. Stopping also drops the gear:
      // speed is something he builds, not something he keeps.
      if (this.flying) {
        this.flySince = 0;
        this.playState('dash', WukongClip.fly(this.facing));
      }
      else this.playState('idle', this.idleClip());
      return;
    }

    if (this.flying) {
      const now = this.scene.time.now;
      if (this.flySince === 0) this.flySince = now;
      const gear = this.flyGear(now);
      const speed = this.stats.speed * FLY_GEAR_SPEED[gear];
      this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
      this.facing = directionFromVector(direction, this.facing);
      this.aim = aimFromVector(direction, this.aim);
      // the sprint key does nothing up here — time in the air is the throttle
      this.playState('dash', WukongClip.fly(this.facing, gear));
      return;
    }

    const speed = this.stats.speed * (running ? RUN_MULTIPLIER : 1);
    this.setVelocity((direction.x / length) * speed, (direction.y / length) * speed);
    this.facing = directionFromVector(direction, this.facing);
    this.aim = aimFromVector(direction, this.aim);
    this.playState(running ? 'run' : 'walk', WukongClip.move(this.facing, running));
  }

  attack(steer?: Vector2Like): boolean {
    if (this.isDead) return false;

    if (this.currentState === 'attack') {
      if (this.anims.getProgress() >= INPUT_BUFFER_FROM) this.bufferedAttack = true;
      return this.bufferedAttack;
    }
    if (this.isBusy) return false;

    // same one-frame staleness as the casts — see castNova
    this.turn(steer);
    const now = this.scene.time.now;
    // The aim, not just the facing: he has drawn art for all eight headings, so
    // a diagonal press swings diagonally instead of playing the nearest of four.
    const clip = WukongClip.attack(this.facing, this.combo.pending, this.aim);
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
   * Each cast takes the heading held at the moment of the press, the way the
   * dash always has. Without it a technique fired in the same frame as the
   * direction key went out along the *previous* facing: the controller checks
   * actions before movement so a press wins its frame, which means `move` has
   * not run yet and the facing is one frame stale. Turning to face an enemy
   * and striking is a single motion for the player, so it has to be one here.
   */
  castNova(steer?: Vector2Like): boolean {
    return this.cast(WukongSlot.Nova, WukongClip.nova, NOVA_REACH, steer);
  }

  castLance(steer?: Vector2Like): boolean {
    return this.cast(WukongSlot.Lance, WukongClip.lance, LANCE_REACH, steer);
  }

  castWrath(steer?: Vector2Like): boolean {
    return this.cast(WukongSlot.Wrath, WukongClip.wrath, WRATH_REACH, steer);
  }

  castDragon(steer?: Vector2Like): boolean {
    return this.cast(WukongSlot.Dragon, WukongClip.dragon, DRAGON_REACH, steer);
  }

  /**
   * Cân Đẩu Vân: get on the cloud, or get off it.
   *
   * Not a dash and not timed — the button is a switch. Taking off costs its
   * spirit once and nothing after that, so the only limit on how long he stays
   * up is how often he wants to pay to get back on. Landing is always allowed
   * and always free; there is no state a player can be stranded in.
   *
   * The state key stays `dash`, which is what the rest of the codebase, the
   * network and the other two kits call this slot.
   */
  dash(steer?: Vector2Like): boolean {
    if (this.isDead) return false;
    if (this.flying) {
      this.land();
      return true;
    }
    if (this.isBusy) return false;

    const slot = WukongSlot.CloudStep;
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
    this.flySince = 0;
    this.setVelocity(0, 0);
    this.playState('dash', WukongClip.dash(this.facing), true);

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

  /** How long he has held a heading, as one of the three drawn speeds. */
  private flyGear(now: number): number {
    const held = now - this.flySince;
    let gear = 0;
    for (let i = FLY_GEAR_AFTER_MS.length - 1; i > 0; i--) {
      if (held >= FLY_GEAR_AFTER_MS[i]) { gear = i; break; }
    }
    return gear;
  }

  /** Off the cloud. The lift runs itself down from here. */
  private land(): void {
    this.flying = false;
    this.flySince = 0;
    this.setVelocity(0, 0);
    this.playState('idle', this.idleClip(), true);
  }

  /**
   * Eases the drawn height towards wherever the flight flag says it belongs.
   *
   * Nothing else has to know about landing. Being hit, dying, swinging the
   * staff or pressing the button again all just clear `flying`, and he settles
   * out of the sky over FLY_FALL_MS while whatever caused it plays.
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
  /**
   * Draws him `flyLift` px higher without moving him.
   *
   * The lift goes into the *origin*, not into `y`: `y` is the tile he is over,
   * and moving it would move his shadow, his depth and his collision box into
   * the air with him. Every frame carries its own baked pivot which Phaser
   * re-applies as the animation runs, so the offset is put back on top of that
   * pivot each tick rather than set once.
   *
   * `syncBody` afterwards is not optional: it reads the displayed origin back
   * to place the box, so a changed origin with a stale offset would leave the
   * box floating.
   */
  private syncShadow(): void {
    if (this.isDead) {
      this.shadow.hide();
      return;
    }
    this.shadow.sync(this.x, this.y, this.flyLift);
  }

  /** Takes the shadow with him, since it is a scene object rather than a child. */
  destroy(fromScene?: boolean): void {
    this.shadow.destroy();
    super.destroy(fromScene);
  }

  private applyFlyLift(): void {
    const custom = this.frame.customPivot;
    const baseX = custom ? this.frame.pivotX : 0.5;
    const baseY = custom ? this.frame.pivotY : 0.5;
    // Against the drawn size, not the texture size. Moving the origin by `d`
    // shifts the picture `d * height * scaleY` on screen, so the offset that
    // buys `flyLift` world pixels depends on the scale in force — which is now
    // never 1, and differs again mid-technique.
    const lift = baseY + this.flyLift / (this.height * this.scaleY);
    if (this.originX === baseX && this.originY === lift && this.flyLift === 0) return;
    this.setOrigin(baseX, lift);
    // unconditional, even when the origin did not move: `syncBody` may have run
    // since, off an un-lifted origin, and left the box 44px in the air
    this.syncBody();
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
    // Nor while he is on the cloud: the flinch is a grounded animation, and
    // playing it would drop him out of the sky on every scratch.
    const now = this.scene.time.now;
    if (this.isBusy || this.flying || now < this.nextFlinchAt) return;
    this.nextFlinchAt = now + FLINCH_GAP;

    // Reaching here means the character was idle or walking, so there is no
    // pending hit to drop — but the chain window may still be open, and a hit
    // closes it.
    this.combo.reset();
    this.emitComboState();
    this.playState('hurt', WukongClip.hurt(), true);
  }

  die(): void {
    if (this.isDead) return;
    this.stats.hp = 0;
    this.pending = null;
    this.bufferedAttack = false;
    this.combo.reset();
    this.setVelocity(0, 0);
    this.playState('dead', WukongClip.death(), true);
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
    // The aim as well as the facing: three of the four techniques are drawn from
    // several angles and pick between them off the vector. Only the wrath, which
    // breaks in a circle around him, ignores it.
    clipFor: (direction: Direction, aim: Vector2Like) => ClipRef,
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
    const clip = clipFor(this.facing, this.aim);
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
    return WukongClip.idle(this.facing);
  }

  /**
   * Where a hit lands: `reach` px ahead of his boots, on the ground plane — the
   * same convention as the other two, and for the same reason (screen Y encodes
   * distance in this view, so ranges have to be resolved flat).
   */
  private hitOrigin(reach: number): Vector2Like {
    return { x: this.x + this.aim.x * reach, y: this.y + this.aim.y * reach };
  }

  /**
   * Puts the collision box under his boots for the frame on display.
   *
   * Arcade places a body at `x + scale * (offset - displayOrigin)`, and the
   * displayed origin comes from the frame's baked pivot. Cancelling the origin
   * lands the box at (x - w/2, y - h) whatever size the frame is.
   *
   * The scale divisions are the second half of it. Arcade grows a body with
   * its game object — `sourceWidth * |scaleX|` — so on its own, blowing the
   * art up for a technique (SKILL_SCALE) would blow up what he collides with
   * too: he would snag on scenery and soak hits over half a metre of empty
   * flame. Dividing the source box by the scale it is about to be multiplied
   * by leaves the same BODY_WIDTH x BODY_HEIGHT standing on the ground.
   */
  private syncBody(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    body.setSize(BODY_WIDTH / sx, BODY_HEIGHT / sy, false);
    body.setOffset(this.displayOriginX - BODY_WIDTH / 2 / sx, this.displayOriginY - BODY_HEIGHT / sy);
    // Arcade only notices a scale change on its next step, so the frame a
    // technique starts on would otherwise run with a box two thirds the size.
    // `updateBounds` resizes it now.
    //
    // Deliberately NOT `updateFromGameObject`, which also rewrites the body
    // position from the sprite's. Arcade moves a body by the difference between
    // its position and where that position was at the start of the step, so
    // rewriting it after the step has run zeroes that difference and the frame
    // of movement is thrown away. Called once per frame change that cost a
    // stutter nobody saw; called every tick, as the flight does, it pinned him
    // to the spot with the velocity still reading 1032px/s.
    body.updateBounds();
  }

  private playState(next: CharacterState, clip: ClipRef, force = false): void {
    if (this.currentState !== next) {
      this.currentState = next;
      const payload: StatePayload = { state: next, facing: this.facing };
      GameBus.emit(GameEvent.StateChanged, payload);
    }

    // Anything that is not the flight takes him off the cloud: swinging the
    // staff, casting, being staggered, dying. The lift is not zeroed here — it
    // eases down over FLY_FALL_MS while that action plays, so he settles out of
    // the sky rather than being snapped to the floor.
    if (next !== 'dash') this.flying = false;

    this.setFlipX(clip.flip);
    // Every state change comes through here, so this is the one place the cast
    // blow-up (CAST_SCALE, per technique) is set and cleared. `syncBody` below
    // reads the scale back off the sprite.
    // Divided by the art scale: the atlas is baked larger than the world, so
    // 1 here means "life size", not "one texture pixel per world unit".
    const wanted = next === 'skill' ? castScaleOf(clip) : 1;
    this.setScale(wanted / WUKONG_ART_SCALE);
    if (force || this.playedKey !== clip.key) {
      this.playedKey = clip.key;
      if (force && next !== 'attack' && next !== 'skill') this.pending = null;
      this.play(clip.key, !force);
      // play() applies the first frame, so the body can be placed right away
      this.syncedFrame = this.frame.name;
      this.syncBody();
      // and the new frame arrives with its own pivot, so the lift (or the lack
      // of one, on the frame that ends the flight) goes on now rather than a
      // tick later with a stale box
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
    // a new frame means a new baked pivot; put the flight lift back on top of
    // it here, where it happens, rather than a tick later
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
