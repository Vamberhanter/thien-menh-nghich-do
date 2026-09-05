import Phaser from 'phaser';
import { Boss1, BOSS1_ACTIONS } from '../entities/Boss1';
import type { BossStrike } from '../entities/Boss1';
import { EnemyAI } from '../systems/EnemyAI';
import type { AiProfile } from '../systems/EnemyAI';
import { BossEffects } from '../systems/BossEffects';
import { distanceToSegment } from '../systems/Damageable';
import type { Damageable, HitInfo } from '../systems/Damageable';
import { GameBus, GameEvent, emitStats } from '../events';
import type {
  AttackPayload,
  AvatarChosenPayload,
  ComboPayload,
  DashPayload,
  SkillPayload,
  WarpCommandPayload,
} from '../events';
import { WorldTexture } from './BootScene';
import { LIN_YUAN_TEXTURE, QI_SLASH_FRAME } from '../animations/linYuanAnimations';
import { NhuYenEffects } from '../systems/NhuYenEffects';
import { HuyetLangEffects } from '../systems/HuyetLangEffects';
import { MikuEffects } from '../systems/MikuEffects';
import { FrostMark } from '../systems/FrostMark';
import {
  BANG_PHACH_TRAM,
  BANG_TINH_TRAN,
  HUYET_DIEM_TRAM,
  TAM_THU_HONG,
  TINH_MANG_TRAM,
  TINH_KHONG_TRAN,
} from '../systems/CombatSystem';
import { PLAYER_FACTORIES } from '../entities/playerHandle';
import type { PlayerHandle, PlayerId } from '../entities/playerHandle';
import { DIRECTION_VECTORS } from '../types';
import type { Direction, Vector2Like } from '../types';
import { Multiplayer } from '../systems/Multiplayer';
import { isInputGated, loadSavedJoin, peekSession } from '../../net/bind';
import { newPlayerId } from '../../net/supabase';
import type { WorldSession } from '../../net/WorldSession';
import type { WorldNetEvent, WorldSnap } from '../../net/types';
import { WORLD_SNAP_MS } from '../../net/types';
import { defaultAvatar, loadAvatar, saveAvatar } from '../../net/avatarStore';
import { loadZoneSnap, saveZoneSnap } from '../../net/zoneStore';
import { Progression, writeDerived } from '../systems/Progression';
import { Inventory, itemOf, rollDrops } from '../systems/Inventory';
import type { EquipSlot } from '../systems/Inventory';
import { Mob, MOB_AI } from '../entities/Mob';
import type { MobStrike } from '../entities/Mob';
import {
  BOSS_DROPS,
  BOSS_XP,
  DEFAULT_ZONE,
  MOB_DROPS,
  MOB_XP,
  STONE_XP,
  ZONE_ORDER,
  warpStand,
  zoneOf,
} from '../zones';
import type { PortalDef, ZoneDef, ZoneId } from '../zones';
import { setCurrentZone } from '../worldState';
import { consumePad } from '../touchPad';

const HIT_RADIUS = 64;
const QI_SLASH_RADIUS = 72;
const ICE_ARRAY_CENTRE_RADIUS = 150;
const ICE_ARRAY_PILLAR_RADIUS = 130;
const ICE_ARRAY_SPREAD = 230;
const ICE_ARRAY_POINTS = 8;
const ICE_ARRAY_STAGGER = 45;
const ICE_ARRAY_REACH = ICE_ARRAY_SPREAD + ICE_ARRAY_PILLAR_RADIUS;
const MAGMA_SLASH_RADIUS = QI_SLASH_RADIUS;
const MAGMA_ARRAY_CENTRE_RADIUS = ICE_ARRAY_CENTRE_RADIUS;
const MAGMA_ARRAY_SPREAD = ICE_ARRAY_SPREAD;
const MAGMA_ARRAY_POINTS = ICE_ARRAY_POINTS;
const MAGMA_ARRAY_STAGGER = ICE_ARRAY_STAGGER;
const MAGMA_ARRAY_REACH = ICE_ARRAY_REACH;
const FX_LIFT = 34;
const STONE_HP = 160;
const BOLT_LIFT = 52;
const RESPAWN_MS = 5000;
const SHRINE_RADIUS = 80;
const PORTAL_RADIUS = 48;
const LOOT_RADIUS = 42;
const MOB_RESPAWN_MS = 12000;
const ROSTER: readonly PlayerId[] = ['nhuyen', 'lamuyen', 'huyetlang', 'miku'];

interface TrainingStone {
  sprite: Phaser.Physics.Arcade.Sprite;
  hp: number;
  frost: FrostMark;
}

interface LootPile {
  id: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  items: string[];
}

interface MobPack {
  index: number;
  mob: Mob;
  ai: EnemyAI;
  respawnAt: number | null;
}

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
    { id: 'nova', maxRange: BOSS1_ACTIONS.nova.radius * 0.8, priority: 4, recover: 520 },
    { id: 'melee', maxRange: BOSS1_ACTIONS.melee.reach + BOSS1_ACTIONS.melee.radius * 0.7, priority: 3, recover: 260 },
    { id: 'bolt', minRange: 150, maxRange: BOSS1_ACTIONS.bolt.reach, priority: 2, recover: 340 },
  ],
};

/**
 * The living world: zones, mobs, cultivation, bag, death. Combat resolution
 * is the same path TestScene used — this scene just owns more of the loop.
 */
export class WorldScene extends Phaser.Scene {
  private player!: PlayerHandle;
  private playerIndex = 0;
  private fx!: NhuYenEffects;
  private magmaFx!: HuyetLangEffects;
  private starFx!: MikuEffects;
  private bossFx!: BossEffects;
  private props!: Phaser.Physics.Arcade.StaticGroup;
  private stones: TrainingStone[] = [];
  private targets: Damageable[] = [];
  private packs: MobPack[] = [];
  private loot: LootPile[] = [];
  private portals: Array<{
    def: PortalDef;
    sprite: Phaser.GameObjects.Sprite;
    label: Phaser.GameObjects.Text;
  }> = [];
  private shrineSprite?: Phaser.GameObjects.Sprite;
  private shrineLabel?: Phaser.GameObjects.Text;
  private shrineRing?: Phaser.GameObjects.Graphics;
  private arenaRing?: Phaser.GameObjects.Graphics;
  private arenaLabel?: Phaser.GameObjects.Text;
  private spawn: { zone: ZoneId; x: number; y: number } | null = null;
  private ground?: Phaser.GameObjects.TileSprite;
  private boss?: Boss1;
  private bossAi?: EnemyAI;
  private playerCollider?: Phaser.Physics.Arcade.Collider;
  private enemyColliders: Phaser.Physics.Arcade.Collider[] = [];
  private keys!: {
    swap: Phaser.Input.Keyboard.Key;
    bag: Phaser.Input.Keyboard.Key;
    pick: Phaser.Input.Keyboard.Key;
    warp: Phaser.Input.Keyboard.Key;
    hurt?: Phaser.Input.Keyboard.Key;
    respawn?: Phaser.Input.Keyboard.Key;
    boss?: Phaser.Input.Keyboard.Key;
  };
  private zone: ZoneDef = zoneOf(DEFAULT_ZONE);
  private progress = new Progression();
  private bag = new Inventory();
  private net!: Multiplayer;
  private deathAt: number | null = null;
  private lastDeathSecond: number | null = null;
  private crossing = false;
  private lobbyApplied = false;
  private saveTimer = 0;
  private avatarId = '';
  private flushProgress?: () => void;
  private hosting = true;
  private lootSeq = 0;
  private worldTimer = 0;
  private zoneSaveTimer = 0;
  private readonly lastHit = new WeakMap<object, string>();
  private warps = new Set<ZoneId>([DEFAULT_ZONE]);
  private warpOpen = false;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    this.fx = new NhuYenEffects(this);
    this.magmaFx = new HuyetLangEffects(this);
    this.starFx = new MikuEffects(this);
    this.bossFx = new BossEffects(this);
    this.avatarId = peekSession()?.profile.id ?? newPlayerId();

