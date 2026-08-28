import Phaser from 'phaser';
import { Boss1, BOSS1_ACTIONS } from '../entities/Boss1';
import type { BossStrike } from '../entities/Boss1';
import { EnemyAI } from '../systems/EnemyAI';
import type { AiProfile } from '../systems/EnemyAI';
import { BossEffects } from '../systems/BossEffects';
import { distanceToSegment } from '../systems/Damageable';
import type { Damageable, HitInfo } from '../systems/Damageable';
import { GameBus, GameEvent } from '../events';
import type { AttackPayload, ComboPayload, DashPayload, SkillPayload } from '../events';
import { WorldTexture } from './BootScene';
import { LIN_YUAN_TEXTURE, QI_SLASH_FRAME } from '../animations/linYuanAnimations';
import { NhuYenEffects } from '../systems/NhuYenEffects';
import { FrostMark } from '../systems/FrostMark';
import { BANG_PHACH_TRAM, BANG_TINH_TRAN } from '../systems/CombatSystem';
import { PLAYER_FACTORIES } from '../entities/playerHandle';
import type { PlayerHandle, PlayerId } from '../entities/playerHandle';
import { DIRECTION_VECTORS } from '../types';
import type { Direction, Vector2Like } from '../types';

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1800;

/**
 * Combat ranges, all measured on the ground plane against a target's collision
 * footprint — see `NhuYen.hitOrigin` for why nothing here uses chest height.
 */
const HIT_RADIUS = 46;
const QI_SLASH_RADIUS = 54;

/**
 * Băng Tinh Trận — an *array* of pillars, not one nova.
 *
 * The centre pillar rises on Như Yên herself, which is what the sheet draws.
 * Around it a ring of smaller pillars breaks the ground outward, staggered so
 * the formation reads as spreading rather than appearing all at once.
 *
 * Damage does NOT follow the pillars one by one. It is a single disc that grows
 * with them, from the centre pillar's ice out to the far edge of the ring, so
 * everything inside the formation, in the gaps between its pillars, and in the
 * fringe around it takes the hit. Per-pillar circles left real holes: past the
 * ring the pillars separate, and a target 250px out sitting between two of them
 * took nothing at all while the ice erupted on both sides of it.
 */
const ICE_ARRAY_CENTRE_RADIUS = 120;
/** Visual half-width of a ring pillar, at its 0.78 scale. */
const ICE_ARRAY_PILLAR_RADIUS = 104;
const ICE_ARRAY_SPREAD = 190;
const ICE_ARRAY_POINTS = 8;
const ICE_ARRAY_STAGGER = 45;
/** Outer edge of the drawn ice, and so of the damage. */
const ICE_ARRAY_REACH = ICE_ARRAY_SPREAD + ICE_ARRAY_PILLAR_RADIUS;

/** How far above the ground plane a mid-air effect is drawn. */
const FX_LIFT = 34;

const STONE_HP = 160;

/** Order the switch key cycles through. */
const ROSTER: readonly PlayerId[] = ['nhuyen', 'lamuyen'];

/** How far above the ground plane the boss's thrown bolt is drawn. */
const BOLT_LIFT = 52;

interface TrainingStone {
  sprite: Phaser.Physics.Arcade.Sprite;
  hp: number;
  /** Frost / Frozen state applied by Như Yên's kit. */
  frost: FrostMark;
}

/** Where the boss waits, and how far it may roam from there. */
const BOSS_POST = { x: WORLD_WIDTH / 2 + 520, y: WORLD_HEIGHT / 2 - 120 };

/**
 * How Boss 1 fights. Ranges are read off its own kit (`BOSS1_ACTIONS`) plus the
 * player's reach, so the bands stay true if the kit is retuned:
 *
 *  * `melee` is preferred whenever it is in range — priority 3.
 *  * `bolt` covers the gap it cannot swing into, but not point blank, or it
 *    would fire into a player already inside its sword arc.
 *  * `nova` is the panic button: rarely up, and only worth it up close.
 *
 * `keepDistance` sits just inside the swing so it closes to sword range and no
 * further, and `recover` holds it still for the tail of each action so the
 * fight reads as committed swings rather than a stream of them.
 */
const BOSS_AI: AiProfile = {
  aggroRadius: 460,
  leashRadius: 760,
  keepDistance: BOSS1_ACTIONS.melee.reach + 18,
  patrolRadius: 190,
  patrolPause: [900, 2200],
  patrolSpeed: 0.45,
  actionGap: 620,
  strafe: 0.35,
  homeRadius: 620,
  actions: [
    {
      id: 'nova',
      maxRange: BOSS1_ACTIONS.nova.radius * 0.8,
      priority: 4,
      recover: 520,
    },
    {
      id: 'melee',
      maxRange: BOSS1_ACTIONS.melee.reach + BOSS1_ACTIONS.melee.radius * 0.7,
      priority: 3,
      recover: 260,
    },
    {
      id: 'bolt',
      minRange: 150,
      maxRange: BOSS1_ACTIONS.bolt.reach,
      priority: 2,
      recover: 340,
    },
  ],
};

export class TestScene extends Phaser.Scene {
  private player!: PlayerHandle;
  private playerIndex = 0;
  private fx!: NhuYenEffects;
  private bossFx!: BossEffects;
  private props!: Phaser.Physics.Arcade.StaticGroup;
  private stones: TrainingStone[] = [];
  private boss?: Boss1;
  private bossAi?: EnemyAI;
  /**
   * Everything a player hit can land on. Stones join as adapters, the boss
   * implements `Damageable` itself — so one range check serves both, and adding
   * a second enemy is one push.
   */
  private targets: Damageable[] = [];
  /** Kept so a character swap can drop it before the old sprite is destroyed. */
  private playerCollider?: Phaser.Physics.Arcade.Collider;
  /** Same, for the player-versus-boss collision. */
  private bossPlayerCollider?: Phaser.Physics.Arcade.Collider;
  private debugKeys!: {
    hurt: Phaser.Input.Keyboard.Key;
    respawn: Phaser.Input.Keyboard.Key;
    swap: Phaser.Input.Keyboard.Key;
    boss: Phaser.Input.Keyboard.Key;
  };
  private spawn = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

  constructor() {
    super('TestScene');
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, WorldTexture.Grass)
      .setOrigin(0, 0)
      .setDepth(-1000);

    this.buildScenery();