    const joined = peekSession()?.profile.character ?? loadSavedJoin().character;
    if (joined) {
      const index = ROSTER.indexOf(joined);
      if (index >= 0) this.playerIndex = index;
    }

    this.loadZone(DEFAULT_ZONE, undefined, true);
    void this.restoreAvatar();

    this.net = new Multiplayer(this, {
      onRemoteAttack: (payload) => this.onAttack(payload),
      onRemoteSkill: (payload) => this.onSkill(payload),
      onRemoteDash: (payload, sprite) => this.onDash(payload, sprite),
    });

    this.bindInput();
    GameBus.on(GameEvent.Attack, this.onAttack, this);
    GameBus.on(GameEvent.Skill, this.onSkill, this);
    GameBus.on(GameEvent.Dash, this.onDash, this);
    GameBus.on(GameEvent.Death, this.onDeath, this);
    GameBus.on(GameEvent.NetSession, this.onNetSession, this);
    GameBus.on(GameEvent.AvatarChosen, this.onAvatarChosen, this);
    GameBus.on(GameEvent.InventoryCommand, this.onHudInventory, this);
    GameBus.on(GameEvent.WarpCommand, this.onWarpCommand, this);
    GameBus.on(GameEvent.NetWorld, this.onWorldEvent, this);
    GameBus.on(GameEvent.NetHost, this.onHostChanged, this);
    peekSession()?.followZone(DEFAULT_ZONE);
    this.hosting = this.net.hosting;
    this.flushProgress = () => {
      void this.persist(true);
    };
    window.addEventListener('pagehide', this.flushProgress);
    window.addEventListener('visibilitychange', this.onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);
  }

  update(time: number, delta: number): void {
    this.player.update(time, delta);
    this.net.tick(time, delta, this.player);
    this.player.sprite.setDepth(this.player.footY());
    this.emitCooldowns();
    if (!this.player.alive && this.deathAt === null) this.beginRespawn();
    this.tickDeath(time);
    if (!isInputGated()) {
      this.applyLobbyPick();
      this.tickMobs(time, delta);
      this.tickBoss(time, delta);
      this.tickPortals();
    }
    this.tickLootPrompt();
    this.tickFrost(time);
    this.tickKeys();
    this.tickWorld(delta);
    this.saveTimer += delta;
    if (this.saveTimer > 5000) {
      this.saveTimer = 0;
      void this.persist();
    }
  }

  /* --------------------------------------------------------------- zone */

  private loadZone(id: ZoneId, at?: Vector2Like, first = false): void {
    this.clearZone();
    this.zone = zoneOf(id);
    setCurrentZone(this.zone.id);
    this.physics.world.setBounds(0, 0, this.zone.width, this.zone.height);

    const ground =
      this.zone.ground === 'forest'
        ? WorldTexture.Forest
        : this.zone.ground === 'ash'
          ? WorldTexture.Ash
          : WorldTexture.Grass;
    this.ground = this.add.tileSprite(0, 0, this.zone.width, this.zone.height, ground).setOrigin(0, 0).setDepth(-1000);

    this.props = this.physics.add.staticGroup();
    for (const [x, y] of this.zone.trees) this.addProp(WorldTexture.Tree, x, y, 30, 20, 38);
    for (const [x, y] of this.zone.rocks) this.addProp(WorldTexture.Rock, x, y, 40, 20, 0);

    this.placeShrine();
    this.placeArena();

    for (const [x, y] of this.zone.stones) {
      const sprite = this.addProp(WorldTexture.TrainingStone, x, y, 40, 24, 16);
      const stone: TrainingStone = { sprite, hp: STONE_HP, frost: new FrostMark() };
      this.stones.push(stone);
      this.targets.push(this.stoneTarget(stone));
    }

    this.zone.mobs.forEach((spawn, index) => this.spawnMob(spawn.kind, spawn.x, spawn.y, index));
    if (this.zone.boss) this.spawnBoss(this.zone.boss.x, this.zone.boss.y);

    for (const def of this.zone.portals) {
      const sprite = this.add.sprite(def.x, def.y, WorldTexture.Portal).setDepth(def.y);
      const label = this.add
        .text(def.x, def.y - 36, def.label, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#e8c48a',
          stroke: '#05070d',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(def.y + 2);
      this.portals.push({ def, sprite, label });
    }

    const stand = at ?? {
      x: this.zone.shrine.x + (Math.random() - 0.5) * 80,
      y: this.zone.shrine.y + 50 + (Math.random() - 0.5) * 40,
    };

    if (first) {
      this.spawnPlayer(ROSTER[this.playerIndex], stand);
    } else {
      this.placePlayer(stand.x, stand.y);
      this.hookColliders();
    }

    this.cameras.main.setBounds(0, 0, this.zone.width, this.zone.height);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    GameBus.emit(GameEvent.ZoneChanged, { id: this.zone.id, name: this.zone.name });
    this.discoverWarp(this.zone.id);
    peekSession()?.followZone(this.zone.id);
    this.hosting = this.net ? this.net.hosting : !peekSession() || Boolean(peekSession()?.isHost);
    if (!this.spawn) this.spawn = { zone: this.zone.id, x: this.zone.shrine.x, y: this.zone.shrine.y };
    this.emitProgress();
    void this.hydrateZone();
  }

  private placeShrine(): void {
    const { x, y } = this.zone.shrine;
    this.shrineSprite = this.add.sprite(x, y, WorldTexture.Shrine).setDepth(y).setScale(1.4);
    this.shrineRing = this.add.graphics().setDepth(y - 2);
    this.shrineRing.lineStyle(2, 0x6fd8ff, 0.7);
    this.shrineRing.strokeCircle(x, y + 10, 22);
    this.shrineRing.lineStyle(1, 0x9fe8ff, 0.35);
    this.shrineRing.strokeCircle(x, y + 10, 34);
    this.shrineLabel = this.add
      .text(x, y - 44, 'Huyết mạch', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9fe8ff',
        stroke: '#05070d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 2);
    this.tweens.add({
      targets: [this.shrineRing, this.shrineLabel],
      alpha: { from: 0.45, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });
  }

  private placeArena(): void {
    const arena = this.zone.arena;
    if (!arena) return;
    const { x, y, radius } = arena;
    this.arenaRing = this.add.graphics().setDepth(-900);
    this.arenaRing.fillStyle(0x3a1014, 0.38);
    this.arenaRing.fillCircle(x, y, radius);
    this.arenaRing.lineStyle(10, 0x6a1c22, 0.55);
    this.arenaRing.strokeCircle(x, y, radius);
    this.arenaRing.lineStyle(3, 0xc43a3a, 0.7);
    this.arenaRing.strokeCircle(x, y, radius - 18);
    this.arenaRing.lineStyle(1, 0xe07070, 0.35);
    this.arenaRing.strokeCircle(x, y, radius * 0.42);
    this.arenaLabel = this.add
      .text(x, y - radius - 18, arena.label ?? 'Khu vực boss', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f0b0b0',
        stroke: '#1a0608',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 4);
    this.tweens.add({
      targets: this.arenaLabel,
      alpha: { from: 0.55, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });
  }

  private spawnPoint(): { zone: ZoneId; x: number; y: number } {
    return this.spawn ?? { zone: this.zone.id, x: this.zone.shrine.x, y: this.zone.shrine.y };
  }

  private nearShrine(): boolean {
    const foot = this.player.hitPoint();
    return Phaser.Math.Distance.Between(foot.x, foot.y, this.zone.shrine.x, this.zone.shrine.y) <= SHRINE_RADIUS;
  }

  private isBoundHere(): boolean {
    const point = this.spawn;
    return !!point && point.zone === this.zone.id
      && Math.abs(point.x - this.zone.shrine.x) < 4
      && Math.abs(point.y - this.zone.shrine.y) < 4;
  }

  private bindSpawn(): void {
    if (!this.nearShrine()) return;
    this.spawn = { zone: this.zone.id, x: this.zone.shrine.x, y: this.zone.shrine.y };
    this.discoverWarp(this.zone.id);
    GameBus.emit(GameEvent.Notice, `Đã đặt điểm hồi sinh · ${this.zone.name}`);
    void this.persist();
  }

  private discoverWarp(id: ZoneId): void {
    if (this.warps.has(id)) {
      this.emitWarpState();
      return;
    }
    this.warps.add(id);
    GameBus.emit(GameEvent.Notice, `Đã ghi điểm dịch chuyển · ${zoneOf(id).name}`);
    this.emitWarpState();
    void this.persist();
  }

  private toggleWarp(): void {
    if (!this.player.alive) return;
    if (!this.nearShrine()) {
      GameBus.emit(GameEvent.Notice, 'Đến huyết mạch để dịch chuyển');
      return;
    }
    this.warpOpen = !this.warpOpen;
    this.emitWarpState();
  }

  private closeWarp(): void {
    if (!this.warpOpen) return;
    this.warpOpen = false;
    this.emitWarpState();
  }

  private emitWarpState(): void {
    GameBus.emit(GameEvent.WarpState, {
      open: this.warpOpen,
      current: this.zone.id,
      unlocked: ZONE_ORDER.filter((id) => this.warps.has(id)),
    });
  }

  private onWarpCommand(payload: WarpCommandPayload): void {
    if (payload.action === 'close') {
      this.closeWarp();
      return;
    }
    if (payload.action === 'toggle') {
      this.toggleWarp();
      return;
    }
    if (payload.action === 'travel' && payload.zone) {
      void this.travelWarp(payload.zone);
    }
  }

  private async travelWarp(id: string): Promise<void> {
    if (this.crossing || !this.player.alive) return;
    if (!this.nearShrine()) {
      GameBus.emit(GameEvent.Notice, 'Đến huyết mạch để dịch chuyển');
      return;
    }
    const zone = id as ZoneId;
    if (!this.warps.has(zone)) {
      GameBus.emit(GameEvent.Notice, 'Chưa từng đến nơi này');
      return;
    }
    if (zone === this.zone.id) {
      this.closeWarp();
      return;
    }
    this.closeWarp();
    this.crossing = true;
    this.cameras.main.fadeOut(280, 6, 8, 15);
    await new Promise<void>((resolve) => this.cameras.main.once('camerafadeoutcomplete', () => resolve()));
    this.loadZone(zone, warpStand(zone));
    this.cameras.main.fadeIn(280, 6, 8, 15);
    this.crossing = false;
    GameBus.emit(GameEvent.Notice, `Dịch chuyển · ${this.zone.name}`);
    void this.persist();
  }

  private clearZone(): void {
    for (const pack of this.packs) pack.mob.destroy();
    this.packs = [];
    this.boss?.destroy();
    this.boss = undefined;
    this.bossAi = undefined;
    for (const pile of this.loot) pile.sprite.destroy();
    this.loot = [];
    for (const portal of this.portals) {
      portal.sprite.destroy();
      portal.label.destroy();
    }
    this.portals = [];
    this.stones = [];
    this.targets = [];
    this.shrineSprite?.destroy();
    this.shrineSprite = undefined;
    this.shrineLabel?.destroy();
    this.shrineLabel = undefined;
    this.shrineRing?.destroy();
    this.shrineRing = undefined;
    this.arenaRing?.destroy();
    this.arenaRing = undefined;
    this.arenaLabel?.destroy();
    this.arenaLabel = undefined;
    this.ground?.destroy();
    this.ground = undefined;
    try {
      this.playerCollider?.destroy();
    } catch {
      // physics world already torn down (HMR / scene destroy)
    }
    this.playerCollider = undefined;
    for (const c of this.enemyColliders) {
      try {
        c.destroy();
      } catch {
        // physics world already torn down (HMR / scene destroy)
      }
    }
    this.enemyColliders = [];
    try {
      this.props?.clear(true, true);
    } catch {
      // physics world already torn down
    }
  }

  private async enterPortal(def: PortalDef): Promise<void> {
    if (this.crossing) return;
    this.crossing = true;
    this.cameras.main.fadeOut(280, 6, 8, 15);
    await new Promise<void>((resolve) => this.cameras.main.once('camerafadeoutcomplete', () => resolve()));
    this.loadZone(def.to, def.spawn);
    this.cameras.main.fadeIn(280, 6, 8, 15);
    this.crossing = false;
    if (this.zone.arena) {
      GameBus.emit(GameEvent.Notice, `${this.zone.arena.label ?? 'Khu vực boss'} ở phía đông — Huyết Ma canh giữ`);
    }
    void this.persist();
  }

  /* ------------------------------------------------------------ player */

  private spawnPlayer(id: PlayerId, at: Vector2Like): void {
    const derived = this.progress.derive(id, this.bag.bonuses());
    this.player = PLAYER_FACTORIES[id](this, at.x, at.y, derived);
    this.player.sprite.y -= this.player.footY() - at.y;
    this.hookColliders();
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    GameBus.emit(GameEvent.CharacterChanged, this.player.profile);
    this.emitProgress();
  }

  private replacePlayer(id: PlayerId): void {
    const at = { x: this.player.sprite.x, y: this.player.footY() };
    this.playerCollider?.destroy();
    this.playerCollider = undefined;
    for (const c of this.enemyColliders) c.destroy();
    this.enemyColliders = [];
    this.player.destroy();
    this.spawnPlayer(id, at);
  }

  private placePlayer(x: number, y: number): void {
    const foot = this.player.hitPoint();
    this.player.sprite.x += x - foot.x;
    this.player.sprite.y += y - foot.y;
  }

  private hookColliders(): void {
    this.playerCollider = this.physics.add.collider(this.player.sprite, this.props);
    if (this.boss) {
      this.enemyColliders.push(this.physics.add.collider(this.player.sprite, this.boss));
    }
    for (const pack of this.packs) {
      this.enemyColliders.push(this.physics.add.collider(this.player.sprite, pack.mob));
      this.enemyColliders.push(this.physics.add.collider(pack.mob, this.props));
    }
  }

  private applyGrowth(fill: boolean): void {
    const derived = this.progress.derive(ROSTER[this.playerIndex], this.bag.bonuses());
    writeDerived(this.player.stats, derived, fill);
    emitStats(this.player.stats);
    this.emitProgress();
  }

  private grantXp(amount: number, x: number, y: number, toId?: string): void {
    const who = toId ?? this.net?.actorId() ?? this.selfId();
    if (who !== this.selfId()) {
      peekSession()?.publishWorld({ kind: 'reward', playerId: who, xp: amount, x, y });
      return;
    }
    const gained = this.progress.grant(amount);
    this.floatingNumber(x, y - 40, 0, 0xffe9a8, false, `+${amount} KN`);
    if (gained > 0) {
      this.applyGrowth(true);
      this.floatingNumber(x, y - 64, 0, 0x9fe8ff, true, this.progress.title);
    } else {
      this.emitProgress();
    }
    void this.persist();
  }

  /* --------------------------------------------------------------- mobs */

  private spawnMob(kind: Mob['kind'], x: number, y: number, index: number): void {
    const mob = new Mob(this, { x, y }, kind, {
      onStrike: (_mob, strike) => this.onMobStrike(strike),
      onDeath: (dead) => this.onMobDeath(dead),
      onFrost: (target, froze) => {
        const p = target.hitPoint();
        if (froze) this.fx.freezeBurst(p.x, p.y);
        else this.fx.frostBurst(p.x, p.y);
      },
    });
    this.physics.add.collider(mob, this.props);
    if (this.player) {
      this.enemyColliders.push(this.physics.add.collider(this.player.sprite, mob));
    }
    this.packs.push({ index, mob, ai: new EnemyAI(mob, MOB_AI[kind]), respawnAt: null });
    this.targets.push(mob);
  }

  private onMobDeath(mob: Mob): void {
    if (!this.hosting) return;
    const foot = mob.hitPoint();
    this.grantXp(MOB_XP[mob.kind], foot.x, foot.y, this.lastHit.get(mob));
    const drops = rollDrops(MOB_DROPS[mob.kind]);
    if (drops.length) this.dropLoot(foot.x, foot.y, drops);
    const pack = this.packs.find((p) => p.mob === mob);
    if (pack) pack.respawnAt = this.time.now + MOB_RESPAWN_MS;
  }

  private onMobStrike(strike: MobStrike): void {
    if (!this.hosting) return;
    const end = { x: strike.x + strike.aim.x * strike.reach, y: strike.y + strike.aim.y * strike.reach };
    for (const prey of this.preyList()) {
      if (!prey.alive) continue;
      const distance =
        strike.kind === 'bolt'
          ? distanceToSegment(prey.position, { x: strike.x, y: strike.y }, end)
          : Phaser.Math.Distance.Between(end.x, end.y, prey.position.x, prey.position.y);
      if (distance > strike.radius + prey.radius) continue;
      this.inflict(prey, strike.damage, strike.aim);
    }
  }

  private tickMobs(time: number, delta: number): void {
    for (const pack of this.packs) {
      if (this.hosting && pack.respawnAt !== null && time >= pack.respawnAt) {
        pack.mob.respawn();
        pack.ai.anchorHere();
        pack.respawnAt = null;
      }
      pack.mob.tick(time);
      if (!this.hosting || !pack.mob.alive || pack.mob.frozen) continue;
      pack.ai.update(time, delta, this.nearestPrey(pack.mob.hitPoint()));
    }
  }

  /* ---------------------------------------------------------------- boss */

  private bossProfile(): AiProfile {
    const radius = this.zone.arena?.radius ?? BOSS_AI.homeRadius;
    return {
      ...BOSS_AI,
      aggroRadius: Math.max(BOSS_AI.aggroRadius, Math.round(radius * 0.95)),
      leashRadius: radius + 200,
      patrolRadius: Math.round(radius * 0.32),
      homeRadius: radius,
    };
  }

  private spawnBoss(x: number, y: number): void {
    const boss = new Boss1(this, x, y, {
      onStrike: (strike) => this.onBossStrike(strike),
      onDeath: () => {
        if (!this.hosting) return;
        this.floatingNumber(x, y - 120, 0, 0xffd070, true, 'HẠ GỤC');
        this.grantXp(BOSS_XP, x, y - 40, this.boss ? this.lastHit.get(this.boss) : undefined);
        const drops = rollDrops(BOSS_DROPS);
        if (drops.length) this.dropLoot(x, y, drops);
      },
    });
    this.physics.add.collider(boss, this.props);
    this.boss = boss;
    this.bossAi = new EnemyAI(boss, this.bossProfile());
    this.targets.push(boss);
    if (this.player) {
      this.enemyColliders.push(this.physics.add.collider(this.player.sprite, boss));
    }
  }

  private tickBoss(time: number, delta: number): void {
    if (!this.boss) return;
    this.boss.tick(time, delta);
    if (this.hosting) {
      this.bossAi?.update(time, delta, this.nearestPrey(this.boss.hitPoint()));
    }
  }

  private onBossStrike(strike: BossStrike): void {
    if (strike.kind === 'bolt') {
      const spent = new Set<string>();
      let previous = { x: strike.x, y: strike.y };
      this.bossFx.bolt({
        x: strike.x,
        y: strike.y - BOLT_LIFT,
        aim: strike.aim,
        range: strike.reach,
        duration: 620,
        lift: BOLT_LIFT,
        onStep: (x, y) => {
          if (!this.hosting) {
            previous = { x, y };
            return;
          }
          for (const prey of this.preyList()) {
            if (!prey.alive || spent.has(prey.id)) continue;
            if (distanceToSegment(prey.position, previous, { x, y }) > strike.radius + prey.radius) continue;
            spent.add(prey.id);
            this.inflict(prey, strike.damage, strike.aim);
            this.bossFx.burst(x, y, 0.7);
          }
          previous = { x, y };
        },
        onLand: (x, y) => {
          if (!spent.size) this.bossFx.burst(x, y, 0.85);
        },
      });
      return;
    }
    if (strike.kind === 'nova') {
      this.bossFx.novaRing(strike.x, strike.y, strike.radius);
      if (!this.hosting) return;
      for (const prey of this.preyList()) {
        if (!prey.alive) continue;
        if (Phaser.Math.Distance.Between(strike.x, strike.y, prey.position.x, prey.position.y) > strike.radius + prey.radius) {
          continue;
        }
        this.inflict(prey, strike.damage, strike.aim);
      }
      return;
    }
    const centre = {
      x: strike.x + strike.aim.x * strike.reach,
      y: strike.y + strike.aim.y * strike.reach,
    };
    this.bossFx.crescent(centre.x, centre.y, strike.aim, 46);
    if (!this.hosting) return;
    for (const prey of this.preyList()) {
      if (!prey.alive) continue;
      if (Phaser.Math.Distance.Between(centre.x, centre.y, prey.position.x, prey.position.y) > strike.radius + prey.radius) {
        continue;
      }
      this.inflict(prey, strike.damage, strike.aim);
    }
  }

  private hurtPlayer(damage: number, aim: Vector2Like): void {
    if (!this.player.alive) return;
    if (this.player.invulnerable) {
      const spot = this.player.hitPoint();
      this.floatingNumber(spot.x, spot.y - 120, 0, 0x9fe8ff, false, 'HƯ ẢNH');
      return;
    }
    this.player.applyHit({ damage, aim, side: 'enemy' });
    const spot = this.player.hitPoint();
    this.floatingNumber(spot.x, spot.y - 120, damage, 0xff8b96, false);
    this.cameras.main.shake(120, 0.004);
  }

  /* -------------------------------------------------------- death / loot */

  private onDeath(): void {
    this.beginRespawn();
  }

  private beginRespawn(): void {
    if (this.deathAt !== null) return;
    this.deathAt = this.time.now + RESPAWN_MS;
    this.lastDeathSecond = 5;
    GameBus.emit(GameEvent.DeathCountdown, { seconds: 5 });
  }

  private tickDeath(time: number): void {
    if (this.deathAt === null) return;
    const left = Math.max(0, Math.ceil((this.deathAt - time) / 1000));
    if (left !== this.lastDeathSecond) {
      this.lastDeathSecond = left;
      GameBus.emit(GameEvent.DeathCountdown, { seconds: left });
    }
    if (time < this.deathAt) return;
    this.finishRespawn();
  }

  private finishRespawn(): void {
    this.deathAt = null;
    this.lastDeathSecond = null;
    GameBus.emit(GameEvent.DeathCountdown, { seconds: null });
    const point = this.spawnPoint();
    if (point.zone !== this.zone.id) {
      this.loadZone(point.zone, { x: point.x, y: point.y + 36 });
    }
    this.player.respawn(point.x, point.y + 36);
    this.applyGrowth(true);
  }

  private dropLoot(x: number, y: number, items: string[], id?: string): void {
    const pileId = id ?? `loot-${this.lootSeq++}`;
    if (this.loot.some((p) => p.id === pileId)) return;
    const sprite = this.physics.add.sprite(x, y + 10, WorldTexture.Loot);
    sprite.setDepth(y + 10);
    sprite.setImmovable(true);
    (sprite.body as Phaser.Physics.Arcade.Body | null)?.setSize(16, 12);
    this.loot.push({ id: pileId, sprite, items });
  }

  private tickLootPrompt(): void {
    const near = this.nearestLoot();
    if (near) {
      GameBus.emit(GameEvent.LootPrompt, { label: `F · nhặt (${near.pile.items.length})` });
      return;
    }
    if (this.nearShrine()) {
      GameBus.emit(GameEvent.LootPrompt, {
        label: this.isBoundHere()
          ? 'T / F · dịch chuyển · đã khóa hồi sinh'
          : 'F · đặt hồi sinh · T dịch chuyển',
      });
      if (this.warpOpen) this.emitWarpState();
      return;
    }
    if (this.warpOpen) this.closeWarp();
    GameBus.emit(GameEvent.LootPrompt, { label: null });
  }

  private nearestLoot(): { pile: LootPile; distance: number } | null {
    const foot = this.player.hitPoint();
    let best: { pile: LootPile; distance: number } | null = null;
    for (const pile of this.loot) {
      if (!pile.sprite.active) continue;
      const distance = Phaser.Math.Distance.Between(foot.x, foot.y, pile.sprite.x, pile.sprite.y);
      if (distance > LOOT_RADIUS) continue;
      if (!best || distance < best.distance) best = { pile, distance };
    }
    return best;
  }

  private pickLoot(): void {
    const near = this.nearestLoot();
    if (!near) {
      if (this.nearShrine() && this.isBoundHere()) this.toggleWarp();
      else this.bindSpawn();
      return;
    }
    if (!this.hosting) {
      peekSession()?.publishWorld({
        kind: 'loot-take',
        pileId: near.pile.id,
        playerId: this.selfId(),
      });
      return;
    }
    this.giveLoot(near.pile, this.selfId());
  }

  private giveLoot(pile: LootPile, playerId: string): void {
    if (playerId === this.selfId()) {
      const leftover: string[] = [];
      for (const id of pile.items) {
        if (this.bag.add(id)) {
          const item = itemOf(id);
          GameBus.emit(GameEvent.Notice, `${item?.name ?? id} vào túi`);
        } else leftover.push(id);
      }
      if (leftover.length) {
        GameBus.emit(GameEvent.Notice, 'Túi đã đầy');
        pile.items = leftover;
        return;
      }
      this.emitInventory();
      void this.persist();
    } else {
      peekSession()?.publishWorld({
        kind: 'reward',
        playerId,
        items: pile.items,
        x: pile.sprite.x,
        y: pile.sprite.y,
      });
    }
    pile.sprite.destroy();
    this.loot = this.loot.filter((p) => p !== pile);
  }

  /* ------------------------------------------------------------- input */

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('WorldScene requires a keyboard plugin');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      swap: keyboard.addKey(K.Q, false),
      bag: keyboard.addKey(K.I, false),
      pick: keyboard.addKey(K.F, false),
      warp: keyboard.addKey(K.T, false),
    };
    if (import.meta.env.DEV) {
      this.keys.hurt = keyboard.addKey(K.H, false);
      this.keys.respawn = keyboard.addKey(K.R, false);
      this.keys.boss = keyboard.addKey(K.B, false);
    }
  }

  private tickKeys(): void {
    if (isInputGated()) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.bag) || consumePad('bag')) {
      GameBus.emit(GameEvent.InventoryToggle);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.pick) || consumePad('pick')) this.pickLoot();
    if (Phaser.Input.Keyboard.JustDown(this.keys.warp)) this.toggleWarp();
    if (Phaser.Input.Keyboard.JustDown(this.keys.swap)) this.trySwap();
    if (this.keys.hurt && Phaser.Input.Keyboard.JustDown(this.keys.hurt)) this.player.hurt(25);
    if (this.keys.respawn && Phaser.Input.Keyboard.JustDown(this.keys.respawn)) {
      this.finishRespawn();
    }
    if (this.keys.boss && Phaser.Input.Keyboard.JustDown(this.keys.boss) && this.zone.boss) {
      if (this.boss) {
        this.targets = this.targets.filter((t) => t !== this.boss);
        this.boss.destroy();
      }
      this.boss = undefined;
      this.bossAi = undefined;
      this.spawnBoss(this.zone.boss.x, this.zone.boss.y);
    }
  }

  private applyLobbyPick(): void {
    if (this.lobbyApplied) return;
    this.lobbyApplied = true;
    const wanted = peekSession()?.profile.character ?? loadSavedJoin().character;
    const index = ROSTER.indexOf(wanted);
    if (index >= 0 && ROSTER[this.playerIndex] !== wanted) {
      this.playerIndex = index;
      this.replacePlayer(wanted);
    }
  }

  private trySwap(): void {
    const foot = this.player.hitPoint();
    const d = Phaser.Math.Distance.Between(foot.x, foot.y, this.zone.shrine.x, this.zone.shrine.y);
    if (d > SHRINE_RADIUS) {
      GameBus.emit(GameEvent.Notice, 'Chỉ đổi nhân vật tại huyết mạch');
      return;
    }
    this.playerIndex = (this.playerIndex + 1) % ROSTER.length;
    this.replacePlayer(ROSTER[this.playerIndex]);
    peekSession()?.setCharacter(ROSTER[this.playerIndex]);
    void this.persist();
  }

  private tickPortals(): void {
    if (this.crossing || !this.player.alive) return;
    const foot = this.player.hitPoint();
    for (const { def } of this.portals) {
      if (Phaser.Math.Distance.Between(foot.x, foot.y, def.x, def.y) <= PORTAL_RADIUS) {
        void this.enterPortal(def);
        return;
      }
    }
  }

  /* ------------------------------------------------------------- persist */

  private async restoreAvatar(): Promise<void> {
    const saved = await loadAvatar(this.avatarId);
    if (!saved) {
      this.emitInventory();
      this.emitProgress();
      return;
    }
    this.progress.restore({ level: saved.level, xp: saved.xp });
    this.bag = new Inventory(saved.inventory);
    const wanted = saved.character;
    const index = ROSTER.indexOf(wanted);
    if (!this.lobbyApplied && index >= 0 && ROSTER[this.playerIndex] !== wanted) {
      this.playerIndex = index;
      this.replacePlayer(wanted);
    }
    if (saved.warps?.length) this.warps = new Set(saved.warps);
    if (saved.zone !== this.zone.id) {
      this.loadZone(saved.zone, { x: saved.x, y: saved.y });
    } else {
      this.placePlayer(saved.x, saved.y);
    }
    if (saved.spawn) this.spawn = saved.spawn;
    this.discoverWarp(this.zone.id);
    this.applyGrowth(false);
    if (saved.hp != null && saved.hp > 0) {
      this.player.stats.hp = Math.min(saved.hp, this.player.stats.maxHp);
    } else if (saved.hp != null && saved.hp <= 0) {
      this.finishRespawn();
    }
    if (saved.spiritualPower != null) {
      this.player.stats.spiritualPower = Math.max(
        0,
        Math.min(saved.spiritualPower, this.player.stats.maxSpiritualPower),
      );
    }
    emitStats(this.player.stats);
    this.emitInventory();
    this.emitProgress();
  }

  private onHidden = (): void => {
    if (document.visibilityState === 'hidden') void this.persist(true);
  };

  private persist(keepalive = false): Promise<void> {
    if (!this.player) return Promise.resolve();
    const foot = this.player.hitPoint();
    return saveAvatar(
      defaultAvatar({
        id: this.avatarId,
        name: peekSession()?.profile.name ?? localStorage.getItem('tmnd.name') ?? 'Vô Danh',
        character: ROSTER[this.playerIndex],
        level: this.progress.level,
        xp: this.progress.xp,
        hp: this.player.stats.hp,
        spiritualPower: this.player.stats.spiritualPower,
        inventory: this.bag.snapshot(),
        zone: this.zone.id,
        x: foot.x,
        y: foot.y,
        spawn: this.spawnPoint(),
        warps: [...this.warps],
        roomId: peekSession()?.world,
      }),
      keepalive,
    ).then((result) => {
      GameBus.emit(GameEvent.Persist, result);
    });
  }

  private onHudInventory(payload: { action?: string; index?: number; slot?: EquipSlot }): void {
    if (!payload?.action) return;
    if (payload.action === 'equip' && payload.index !== undefined) this.bag.equip(payload.index);
    if (payload.action === 'unequip' && payload.slot) this.bag.unequip(payload.slot);
    if (payload.action === 'use' && payload.index !== undefined) {
      const used = this.bag.use(payload.index);
      if (used?.restoreSp) {
        this.player.stats.spiritualPower = Math.min(
          this.player.stats.maxSpiritualPower,
          this.player.stats.spiritualPower + used.restoreSp,
        );
        emitStats(this.player.stats);
      }
    }
    this.applyGrowth(false);
    this.emitInventory();
    void this.persist();
  }

  private emitInventory(): void {
    GameBus.emit(GameEvent.Inventory, this.bag.snapshot());
  }

  private emitProgress(): void {
    GameBus.emit(GameEvent.Progression, {
      level: this.progress.level,
      xp: this.progress.xp,
      need: this.progress.need,
      title: this.progress.title,
    });
  }

  private emitCooldowns(): void {
    const combat = this.player.combat;
    GameBus.emit(GameEvent.Cooldowns, {
      skills: combat.skills.map((_, i) => combat.skillCooldownRatio(i)),
    });
  }

  private selfId(): string {
    return peekSession()?.id ?? this.avatarId;
  }

  private preyList(): Array<{
    id: string;
    position: Vector2Like;
    radius: number;
    alive: boolean;
    self: boolean;
  }> {
    const me = this.selfId();
    const list = [
      {
        id: me,
        position: this.player.hitPoint(),
        radius: this.player.hitRadius(),
        alive: this.player.alive,
        self: true,
      },
    ];
    for (const prey of this.net.prey()) {
      list.push({ ...prey, self: false });
    }
    return list;
  }

  private nearestPrey(from: Vector2Like): { position: Vector2Like; alive: boolean } {
    let best = { position: this.player.hitPoint(), alive: this.player.alive };
    let bestD = best.alive ? Phaser.Math.Distance.Between(from.x, from.y, best.position.x, best.position.y) : 1e9;
    for (const prey of this.net.prey()) {
      if (!prey.alive) continue;
      const d = Phaser.Math.Distance.Between(from.x, from.y, prey.position.x, prey.position.y);
      if (d < bestD) {
        best = { position: prey.position, alive: true };
        bestD = d;
      }
    }
    return best;
  }

  private inflict(
    prey: { id: string; self: boolean },
    damage: number,
    aim: Vector2Like,
  ): void {
    if (prey.self) {
      this.hurtPlayer(damage, aim);
      return;
    }
    peekSession()?.publishWorld({
      kind: 'hurt',
      playerId: prey.id,
      damage,
      ax: aim.x,
      ay: aim.y,
    });
  }

  private tickWorld(delta: number): void {
    if (!this.hosting || !peekSession()) return;
    this.worldTimer += delta;
    if (this.worldTimer < WORLD_SNAP_MS) return;
    this.worldTimer = 0;
    const snap = this.buildSnap();
    peekSession()?.publishWorld({ kind: 'snap', snap });
    this.zoneSaveTimer += WORLD_SNAP_MS;
    if (this.zoneSaveTimer >= 2000) {
      this.zoneSaveTimer = 0;
      const roomId = peekSession()?.world;
      if (roomId) void saveZoneSnap(roomId, snap);
    }
  }

  private async hydrateZone(): Promise<void> {
    const roomId = peekSession()?.world;
    if (!roomId || this.hosting) return;
    const snap = await loadZoneSnap(roomId, this.zone.id);
    if (snap && !this.hosting) this.applySnap(snap);
  }

  private buildSnap(): WorldSnap {
    return {
      zone: this.zone.id,
      host: this.selfId(),
      t: this.time.now,
      mobs: this.packs.map((pack) => ({
        i: pack.index,
        x: Math.round(pack.mob.x),
        y: Math.round(pack.mob.y),
        hp: Math.max(0, Math.round(pack.mob.hp)),
        a: pack.mob.alive ? 1 : 0,
      })),
      boss: this.boss
        ? {
            x: Math.round(this.boss.x),
            y: Math.round(this.boss.y),
            hp: Math.max(0, Math.round(this.boss.stats.hp)),
            a: this.boss.alive ? 1 : 0,
          }
        : undefined,
      stones: this.stones.map((stone, i) => ({ i, hp: Math.max(0, Math.round(stone.hp)) })),
      loot: this.loot.map((pile) => ({
        id: pile.id,
        x: Math.round(pile.sprite.x),
        y: Math.round(pile.sprite.y),
        items: pile.items,
      })),
    };
  }

  private applySnap(snap: WorldSnap): void {
    if (this.hosting || snap.zone !== this.zone.id) return;
    for (const row of snap.mobs) {
      const pack = this.packs.find((p) => p.index === row.i);
      pack?.mob.syncFromHost(row.x, row.y, row.hp, row.a === 1);
    }
    if (this.boss && snap.boss) {
      this.boss.syncFromHost(snap.boss.x, snap.boss.y, snap.boss.hp, snap.boss.a === 1);
    }
    for (const row of snap.stones) {
      const stone = this.stones[row.i];
      if (!stone) continue;
      stone.hp = row.hp;
      if (row.hp <= 0 && stone.sprite.active) {
        stone.sprite.setVisible(false);
        const body = stone.sprite.body as Phaser.Physics.Arcade.StaticBody | null;
        if (body) body.enable = false;
      }
    }
    const keep = new Set(snap.loot.map((row) => row.id));
    for (const pile of [...this.loot]) {
      if (keep.has(pile.id)) continue;
      pile.sprite.destroy();
      this.loot = this.loot.filter((p) => p !== pile);
    }
    for (const row of snap.loot) this.dropLoot(row.x, row.y - 10, row.items, row.id);
  }

  private onWorldEvent(event: WorldNetEvent): void {
    if (!event?.kind) return;
    if (event.kind === 'snap') {
      this.applySnap(event.snap);
      return;
    }
    if (event.kind === 'hurt' && event.playerId === this.selfId()) {
      this.hurtPlayer(event.damage, { x: event.ax, y: event.ay });
      return;
    }
    if (event.kind === 'reward' && event.playerId === this.selfId()) {
      if (event.xp) this.grantXp(event.xp, event.x, event.y, this.selfId());
      if (event.items) {
        for (const id of event.items) {
          if (!this.bag.add(id)) break;
          GameBus.emit(GameEvent.Notice, `${itemOf(id)?.name ?? id} vào túi`);
        }
        this.emitInventory();
        void this.persist();
      }
      return;
    }
    if (event.kind === 'loot-take' && this.hosting) {
      const pile = this.loot.find((p) => p.id === event.pileId);
      if (!pile) return;
      const foot =
        event.playerId === this.selfId() ? this.player.hitPoint() : this.net.footOf(event.playerId);
      if (foot && Phaser.Math.Distance.Between(foot.x, foot.y, pile.sprite.x, pile.sprite.y) > LOOT_RADIUS + 24) {
        return;
      }
      this.giveLoot(pile, event.playerId);
    }
  }

  private onHostChanged(payload: { hostId?: string; host?: boolean }): void {
    this.hosting = payload.host ?? this.net.hosting;
  }

  private onAvatarChosen(payload: AvatarChosenPayload): void {
    if (!payload?.id) return;
    this.avatarId = payload.id;
    const index = ROSTER.indexOf(payload.character as PlayerId);
    if (index >= 0 && ROSTER[this.playerIndex] !== payload.character) {
      this.playerIndex = index;
      this.replacePlayer(payload.character as PlayerId);
    }
    void this.restoreAvatar();
  }

  private onNetSession(session: WorldSession | null): void {
    if (!session) {
      this.hosting = true;
      return;
    }
    this.avatarId = session.profile.id;
    session.followZone(this.zone.id);
    this.hosting = session.isHost;
    const id = session.profile.character;
    if (this.player.profile.id !== id) {
      const index = ROSTER.indexOf(id);
      if (index >= 0) {
        this.playerIndex = index;
        this.replacePlayer(id);
      }
    }
    void this.restoreAvatar();
  }

  /* -------------------------------------------------------------- scenery */

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

  private stoneTarget(stone: TrainingStone): Damageable {
    return {
      get alive() {
        return stone.hp > 0;
      },
      hitPoint: () => this.stoneCentre(stone),
      hitRadius: () => 0,
      applyHit: (hit: HitInfo) =>
        this.damageStone(stone, hit.damage, hit.tint ?? 0xffffff, hit.frost ?? 0, hit.knockback ?? 0, hit.aim),
    };
  }

  private stoneCentre(stone: TrainingStone): { x: number; y: number } {
    const body = stone.sprite.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return { x: stone.sprite.x, y: stone.sprite.y };
    return { x: body.center.x, y: body.center.y };
  }

  /* ---------------------------------------------------------------- combat */

  private onAttack(payload: AttackPayload): void {
    const combo = 'step' in payload ? (payload as ComboPayload) : null;
    const magma = Boolean(combo) && (combo?.frost ?? 0) === 0;
    this.resolveHit(payload, {
      damage: payload.damage,
      tint: combo?.final ? (magma ? 0xff6a3a : 0x9fe8ff) : magma ? 0xffc8a0 : 0xffffff,
      sweep: 0,
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
      case HUYET_DIEM_TRAM.name:
        this.castMagmaSlash(payload);
        return;
      case TAM_THU_HONG.name:
        this.castRoar(payload);
        return;
      case TINH_MANG_TRAM.name:
        this.castStarSlash(payload);
        return;
      case TINH_KHONG_TRAN.name:
        this.castStarArray(payload);
        return;
      default:
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

  private castQiSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    let previous = { x: payload.x, y: payload.y };
    this.fx.qiCrescent({
      x: payload.x,
      y: payload.y,
      aim: payload.aim,
      range: 380,
      duration: 380,
      lift: FX_LIFT,
      onStep: (x, y) => {
        const now = { x, y };
        for (const target of this.targets) {
          if (!target.alive || hitAlready.has(target)) continue;
          const spot = target.hitPoint();
          if (distanceToSegment(spot, previous, now) > QI_SLASH_RADIUS + target.hitRadius()) continue;
          hitAlready.add(target);
          if (this.hosting) {
            this.lastHit.set(target, this.net.actorId());
            target.applyHit({
              damage: payload.damage,
              aim: payload.aim,
              frost: payload.frost ?? 0,
              knockback: 6,
              tint: 0x8fd4ff,
              side: 'player',
            });
          }
        }
        previous = now;
      },
    });
  }

  private castIceArray(payload: SkillPayload): void {
    this.fx.iceEruption(payload.x, payload.y, 1, 0.006);
    const base = Math.atan2(payload.aim.y, payload.aim.x);
    for (let i = 0; i < ICE_ARRAY_POINTS; i++) {
      const angle = base + (i / ICE_ARRAY_POINTS) * Math.PI * 2;
      const x = payload.x + Math.cos(angle) * ICE_ARRAY_SPREAD;
      const y = payload.y + Math.sin(angle) * ICE_ARRAY_SPREAD;
      this.time.delayedCall(ICE_ARRAY_STAGGER * (i + 1), () => this.fx.iceEruption(x, y, 0.78, 0));
    }
    const caught = new Set<Damageable>();
    const waves = ICE_ARRAY_POINTS + 1;
    for (let wave = 0; wave < waves; wave++) {
      const radius =
        ICE_ARRAY_CENTRE_RADIUS + ((ICE_ARRAY_REACH - ICE_ARRAY_CENTRE_RADIUS) * wave) / (waves - 1);
      const sweep = () => {
        for (const target of this.targets) {
          if (!target.alive || caught.has(target)) continue;
          const spot = target.hitPoint();
          const distance = Phaser.Math.Distance.Between(payload.x, payload.y, spot.x, spot.y);
          if (distance > radius + target.hitRadius()) continue;
          caught.add(target);
          if (this.hosting) {
            this.lastHit.set(target, this.net.actorId());
            target.applyHit({
              damage: payload.damage,
              aim: payload.aim,
              frost: payload.frost ?? 0,
              knockback: 0,
              tint: 0x8fd4ff,
              side: 'player',
            });
          }
        }
      };
      if (wave === 0) sweep();
      else this.time.delayedCall(ICE_ARRAY_STAGGER * wave, sweep);
    }
  }

  private castMagmaSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    this.magmaFx.magmaCrescent({
      x: payload.x,
      y: payload.y,
      aim: payload.aim,
      range: 380,
      duration: 380,
      lift: FX_LIFT,
      onStep: (x, y) => {
        for (const target of this.targets) {
          if (!target.alive || hitAlready.has(target)) continue;
          const spot = target.hitPoint();
          if (Phaser.Math.Distance.Between(spot.x, spot.y, x, y) > MAGMA_SLASH_RADIUS + target.hitRadius()) continue;
          hitAlready.add(target);
          this.magmaFx.magmaBurst(spot.x, spot.y, 0.7);
          if (this.hosting) {
            this.lastHit.set(target, this.net.actorId());
            target.applyHit({
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 8,
              tint: 0xff6a3a,
              side: 'player',
            });
          }
        }
      },
    });
  }

  private castRoar(payload: SkillPayload): void {
    this.magmaFx.magmaPillar(payload.x, payload.y, 1, 0.007);
    this.magmaFx.magmaNova(payload.x, payload.y);
    const base = Math.atan2(payload.aim.y, payload.aim.x);
    for (let i = 0; i < MAGMA_ARRAY_POINTS; i++) {
      const angle = base + (i / MAGMA_ARRAY_POINTS) * Math.PI * 2;
      const x = payload.x + Math.cos(angle) * MAGMA_ARRAY_SPREAD;
      const y = payload.y + Math.sin(angle) * MAGMA_ARRAY_SPREAD;
      this.time.delayedCall(MAGMA_ARRAY_STAGGER * (i + 1), () => {
        this.magmaFx.magmaPillar(x, y, 0.82, 0);
        this.magmaFx.magmaBurst(x, y, 0.8);
      });
    }
    const caught = new Set<Damageable>();
    const waves = MAGMA_ARRAY_POINTS + 1;
    for (let wave = 0; wave < waves; wave++) {
      const radius =
        MAGMA_ARRAY_CENTRE_RADIUS + ((MAGMA_ARRAY_REACH - MAGMA_ARRAY_CENTRE_RADIUS) * wave) / (waves - 1);
      const sweep = () => {
        for (const target of this.targets) {
          if (!target.alive || caught.has(target)) continue;
          const spot = target.hitPoint();
          const distance = Phaser.Math.Distance.Between(payload.x, payload.y, spot.x, spot.y);
          if (distance > radius + target.hitRadius()) continue;
          caught.add(target);
          this.magmaFx.magmaBurst(spot.x, spot.y, 0.9);
          if (this.hosting) {
            this.lastHit.set(target, this.net.actorId());
            target.applyHit({
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 0,
              tint: 0xff4a28,
              side: 'player',
            });
          }
        }
      };
      if (wave === 0) sweep();
      else this.time.delayedCall(MAGMA_ARRAY_STAGGER * wave, sweep);
    }
  }

  private castStarSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    this.starFx.starCrescent({
      x: payload.x,
      y: payload.y,
      aim: payload.aim,
      range: 380,
      duration: 380,
      lift: FX_LIFT,
      onStep: (x, y) => {
        for (const target of this.targets) {
          if (!target.alive || hitAlready.has(target)) continue;
          const spot = target.hitPoint();
          if (Phaser.Math.Distance.Between(spot.x, spot.y, x, y) > MAGMA_SLASH_RADIUS + target.hitRadius()) continue;
          hitAlready.add(target);
          this.starFx.starBurst(spot.x, spot.y, 0.7);
          if (this.hosting) {
            this.lastHit.set(target, this.net.actorId());
            target.applyHit({
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 8,
              tint: 0xb48cff,
              side: 'player',
            });
          }
        }
      },
    });
  }

  private castStarArray(payload: SkillPayload): void {
    this.starFx.starPillar(payload.x, payload.y, 1, 0.007);
    this.starFx.starNova(payload.x, payload.y);
    const base = Math.atan2(payload.aim.y, payload.aim.x);
    for (let i = 0; i < MAGMA_ARRAY_POINTS; i++) {
      const angle = base + (i / MAGMA_ARRAY_POINTS) * Math.PI * 2;
      const x = payload.x + Math.cos(angle) * MAGMA_ARRAY_SPREAD;
      const y = payload.y + Math.sin(angle) * MAGMA_ARRAY_SPREAD;
      this.time.delayedCall(MAGMA_ARRAY_STAGGER * (i + 1), () => {
        this.starFx.starPillar(x, y, 0.82, 0);
        this.starFx.starBurst(x, y, 0.8);
      });
    }
    const caught = new Set<Damageable>();
    const waves = MAGMA_ARRAY_POINTS + 1;
    for (let wave = 0; wave < waves; wave++) {
      const radius =
        MAGMA_ARRAY_CENTRE_RADIUS + ((MAGMA_ARRAY_REACH - MAGMA_ARRAY_CENTRE_RADIUS) * wave) / (waves - 1);
      const sweep = () => {
        for (const target of this.targets) {
          if (!target.alive || caught.has(target)) continue;
          const spot = target.hitPoint();
          const distance = Phaser.Math.Distance.Between(payload.x, payload.y, spot.x, spot.y);
          if (distance > radius + target.hitRadius()) continue;
          caught.add(target);
          this.starFx.starBurst(spot.x, spot.y, 0.9);
          if (this.hosting) {
            this.lastHit.set(target, this.net.actorId());
            target.applyHit({
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 0,
              tint: 0x9b6bff,
              side: 'player',
            });
          }
        }
      };
      if (wave === 0) sweep();
      else this.time.delayedCall(MAGMA_ARRAY_STAGGER * wave, sweep);
    }
  }

  private onDash(payload: DashPayload, actor?: Phaser.GameObjects.Sprite): void {
    const sprite = actor ?? this.player.sprite;
    if (sprite.texture.key === 'huyetlang') {
      this.magmaFx.shadowTrail(sprite, 6, payload.duration / 6);
      return;
    }
    if (sprite.texture.key === 'miku') {
      this.starFx.shadowTrail(sprite, 6, payload.duration / 6);
      return;
    }
    this.fx.shadowTrail(sprite, 4, payload.duration / 4);
  }

  private resolveHit(
    origin: AttackPayload,
    options: { damage: number; tint: number; sweep: number; radius: number; frost: number; knockback: number },
  ): void {
    const end = {
      x: origin.x + origin.aim.x * options.sweep,
      y: origin.y + origin.aim.y * options.sweep,
    };
    if (!this.hosting) return;
    for (const target of this.targets) {
      if (!target.alive) continue;
      const spot = target.hitPoint();
      const distance = options.sweep
        ? distanceToSegment(spot, origin, end)
        : Phaser.Math.Distance.Between(origin.x, origin.y, spot.x, spot.y);
      if (distance > options.radius + target.hitRadius()) continue;
      this.lastHit.set(target, this.net.actorId());
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
    this.floatingNumber(stone.sprite.x, stone.sprite.y - 12, damage, wasFrozen ? 0x9fe8ff : tint, wasFrozen);
    if (frost > 0) {
      const result = stone.frost.add(frost, now);
      const centre = this.stoneCentre(stone);
      if (result.froze) this.fx.freezeBurst(centre.x, centre.y);
      else this.fx.frostBurst(centre.x, centre.y);
      this.paintFrost(stone, now);
    }
    const shove = knockback || 2;
    this.tweens.add({
      targets: stone.sprite,
      x: stone.sprite.x + aim.x * shove + (knockback ? 0 : Phaser.Math.Between(-2, 2)),
      y: stone.sprite.y + aim.y * shove * 0.4,
      duration: 70,
      yoyo: true,
    });
    if (stone.hp <= 0) {
      this.grantXp(STONE_XP, stone.sprite.x, stone.sprite.y);
      this.tweens.add({
        targets: stone.sprite,
        alpha: 0,
        duration: 260,
        onComplete: () => stone.sprite.destroy(),
      });
    }
  }

  private paintFrost(stone: TrainingStone, now: number): void {
    if (stone.hp <= 0) return;
    if (stone.frost.frozen(now)) {
      stone.sprite.setTint(0x6fc8ff);
      return;
    }
    const stacks = stone.frost.stacks(now);
    if (stacks === 0) stone.sprite.clearTint();
    else stone.sprite.setTint(stacks === 1 ? 0xbcd8ec : 0x93c4e8);
  }

  private tickFrost(time: number): void {
    for (const stone of this.stones) {
      if (stone.frost.update(time)) this.paintFrost(stone, time);
    }
  }

  private floatingNumber(
    x: number,
    y: number,
    damage: number,
    tint: number,
    critical: boolean,
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

  private spawnQiBurst(payload: SkillPayload): void {
    const vector = DIRECTION_VECTORS[payload.direction];
    const blade = this.add
      .sprite(payload.x, payload.y, LIN_YUAN_TEXTURE, QI_SLASH_FRAME)
      .setDepth(payload.y + 200)
      .setScale(0.8, 1.1);
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
    GameBus.off(GameEvent.Death, this.onDeath, this);
    GameBus.off(GameEvent.NetSession, this.onNetSession, this);
    GameBus.off(GameEvent.AvatarChosen, this.onAvatarChosen, this);
    GameBus.off(GameEvent.InventoryCommand, this.onHudInventory, this);
    GameBus.off(GameEvent.WarpCommand, this.onWarpCommand, this);
    GameBus.off(GameEvent.NetWorld, this.onWorldEvent, this);
    GameBus.off(GameEvent.NetHost, this.onHostChanged, this);
    if (this.flushProgress) window.removeEventListener('pagehide', this.flushProgress);
    window.removeEventListener('visibilitychange', this.onHidden);
    void this.persist();
    this.net?.destroy();
    this.player?.destroy();
    this.clearZone();
  }
}