    this.fx = new NhuYenEffects(this);
    this.bossFx = new BossEffects(this);
    this.spawnPlayer(ROSTER[this.playerIndex]);
    this.spawnBoss();

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setRoundPixels(true);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('TestScene requires a keyboard plugin');
    this.debugKeys = {
      hurt: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H, false),
      respawn: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R, false),
      // Q rather than Tab: these keys are added without capture, so Tab would
      // still move the browser's focus out of the canvas.
      swap: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false),
      boss: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B, false),
    };

    GameBus.on(GameEvent.Attack, this.onAttack, this);
    GameBus.on(GameEvent.Skill, this.onSkill, this);
    GameBus.on(GameEvent.Dash, this.onDash, this);
    // Both events matter: SHUTDOWN on a scene stop, DESTROY when the whole
    // game is torn down (a React remount). Missing DESTROY leaves this scene
    // subscribed to the module-level GameBus and it explodes on the next event.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);
  }

  update(time: number, delta: number): void {
    this.player.update(time, delta);

    // Y-sorting so the character walks behind and in front of props.
    this.player.sprite.setDepth(this.player.footY());

    // The boss drives its own body; the AI only decides what it should want.
    if (this.boss) {
      this.boss.tick(time, delta);
      const spot = this.player.hitPoint();
      this.bossAi?.update(time, delta, {
        position: spot,
        alive: this.player.alive,
      });
    }

    for (const stone of this.stones) {
      if (stone.frost.update(time)) this.paintFrost(stone, time);
    }

    if (Phaser.Input.Keyboard.JustDown(this.debugKeys.hurt)) this.player.hurt(25);
    if (Phaser.Input.Keyboard.JustDown(this.debugKeys.respawn))
      this.player.respawn(this.spawn.x, this.spawn.y);
    if (Phaser.Input.Keyboard.JustDown(this.debugKeys.swap)) this.swapCharacter();
    if (Phaser.Input.Keyboard.JustDown(this.debugKeys.boss)) this.respawnBoss();
  }

  /* ------------------------------------------------------------ characters */

  /**
   * Swaps in a character at the current position. Both entities are rebuilt
   * from scratch rather than pooled — this is a demo scene, and a fresh entity
   * means no stale cooldowns or half-finished combos carried across.
   */
  private swapCharacter(): void {
    this.playerIndex = (this.playerIndex + 1) % ROSTER.length;
    const at = { x: this.player.sprite.x, y: this.player.footY() };
    // drop the colliders first: they hold references to the sprite going away
    this.playerCollider?.destroy();
    this.playerCollider = undefined;
    this.bossPlayerCollider?.destroy();
    this.bossPlayerCollider = undefined;
    this.player.destroy();
    this.spawnPlayer(ROSTER[this.playerIndex], at);
  }

  private spawnPlayer(id: PlayerId, at = this.spawn): void {
    // `at` is a standing point. Như Yên's sprite is pivoted there already, Lâm
    // Uyên's is centred on her frame, so the drift is corrected from each
    // handle's own footY instead of hard-coding either one's offset here.
    this.player = PLAYER_FACTORIES[id](this, at.x, at.y);
    this.player.sprite.y -= this.player.footY() - at.y;

    this.playerCollider = this.physics.add.collider(this.player.sprite, this.props);
    // a swap rebuilds the sprite, so the boss collision has to be re-made too
    if (this.boss) {
      this.bossPlayerCollider = this.physics.add.collider(this.player.sprite, this.boss);
    }
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    GameBus.emit(GameEvent.CharacterChanged, this.player.profile);
  }

  /* ----------------------------------------------------------------- boss */

  /**
   * Puts Boss 1 on the map with its own brain. Nothing about the boss is wired
   * to the player: the AI is handed a target every frame, and the boss's hits
   * come back as `BossStrike` for this scene to resolve — the same shape of
   * split the player entities use.
   */
  private spawnBoss(): void {
    const boss = new Boss1(this, BOSS_POST.x, BOSS_POST.y, {
      onStrike: (strike) => this.onBossStrike(strike),
      onDeath: () => {
        this.floatingNumber(BOSS_POST.x, BOSS_POST.y - 120, 0, 0xffd070, true, 'HẠ GỤC');
      },
    });
    this.physics.add.collider(boss, this.props);
    this.boss = boss;
    this.bossAi = new EnemyAI(boss, BOSS_AI);
    this.targets.push(boss);
    // both bodies are dynamic, so the two of them push each other around
    this.bossPlayerCollider = this.physics.add.collider(this.player.sprite, boss);
  }

  /** Rebuilds the boss at its post — the `B` key, for testing the fight again. */
  private respawnBoss(): void {
    // drop the collider first: it holds a reference to the sprite going away
    this.bossPlayerCollider?.destroy();
    this.bossPlayerCollider = undefined;
    if (this.boss) {
      this.targets = this.targets.filter((t) => t !== this.boss);
      this.boss.destroy();
    }
    this.boss = undefined;
    this.bossAi = undefined;
    this.spawnBoss();
  }

  /**
   * Resolves one of the boss's strikes against the player.
   *
   * Melee lands in an arc ahead of it, the nova is a disc centred on it, and the
   * bolt is a live projectile that damages the first thing it passes over — so
   * stepping out of the way actually works, rather than the hit being decided
   * the instant it was thrown.
   */
  private onBossStrike(strike: BossStrike): void {
    if (strike.kind === 'bolt') {
      let spent = false;
      let previous = { x: strike.x, y: strike.y };
      this.bossFx.bolt({
        x: strike.x,
        y: strike.y - BOLT_LIFT,
        aim: strike.aim,
        range: strike.reach,
        duration: 620,
        lift: BOLT_LIFT,
        onStep: (x, y) => {
          if (spent) return;
          const spot = this.player.hitPoint();
          if (distanceToSegment(spot, previous, { x, y }) > strike.radius) {
            previous = { x, y };
            return;
          }
          spent = true;
          this.hitPlayer(strike);
          this.bossFx.burst(x, y, 0.7);
        },
        onLand: (x, y) => {
          if (!spent) this.bossFx.burst(x, y, 0.85);
        },
      });
      return;
    }

    if (strike.kind === 'nova') {
      this.bossFx.novaRing(strike.x, strike.y, strike.radius);
      const spot = this.player.hitPoint();
      if (Phaser.Math.Distance.Between(strike.x, strike.y, spot.x, spot.y) <= strike.radius) {
        this.hitPlayer(strike);
      }
      return;
    }

    // melee: an arc centred `reach` ahead of the boss
    const centre = {
      x: strike.x + strike.aim.x * strike.reach,
      y: strike.y + strike.aim.y * strike.reach,
    };
    this.bossFx.crescent(centre.x, centre.y, strike.aim, 46);
    const spot = this.player.hitPoint();
    if (Phaser.Math.Distance.Between(centre.x, centre.y, spot.x, spot.y) <= strike.radius) {
      this.hitPlayer(strike);
    }
  }

  /**
   * The one place the boss can hurt the player, so the dash's invulnerability
   * and the damage numbers cannot be forgotten by one of the three strikes.
   */
  private hitPlayer(strike: BossStrike): void {
    if (!this.player.alive) return;
    if (this.player.invulnerable) {
      const spot = this.player.hitPoint();
      this.floatingNumber(spot.x, spot.y - 120, 0, 0x9fe8ff, false, 'HƯ ẢNH');
      return;
    }
    this.player.hurt(strike.damage);
    const spot = this.player.hitPoint();
    this.floatingNumber(spot.x, spot.y - 120, strike.damage, 0xff8b96, false);
    this.cameras.main.shake(120, 0.004);
  }

  /* -------------------------------------------------------------- scenery */

  private buildScenery(): void {
    this.props = this.physics.add.staticGroup();

    const trees: Array<[number, number]> = [
      [630, 540], [780, 450], [960, 630], [1350, 480], [1620, 600],
      [570, 1050], [840, 1290], [1140, 1410], [1530, 1230], [1830, 990],
      [450, 720], [1980, 720], [1050, 360], [1470, 1530],
    ];
    for (const [x, y] of trees) this.addProp(WorldTexture.Tree, x, y, 30, 20, 38);

    const rocks: Array<[number, number]> = [
      [720, 840], [1290, 960], [1710, 840], [990, 1050], [1500, 690], [780, 1500],
    ];
    for (const [x, y] of rocks) this.addProp(WorldTexture.Rock, x, y, 40, 20, 0);

    // Three training stones: something to actually hit, and enough of them to
    // watch a Frost stack lapse on one while another is still frozen.
    for (const [x, y] of [
      [WORLD_WIDTH / 2 + 190, WORLD_HEIGHT / 2],
      [WORLD_WIDTH / 2 - 210, WORLD_HEIGHT / 2 + 90],
      [WORLD_WIDTH / 2 + 60, WORLD_HEIGHT / 2 - 220],
    ] as Array<[number, number]>) {
      const sprite = this.addProp(WorldTexture.TrainingStone, x, y, 40, 24, 16);
      const stone: TrainingStone = { sprite, hp: STONE_HP, frost: new FrostMark() };
      this.stones.push(stone);
      this.targets.push(this.stoneTarget(stone));
    }
  }

  /**
   * Lets a training stone take a hit through the same interface as the boss.
   *
   * `hitRadius` is 0 on purpose: every range in Như Yên's kit was measured
   * against a stone's centre, so giving stones a radius now would silently
   * widen all of it. The boss carries a real radius because its body is far
   * too wide to be fairly hit at its centre only.
   */
  private stoneTarget(stone: TrainingStone): Damageable {
    return {
      get alive() {
        return stone.hp > 0;
      },
      hitPoint: () => this.stoneCentre(stone),
      hitRadius: () => 0,
      applyHit: (hit: HitInfo) =>
        this.damageStone(
          stone,
          hit.damage,
          hit.tint ?? 0xffffff,
          hit.frost ?? 0,
          hit.knockback ?? 0,
          hit.aim,
        ),
    };
  }

  /**
   * Static prop with a foot-level collision box, so the player can walk over
   * the upper part of the sprite while still bumping into its base.
   */
  private addProp(
    texture: string,
    x: number,
    y: number,
    boxWidth: number,
    boxHeight: number,
    boxOffsetY: number,
  ): Phaser.Physics.Arcade.Sprite {
    const sprite = this.props.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(y);
    const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(boxWidth, boxHeight);
    body.position.set(x - boxWidth / 2, y + boxOffsetY);
    body.updateCenter();
    return sprite;
  }

  /* ---------------------------------------------------------------- combat */

  private onAttack(payload: AttackPayload): void {
    // Như Yên's combo steps carry Frost and knockback of their own; Lâm Uyên's
    // swing is a plain point hit with neither.
    const combo = 'step' in payload ? (payload as ComboPayload) : null;
    this.resolveHit(payload, {
      damage: payload.damage,
      tint: combo?.final ? 0x9fe8ff : 0xffffff,
      sweep: 0,
      // each of Như Yên's forms sweeps wider than the last; Lâm Uyên has one arc
      radius: combo?.radius ?? HIT_RADIUS,
      frost: combo?.frost ?? 0,
      knockback: combo?.knockback ?? 0,
    });
  }

  private onSkill(payload: SkillPayload): void {
    switch (payload.name) {
      case BANG_PHACH_TRAM.name:
        this.castQiSlash(payload);
        return;
      case BANG_TINH_TRAN.name:
        this.castIceArray(payload);
        return;
      default:
        // Lâm Uyên's Hư Vô Kiếm Khí: a crescent sweeping 150px forward
        this.spawnQiBurst(payload);
        this.resolveHit(payload, {
          damage: payload.damage,
          tint: 0x6fd8ff,
          sweep: 150,
          radius: HIT_RADIUS,
          frost: 0,
          knockback: 0,
        });
    }
  }

  /**
   * Băng Phách Trảm. The crescent is a live projectile: it damages each stone
   * the first time it passes over one, so it pierces a line of them instead of
   * resolving the whole path the instant it is cast.
   */
  private castQiSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    // Each step is tested against the segment swept since the last one, not
    // against the current point. On a frame hitch the crescent can advance
    // further than its own hit radius, and a point test would let it pass
    // straight through a target without touching it.
    let previous = { x: payload.x, y: payload.y };
    this.fx.qiCrescent({
      x: payload.x,
      y: payload.y,
      aim: payload.aim,
      range: 300,
      duration: 380,
      lift: FX_LIFT,
      onStep: (x, y) => {
        const now = { x, y };
        for (const target of this.targets) {
          if (!target.alive || hitAlready.has(target)) continue;
          const spot = target.hitPoint();
          if (distanceToSegment(spot, previous, now) > QI_SLASH_RADIUS + target.hitRadius())
            continue;
          hitAlready.add(target);
          target.applyHit({
            damage: payload.damage,
            aim: payload.aim,
            frost: payload.frost ?? 0,
            knockback: 6,
            tint: 0x8fd4ff,
            side: 'player',
          });
        }
        previous = now;
      },
    });
  }

  /**
   * Băng Tinh Trận. The centre pillar rises on Như Yên herself — the sheet's
   * last two frames show it bursting up around her — then a ring of pillars
   * breaks the ground outward from her, one after another.
   *
   * Each pillar resolves its own damage when it lands, and a target is only
   * caught once, by whichever pillar reaches it first. So the formation sweeps
   * outward: nearby targets freeze immediately, distant ones a few frames later
   * as the ring arrives.
   */
  private castIceArray(payload: SkillPayload): void {
    // --- the pillars: what the player sees ------------------------------
    // only the centre one shakes the camera; eight more would be a mess
    this.fx.iceEruption(payload.x, payload.y, 1, 0.006);
    // the ring is turned so one pillar always lands straight along her aim, and
    // lands in aim order so the formation sweeps round rather than popping in
    const base = Math.atan2(payload.aim.y, payload.aim.x);
    for (let i = 0; i < ICE_ARRAY_POINTS; i++) {
      const angle = base + (i / ICE_ARRAY_POINTS) * Math.PI * 2;
      const x = payload.x + Math.cos(angle) * ICE_ARRAY_SPREAD;
      const y = payload.y + Math.sin(angle) * ICE_ARRAY_SPREAD;
      this.time.delayedCall(ICE_ARRAY_STAGGER * (i + 1), () =>
        this.fx.iceEruption(x, y, 0.78, 0),
      );
    }

    // --- the damage: one disc growing with them -------------------------
    // Each wave lands with a pillar and covers everything out to its radius, so
    // the formation still sweeps outward — near targets freeze first — but no
    // ring of ground is ever skipped. A target is only caught once, by the first
    // wave that reaches it.
    const caught = new Set<Damageable>();
    const waves = ICE_ARRAY_POINTS + 1;
    for (let wave = 0; wave < waves; wave++) {
      const radius =
        ICE_ARRAY_CENTRE_RADIUS +
        ((ICE_ARRAY_REACH - ICE_ARRAY_CENTRE_RADIUS) * wave) / (waves - 1);
      const sweep = () => {
        for (const target of this.targets) {
          if (!target.alive || caught.has(target)) continue;
          const spot = target.hitPoint();
          const distance = Phaser.Math.Distance.Between(payload.x, payload.y, spot.x, spot.y);
          if (distance > radius + target.hitRadius()) continue;
          caught.add(target);
          target.applyHit({
            damage: payload.damage,
            aim: payload.aim,
            frost: payload.frost ?? 0,
            knockback: 0,
            tint: 0x8fd4ff,
            side: 'player',
          });
        }
      };
      if (wave === 0) sweep();
      else this.time.delayedCall(ICE_ARRAY_STAGGER * wave, sweep);
    }
  }

  /** Spaces the afterimages across the lunge so the trail spans its length. */
  private onDash(payload: DashPayload): void {
    const ghosts = 4;
    this.fx.shadowTrail(this.player.sprite, ghosts, payload.duration / ghosts);
  }

  /**
   * A stone's position for range checks: the centre of its collision footprint,
   * i.e. where it actually stands on the ground rather than where the middle of
   * its art happens to be.
   */
  private stoneCentre(stone: TrainingStone): { x: number; y: number } {
    const body = stone.sprite.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return { x: stone.sprite.x, y: stone.sprite.y };
    return { x: body.center.x, y: body.center.y };
  }

  /**
   * Damages everything within `radius` of the hit — training stones and the
   * boss alike, because both are `Damageable`. A point test for a sword swing,
   * a forward segment of `sweep` px for a sweeping qi blade.
   *
   * The target's own `hitRadius` is added to the range, so a body the size of
   * the boss is hit when the blade reaches its edge rather than its centre.
   */
  private resolveHit(
    origin: AttackPayload,
    options: {
      damage: number;
      tint: number;
      sweep: number;
      radius: number;
      frost: number;
      knockback: number;
    },
  ): void {
    const end = {
      x: origin.x + origin.aim.x * options.sweep,
      y: origin.y + origin.aim.y * options.sweep,
    };

    for (const target of this.targets) {
      if (!target.alive) continue;
      const spot = target.hitPoint();
      const distance = options.sweep
        ? distanceToSegment(spot, origin, end)
        : Phaser.Math.Distance.Between(origin.x, origin.y, spot.x, spot.y);
      if (distance > options.radius + target.hitRadius()) continue;

      target.applyHit({
        damage: options.damage,
        aim: origin.aim,
        frost: options.frost,
        knockback: options.knockback,
        tint: options.tint,
        side: 'player',
      });
    }
  }

  /**
   * Single place damage is applied, so Frozen's damage bonus and the Frost
   * stacking cannot be forgotten by one of the four things that deal damage.
   */
  private damageStone(
    stone: TrainingStone,
    rawDamage: number,
    tint: number,
    frost: number,
    knockback: number,
    aim: Vector2Like,
  ): void {
    const now = this.time.now;
    const wasFrozen = stone.frost.frozen(now);
    const damage = stone.frost.amplify(rawDamage, now);

    stone.hp -= damage;
    this.floatingNumber(
      stone.sprite.x,
      stone.sprite.y - 12,
      damage,
      wasFrozen ? 0x9fe8ff : tint,
      wasFrozen,
    );

    if (frost > 0) {
      const result = stone.frost.add(frost, now);
      const centre = this.stoneCentre(stone);
      if (result.froze) this.fx.freezeBurst(centre.x, centre.y);
      else this.fx.frostBurst(centre.x, centre.y);
      this.paintFrost(stone, now);
    }

    const vector = aim;
    const shove = knockback || 2;
    this.tweens.add({
      targets: stone.sprite,
      x: stone.sprite.x + vector.x * shove + (knockback ? 0 : Phaser.Math.Between(-2, 2)),
      y: stone.sprite.y + vector.y * shove * 0.4,
      duration: 70,
      yoyo: true,
    });

    if (stone.hp <= 0) {
      this.tweens.add({
        targets: stone.sprite,
        alpha: 0,
        duration: 260,
        onComplete: () => stone.sprite.destroy(),
      });
    }
  }

  /** Tints a stone by how much Frost it holds; solid blue once Frozen. */
  private paintFrost(stone: TrainingStone, now: number): void {
    if (stone.hp <= 0) return;
    if (stone.frost.frozen(now)) {
      stone.sprite.setTint(0x6fc8ff);
      return;
    }
    const stacks = stone.frost.stacks(now);
    if (stacks === 0) {
      stone.sprite.clearTint();
      return;
    }
    stone.sprite.setTint(stacks === 1 ? 0xbcd8ec : 0x93c4e8);
  }

  private floatingNumber(
    x: number,
    y: number,
    damage: number,
    tint: number,
    critical: boolean,
    /** Word to show instead of a number — a dodge, a kill. */
    label?: string,
  ): void {
    const text = this.add
      .text(x, y, label ?? (critical ? `-${damage}!` : `-${damage}`), {
        fontFamily: 'monospace',
        fontSize: critical ? '18px' : '14px',
        color: `#${tint.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(0.5)
      .setDepth(10000)
      .setResolution(1);
    this.tweens.add({
      targets: text,
      y: y - 22,
      alpha: 0,
      duration: 600,
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Hư Vô Kiếm Khí projectile, drawn with the qi art cut from Lâm Uyên's sheet.
   * It flies forward and fades out.
   */
  private spawnQiBurst(payload: SkillPayload): void {
    const vector = DIRECTION_VECTORS[payload.direction];
    const blade = this.add
      .sprite(payload.x, payload.y, LIN_YUAN_TEXTURE, QI_SLASH_FRAME)
      .setDepth(payload.y + 200)
      .setScale(0.8, 1.1);

    // the crescent is drawn pointing right, so rotate it into the facing
    const angles: Record<Direction, number> = { right: 0, left: 180, up: -90, down: 90 };
    blade.setAngle(angles[payload.direction]);

    this.tweens.add({
      targets: blade,
      x: payload.x + vector.x * 150,
      y: payload.y + vector.y * 150,
      scaleX: 1.5,
      scaleY: 1.6,
      alpha: 0,
      duration: 420,
      onComplete: () => blade.destroy(),
    });
  }

  private teardown(): void {
    GameBus.off(GameEvent.Attack, this.onAttack, this);
    GameBus.off(GameEvent.Skill, this.onSkill, this);
    GameBus.off(GameEvent.Dash, this.onDash, this);
    this.player?.destroy();
    this.boss?.destroy();
    this.boss = undefined;
    this.bossAi = undefined;
    this.stones = [];
    this.targets = [];
  }
}
