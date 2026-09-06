import Phaser from 'phaser';
import { Boss1, BOSS1_ACTIONS } from './entities/Boss1';
import type { BossStrike } from './entities/Boss1';
import { EnemyAI } from './systems/EnemyAI';
import type { AiProfile } from './systems/EnemyAI';
import { BossEffects } from './systems/BossEffects';
import { distanceToSegment } from './systems/Damageable';
import type { Damageable, HitInfo } from './systems/Damageable';
import { GameBus, GameEvent, emitStats } from './events';
import type {
  AttackPayload,
  AvatarChosenPayload,
  ComboPayload,
  DashPayload,
  SkillPayload,
  WarpCommandPayload,
} from './events';
import {
  dropTexture,
  ENV_ART_ORDER,
  envArt,
  envKit,
  envKitFor,
  groundTexture,
  nextEnvArt,
  repaintEnvironment,
  WorldResourceTexture,
  FarmTexture,
  cropKindFromSeed,
  farmGrowTexture,
  growthStage,
} from './env';
import type { EnvKit } from './env';
import type { PropArt } from './env';
import { LIN_YUAN_TEXTURE, QI_SLASH_FRAME } from './animations/linYuanAnimations';
import { NhuYenEffects } from './systems/NhuYenEffects';
import { HuyetLangEffects } from './systems/HuyetLangEffects';
import { MikuEffects } from './systems/MikuEffects';
import { FrostMark } from './systems/FrostMark';
import {
  BANG_PHACH_TRAM,
  BANG_TINH_TRAN,
  HUYET_DIEM_TRAM,
  TAM_THU_HONG,
  TINH_MANG_TRAM,
  TINH_KHONG_TRAN,
} from './systems/CombatSystem';
import { PLAYER_FACTORIES } from './entities/playerHandle';
import type { PlayerHandle, PlayerId } from './entities/playerHandle';
import { DIRECTION_VECTORS } from './types';
import type { Direction, Vector2Like } from './types';
import { Multiplayer } from './systems/Multiplayer';
import { isInputGated, isSystemMenuOpen, isUiTyping, loadSavedJoin, peekSession } from '../net/bind';
import { newPlayerId } from '../net/supabase';
import type { WorldSession } from '../net/WorldSession';
import type { NetHitRow, WorldNetEvent, WorldSnap } from '../net/types';
import { HIT_ECHO_MS, WORLD_SNAP_MS } from '../net/types';
import { defaultAvatar, loadAvatar, saveAvatar } from '../net/avatarStore';
import { loadZoneSnap, saveZoneSnap } from '../net/zoneStore';
import { Progression, titleForLevel, writeDerived } from './systems/Progression';
import {
  breakThrough,
  canBreakThrough,
  costLabel,
  recipeForLevel,
} from './systems/BreakthroughSystem';
import { Inventory, itemOf, rollDrops } from './systems/Inventory';
import type { EquipSlot } from './systems/Inventory';
import {
  allocateAttribute,
  createAttributeState,
  deriveAttributeBonuses,
  type AttributeState,
} from './systems/Attributes';
import {
  SKILL_CATALOG,
  SKILL_TREES,
  SkillSystem,
  type SkillClass,
} from './systems/SkillSystem';
import { buildCombatKit, kitBindHint } from './systems/SkillKit';
import {
  craftAlchemy,
  alchemyCostLabel,
} from './systems/AlchemySystem';
import {
  idleTribulation,
  planTribulation,
  TRIBULATION_DURATION_MS,
  TRIBULATION_FAIL_COOLDOWN_MS,
  type TribulationState,
} from './systems/TribulationSystem';
import {
  QUESTS,
  QuestSystem,
  refreshQuestAvailability,
  type QuestEvent,
} from './systems/QuestSystem';
import { SHOP_CATALOG } from './systems/ShopSystem';
import {
  SEED_CATALOG,
  createFarmState,
  ensureFarmPlots,
  growFarm,
  harvestPlot,
  plantSeed,
  plotGrowth,
  waterPlot,
  DEFAULT_FARM_PLOTS,
  type FarmState,
} from './systems/Farming';
import { Mob, MOB_AI } from './entities/Mob';
import type { MobStrike } from './entities/Mob';
import {
  BOSS_DROPS,
  BOSS_XP,
  DEFAULT_ZONE,
  MOB_DROPS,
  MOB_XP,
  STONE_XP,
  WIND_BOSS_DROPS,
  ZONE_ORDER,
  warpStand,
  zoneOf,
} from './zones';
import type {
  ChestDef,
  ChestTier,
  FarmDecorDef,
  FarmPlotDef,
  PlantDef,
  PlantKind,
  PortalDef,
  ZoneDef,
  ZoneId,
} from './zones';
import { setCurrentZone } from './worldState';
import { consumePad } from './touchPad';
import { pollGamepad } from './gamepad';
import { currentAccessToken } from '../net/auth';
import {
  buyServerItem,
  claimServerQuestReward,
  sellServerItem,
} from '../net/economy';
import { grantLoot } from './systems/LootSystem';
import { canEnterZone } from './systems/ZoneLoader';
import { npcsInZone, type NpcDefinition } from './systems/NpcSystem';

const HIT_RADIUS = 64;
/** Muted grey-blue so your own numbers stay readable in a four-player pile-on. */
const ALLY_DAMAGE_TINT = 0xa9b6cf;
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
/** Mobs will not chase or stand inside this circle around the respawn shrine. */
const SHRINE_SAFE_RADIUS = 180;
const STORAGE_RADIUS = 72;
const PORTAL_RADIUS = 48;
const LOOT_RADIUS = 42;
const RESOURCE_RADIUS = 64;
const FARM_PLOT_RADIUS = 56;
const PLANT_RESPAWN_MS = 30000;
const CHEST_RESPAWN_MS = 90000;
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
  /**
   * Ground the pile rests on. `sprite.y` bobs, so proximity checks and saves read
   * this instead — otherwise a pile would drift a few pixels every time it was
   * written out and read back.
   */
  ground: number;
}

interface HarvestNode {
  kind: 'plant';
  def: PlantDef;
  sprite: Phaser.GameObjects.Image;
  readyAt: number;
}

interface FarmPlotNode {
  def: FarmPlotDef;
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

interface TreasureNode {
  kind: 'chest';
  def: ChestDef;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  readyAt: number;
}

type WorldResource = HarvestNode | TreasureNode;

const PLANT_TEXTURE: Record<PlantKind, string> = {
  'blood-berry': WorldResourceTexture.PlantBloodBerry,
  'spirit-herb': WorldResourceTexture.PlantSpiritHerb,
  'earth-fruit': WorldResourceTexture.PlantEarthFruit,
  'essence-root': WorldResourceTexture.PlantEssenceRoot,
};

const CHEST_TEXTURE: Record<ChestTier, string> = {
  common: WorldResourceTexture.ChestCommon,
  rare: WorldResourceTexture.ChestRare,
  epic: WorldResourceTexture.ChestEpic,
  legendary: WorldResourceTexture.ChestLegendary,
  mythic: WorldResourceTexture.ChestMythic,
};

const CHEST_REWARD: Record<ChestTier, { stone: string; xp: number; label: string }> = {
  common: { stone: 'wood-stone', xp: 6, label: 'rương thường' },
  rare: { stone: 'water-stone', xp: 10, label: 'rương hiếm' },
  epic: { stone: 'fire-stone', xp: 16, label: 'rương sử thi' },
  legendary: { stone: 'earth-stone', xp: 24, label: 'rương huyền thoại' },
  mythic: { stone: 'void-stone', xp: 36, label: 'rương thần thoại' },
};

interface MobPack {
  index: number;
  mob: Mob;
  ai: EnemyAI;
  respawnAt: number | null;
  /** Heavenly tribulation wave — no zone respawn. */
  tribulation?: boolean;
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
  private resources: WorldResource[] = [];
  private farmPlots: FarmPlotNode[] = [];
  private farmDecorSprites: Phaser.GameObjects.Image[] = [];
  private farmGround: Phaser.GameObjects.GameObject[] = [];
  private selectedFarmSeed = 'spirit-herb-seed';
  private portals: Array<{
    def: PortalDef;
    sprite: Phaser.GameObjects.Sprite;
    label: Phaser.GameObjects.Text;
  }> = [];
  private decals: Phaser.GameObjects.Image[] = [];
  private npcs: Array<{
    def: NpcDefinition;
    sprite: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  }> = [];
  private shrineSprite?: Phaser.GameObjects.Sprite;
  private shrineLabel?: Phaser.GameObjects.Text;
  private shrineRing?: Phaser.GameObjects.Graphics;
  private storageSprite?: Phaser.GameObjects.Sprite;
  private storageLabel?: Phaser.GameObjects.Text;
  private waypointSprite?: Phaser.GameObjects.Sprite;
  private waypointLabel?: Phaser.GameObjects.Text;
  private waypointRing?: Phaser.GameObjects.Graphics;
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
    envArt: Phaser.Input.Keyboard.Key;
    hurt?: Phaser.Input.Keyboard.Key;
    respawn?: Phaser.Input.Keyboard.Key;
    boss?: Phaser.Input.Keyboard.Key;
  };
  private zone: ZoneDef = zoneOf(DEFAULT_ZONE);
  private progress = new Progression();
  private bag = new Inventory();
  private attributes: AttributeState = createAttributeState();
  private skills = new SkillSystem('nhuyen');
  private quests = new QuestSystem();
  private trackedQuests: string[] = [];
  private farm: FarmState = createFarmState(DEFAULT_FARM_PLOTS);
  private rpgEventSeq = 0;
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
  private hitEcho: NetHitRow[] = [];
  private hitTimer = 0;
  private readonly lastHit = new WeakMap<object, string>();
  private warps = new Set<ZoneId>([DEFAULT_ZONE]);
  private warpOpen = false;
  private minimapTimer = 0;
  /** Lobby pick waiting to be applied on enter (id + kit + name). */
  private pendingAvatar: AvatarChosenPayload | null = null;
  private applyingAvatar = false;
  private tribulation: TribulationState = idleTribulation();
  private tribulationHudTimer = 0;

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
    GameBus.on(GameEvent.CharacterBuildCommand, this.onCharacterBuild, this);
    GameBus.on(GameEvent.QuestCommand, this.onQuestCommand, this);
    GameBus.on(GameEvent.ShopCommand, this.onShopCommand, this);
    GameBus.on(GameEvent.FarmCommand, this.onFarmCommand, this);
    GameBus.on(GameEvent.FarmSelectSeed, this.onFarmSelectSeed, this);
    GameBus.on(GameEvent.StorageCommand, this.onStorageCommand, this);
    GameBus.on(GameEvent.WarpCommand, this.onWarpCommand, this);
    GameBus.on(GameEvent.AlchemyCommand, this.onAlchemyCommand, this);
    GameBus.on(GameEvent.NetWorld, this.onWorldEvent, this);
    GameBus.on(GameEvent.NetHost, this.onHostChanged, this);
    peekSession()?.followZone(DEFAULT_ZONE);
    this.hosting = this.net.hosting;
    this.flushProgress = () => {
      void this.persist(true);
    };
    window.addEventListener('pagehide', this.flushProgress);
    window.addEventListener('visibilitychange', this.onHidden);
    this.emitRpgPanels();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);
  }

  update(time: number, delta: number): void {
    pollGamepad({ gated: isInputGated() });
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
    this.tickResources(time);
    this.tickFarm(time);
    this.tickLootPrompt();
    this.tickFrost(time);
    this.tickTribulation(time, delta);
    this.tickKeys();
    this.tickWorld(delta);
    this.tickMinimap(delta);
    this.saveTimer += delta;
    if (this.saveTimer > 5000) {
      this.saveTimer = 0;
      void this.persist();
    }
  }

  /* --------------------------------------------------------------- zone */

  private loadZone(id: ZoneId, at?: Vector2Like, first = false): void {
    if (this.tribulation.phase === 'active') this.failTribulation('zone');
    this.clearZone();
    this.zone = zoneOf(id);
    setCurrentZone(this.zone.id);
    this.physics.world.setBounds(0, 0, this.zone.width, this.zone.height);

    const kit = envKitFor(this.zone.ground);
    this.ground = this.add
      .tileSprite(0, 0, this.zone.width, this.zone.height, groundTexture(kit, this.zone.ground))
      .setOrigin(0, 0)
      .setDepth(-1000);

    this.props = this.physics.add.staticGroup();
    this.scatterDecals(kit);
    for (const [x, y] of this.zone.trees) this.addProp(kit.tree, x, y);
    for (const [x, y] of this.zone.rocks) this.addProp(kit.rock, x, y);

    this.placeShrine();
    this.placeStorageChest();
    this.placeWaypoint();
    this.placeNpcs();
    this.placeArena();
    this.placeFarm();
    this.placeResources();

    for (const [x, y] of this.zone.stones) {
      const sprite = this.addProp(kit.stone, x, y);
      const stone: TrainingStone = { sprite, hp: STONE_HP, frost: new FrostMark() };
      this.stones.push(stone);
      this.targets.push(this.stoneTarget(stone));
    }

    this.zone.mobs.forEach((spawn, index) => this.spawnMob(spawn.kind, spawn.x, spawn.y, index));
    if (this.zone.boss) this.spawnBoss(this.zone.boss.x, this.zone.boss.y);

    for (const def of this.zone.portals) {
      const sprite = this.add.sprite(def.x, def.y, kit.portal.texture).setOrigin(0.5, kit.portal.originY).setDepth(def.y);
      const label = this.add
        .text(def.x, def.y - kit.portal.labelLift, def.label, {
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
    peekSession()?.followZone(this.zone.id);
    this.hosting = this.net ? this.net.hosting : !peekSession() || Boolean(peekSession()?.isHost);
    if (!this.spawn) this.spawn = { zone: this.zone.id, x: this.zone.shrine.x, y: this.zone.shrine.y };
    this.syncZoneReach();
    this.emitProgress();
    this.emitRpgPanels();
    void this.hydrateZone();
  }

  private syncZoneReach(): void {
    if (!this.quests || !this.progress) return;
    const result = this.quests.creditReach(this.zone.id, this.progress.level);
    if (result.ok && result.changedQuestIds.length) {
      GameBus.emit(GameEvent.Notice, 'Tiến độ nhiệm vụ đã cập nhật');
      this.emitQuests();
    }
  }

  private placeNpcs(): void {
    for (const def of npcsInZone(this.zone.id)) {
      const tint =
        def.role === 'merchant'
          ? 0xc9a24a
          : def.role === 'gem'
            ? 0x9b6bd6
            : def.role === 'alchemy'
              ? 0x6bcf8e
              : 0x6fd8ff;
      const sprite = this.add
        .rectangle(def.x, def.y - 22, 28, 44, tint, 0.9)
        .setStrokeStyle(2, 0xe9f3ff, 0.7)
        .setDepth(def.y);
      const label = this.add
        .text(def.x, def.y - 54, def.name, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#e9f3ff',
          stroke: '#05070d',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(def.y + 1);
      this.npcs.push({ def, sprite, label });
    }
  }

  private nearestNpc(): NpcDefinition | null {
    if (!this.player) return null;
    const foot = this.player.hitPoint();
    let nearest: { def: NpcDefinition; distance: number } | null = null;
    for (const npc of this.npcs) {
      const distance = Phaser.Math.Distance.Between(foot.x, foot.y, npc.def.x, npc.def.y);
      if (distance <= RESOURCE_RADIUS && (!nearest || distance < nearest.distance)) {
        nearest = { def: npc.def, distance };
      }
    }
    return nearest?.def ?? null;
  }

  private interactNpc(npc: NpcDefinition): void {
    this.applyQuestEvent('talk', npc.id);
    if (npc.role === 'merchant') {
      this.emitShop();
      GameBus.emit(GameEvent.ShopToggle);
    } else if (npc.role === 'gem') {
      GameBus.emit(GameEvent.InventoryToggle);
      GameBus.emit(GameEvent.Notice, 'Chọn ngọc trong túi để khảm hoặc tháo');
    } else if (npc.role === 'alchemy') {
      this.emitInventory();
      this.emitProgress();
      GameBus.emit(GameEvent.AlchemyToggle, { forceOpen: true });
    } else {
      this.emitQuests();
      GameBus.emit(GameEvent.QuestToggle);
    }
  }

  private placeShrine(): void {
    const { x, y } = this.zone.shrine;
    this.shrineSprite = this.add
      .sprite(x, y, WorldResourceTexture.RespawnShrine)
      .setOrigin(0.5, 1)
      .setDepth(y)
      .setDisplaySize(119, 180);
    this.shrineRing = this.add.graphics().setDepth(y - 2);
    this.shrineRing.lineStyle(2, 0x6fd8ff, 0.7);
    this.shrineRing.strokeEllipse(x, y - 4, 96, 36);
    this.shrineRing.lineStyle(1, 0x9fe8ff, 0.35);
    this.shrineRing.strokeEllipse(x, y - 4, 116, 46);
    this.shrineLabel = this.add
      .text(x, y - 184, 'Trụ hồi sinh', {
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

  private storageAnchor(): Vector2Like {
    return { x: this.zone.shrine.x - 118, y: this.zone.shrine.y + 28 };
  }

  private placeStorageChest(): void {
    const { x, y } = this.storageAnchor();
    this.add
      .ellipse(x, y - 2, 54, 18, 0x05070d, 0.4)
      .setDepth(y - 1);
    this.storageSprite = this.add
      .sprite(x, y, WorldResourceTexture.ChestLegendary)
      .setOrigin(0.5, 1)
      .setDepth(y)
      .setDisplaySize(58, 46);
    this.storageLabel = this.add
      .text(x, y - 54, 'Rương trữ đồ', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f0d090',
        stroke: '#05070d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 2);
  }

  private placeWaypoint(): void {
    const { x, y } = this.zone.waypoint;
    this.waypointSprite = this.add
      .sprite(x, y, WorldResourceTexture.WarpShrine)
      .setOrigin(0.5, 1)
      .setDepth(y)
      .setDisplaySize(107, 160);
    this.waypointRing = this.add.graphics().setDepth(y - 2);
    this.waypointRing.lineStyle(2, 0xb46cff, 0.75);
    this.waypointRing.strokeEllipse(x, y - 3, 90, 32);
    this.waypointRing.lineStyle(1, 0xe0b4ff, 0.4);
    this.waypointRing.strokeEllipse(x, y - 3, 110, 42);
    this.waypointLabel = this.add
      .text(x, y - 164, 'Trụ dịch chuyển', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#deb5ff',
        stroke: '#05070d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 2);
    this.tweens.add({
      targets: [this.waypointRing, this.waypointLabel],
      alpha: { from: 0.5, to: 1 },
      duration: 1050,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Plants and treasure are personal nodes: in a multiplayer room, harvesting
   * one does not make another player's copy disappear. That avoids one player
   * exhausting a whole zone for everyone else.
   */
  private placeResources(): void {
    for (const def of this.zone.plants) {
      const sprite = this.add
        .image(def.x, def.y, PLANT_TEXTURE[def.kind])
        .setOrigin(0.5, 1)
        .setDisplaySize(48, 48)
        .setDepth(def.y);
      this.resources.push({ kind: 'plant', def, sprite, readyAt: 0 });
    }
    for (const def of this.zone.chests) {
      const shadow = this.add
        .ellipse(def.x, def.y - 2, 52, 16, 0x05070d, 0.38)
        .setDepth(def.y - 1);
      const sprite = this.add
        .image(def.x, def.y, CHEST_TEXTURE[def.tier])
        .setOrigin(0.5, 1)
        .setDisplaySize(54, 42)
        .setDepth(def.y);
      this.resources.push({ kind: 'chest', def, sprite, shadow, readyAt: 0 });
    }
  }

  private placeFarm(): void {
    this.purgeDecalsOverFarm();

    const bed = this.zone.farmBed;
    const road = this.zone.farmPath;
    const bedKey = this.textures.exists(FarmTexture.Bed)
      ? FarmTexture.Bed
      : this.textures.exists(FarmTexture.Soil)
        ? FarmTexture.Soil
        : FarmTexture.Path;
    const rimKey = this.textures.exists(FarmTexture.BedRim) ? FarmTexture.BedRim : bedKey;
    const pathKey = this.textures.exists(FarmTexture.Path) ? FarmTexture.Path : bedKey;
    const bankKey = this.textures.exists(FarmTexture.PathBank) ? FarmTexture.PathBank : rimKey;
    const rim = 28;
    const bank = 20;

    if (bed && this.textures.exists(rimKey)) {
      // Grass→dirt skirt so the court does not cut the map with a hard rectangle.
      const skirt = this.add
        .tileSprite(bed.x - rim, bed.y - rim, bed.width + rim * 2, bed.height + rim * 2, rimKey)
        .setOrigin(0, 0)
        .setDepth(-960);
      this.farmGround.push(skirt);
    }

    if (bed && this.textures.exists(bedKey)) {
      const court = this.add
        .tileSprite(bed.x, bed.y, bed.width, bed.height, bedKey)
        .setOrigin(0, 0)
        .setDepth(-950);
      this.farmGround.push(court);
    }

    // Soft bank then centre lane — road grows out of the grass instead of a stripe.
    if (road && this.textures.exists(bankKey)) {
      const bankStrip = this.add
        .tileSprite(road.x - bank, road.y, road.width + bank * 2, road.height, bankKey)
        .setOrigin(0, 0)
        .setDepth(-915);
      this.farmGround.push(bankStrip);
    }
    if (road && this.textures.exists(pathKey)) {
      const lane = this.add
        .tileSprite(road.x, road.y, road.width, road.height, pathKey)
        .setOrigin(0, 0)
        .setDepth(-900);
      this.farmGround.push(lane);
    }

    for (const def of this.zone.farmDecor ?? []) {
      if (def.kind === 'soil-pad' || def.kind === 'path') continue;
      this.spawnFarmDecor(def);
    }

    for (const def of this.zone.farmPlots ?? []) {
      const soilKey = this.textures.exists(FarmTexture.Soil) ? FarmTexture.Soil : bedKey;
      const soil = this.add
        .image(def.x, def.y - 2, soilKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(40, 36)
        .setDepth(-930)
        .setTint(0xa89068);
      const crop = this.add
        .image(def.x, def.y - 8, soilKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(36, 36)
        .setDepth(def.y)
        .setVisible(false);
      const label = this.add
        .text(def.x, def.y - 52, '', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#d7f0c8',
          stroke: '#05070d',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(def.y + 2);
      this.farmPlots.push({ def, soil, crop, label });
    }

    if ((this.zone.farmPlots?.length ?? 0) > 0 && bed) {
      this.add
        .text(bed.x + bed.width / 2, bed.y - rim - 6, 'Linh Điền', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#c8d8b0',
          stroke: '#05070d',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(bed.y + 4);
    }
    this.refreshFarmPlots();
  }

  /** Mana-seed clutter must not sit on the tilled court, rim, or entry road. */
  private purgeDecalsOverFarm(): void {
    const bed = this.zone.farmBed;
    const road = this.zone.farmPath;
    if ((!bed && !road) || this.decals.length === 0) return;
    const rim = 36;
    const bank = 28;
    this.decals = this.decals.filter((sprite) => {
      const onBed =
        !!bed &&
        sprite.x >= bed.x - rim &&
        sprite.x <= bed.x + bed.width + rim &&
        sprite.y >= bed.y - rim &&
        sprite.y <= bed.y + bed.height + rim;
      const onRoad =
        !!road &&
        sprite.x >= road.x - bank &&
        sprite.x <= road.x + road.width + bank &&
        sprite.y >= road.y - 12 &&
        sprite.y <= road.y + road.height + 12;
      if (onBed || onRoad) {
        sprite.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnFarmDecor(def: FarmDecorDef): void {
    const texture =
      def.kind === 'house'
        ? FarmTexture.House
        : def.kind === 'fence-h'
          ? FarmTexture.FenceH
          : def.kind === 'fence-v'
            ? FarmTexture.FenceV
            : def.kind === 'fence-post'
              ? FarmTexture.FencePost
              : def.kind === 'chicken'
                ? FarmTexture.Chicken
                : def.kind === 'path'
                  ? FarmTexture.Path
                  : FarmTexture.Soil;
    if (!this.textures.exists(texture)) return;
    const sprite = this.add.image(def.x, def.y, texture).setOrigin(0.5, 1);
    if (def.kind === 'house') {
      sprite.setDisplaySize(144, 192).setDepth(def.y);
    } else if (def.kind === 'chicken') {
      sprite.setDisplaySize(36, 36).setDepth(def.y);
    } else if (def.kind === 'path') {
      sprite.setDisplaySize(48, 48).setDepth(-900);
    } else {
      sprite.setDisplaySize(48, 48).setDepth(def.y).setTint(0xd8c8a0);
    }
    this.farmDecorSprites.push(sprite);
  }

  private refreshFarmPlots(): void {
    const now = Date.now();
    this.farm = growFarm(this.farm, now);
    const foot = this.player?.hitPoint() ?? null;
    for (const node of this.farmPlots) {
      const near =
        !!foot && Phaser.Math.Distance.Between(foot.x, foot.y, node.def.x, node.def.y) <= 140;
      const plot = this.farm.plots.find((candidate) => candidate.id === node.def.id);
      if (!plot || plot.status === 'empty' || !plot.seedId) {
        node.crop.setVisible(false);
        node.soil.setTexture(
          this.textures.exists(FarmTexture.Soil) ? FarmTexture.Soil : node.soil.texture.key,
        );
        node.soil.setTint(0xa89068);
        node.label.setText(near ? 'Đất trống' : '');
        node.label.setColor('#d7f0c8');
        continue;
      }

      const needsWater = plot.status === 'growing' && !plot.watered;
      const wetKey = FarmTexture.SoilWet;
      const dryKey = FarmTexture.Soil;
      if (needsWater) {
        if (this.textures.exists(dryKey)) node.soil.setTexture(dryKey);
        node.soil.setTint(0xd4b896);
      } else {
        if (this.textures.exists(wetKey)) node.soil.setTexture(wetKey);
        else if (this.textures.exists(dryKey)) node.soil.setTexture(dryKey);
        node.soil.clearTint();
        if (!this.textures.exists(wetKey)) node.soil.setTint(0x8fbc8f);
      }

      const kind = cropKindFromSeed(plot.seedId);
      const progress = plotGrowth(plot, now);
      const ready = plot.status === 'ready';
      const stage = needsWater ? 0 : growthStage(progress, ready);
      if (kind && this.textures.exists(farmGrowTexture(kind, stage))) {
        node.crop.setTexture(farmGrowTexture(kind, stage));
        node.crop.setVisible(true);
        node.crop.setDisplaySize(ready ? 44 : 36, ready ? 44 : 36);
      } else if (kind && this.textures.exists(PLANT_TEXTURE[kind])) {
        node.crop.setTexture(PLANT_TEXTURE[kind]);
        node.crop.setVisible(true);
      } else {
        node.crop.setVisible(false);
      }
      const cropName = SEED_CATALOG[plot.seedId]?.name ?? plot.seedId;
      if (!near) {
        node.label.setText('');
      } else if (needsWater) {
        node.label.setText(`Cần tưới · ${cropName}`);
        node.label.setColor('#f0d080');
      } else if (ready) {
        node.label.setText(`Thu hoạch · ${cropName}`);
        node.label.setColor('#ffe6a0');
      } else {
        node.label.setText(`${cropName} · ${Math.round(progress * 100)}%`);
        node.label.setColor('#c8e4b0');
      }
    }
  }

  private nearestFarmPlot(): FarmPlotNode | null {
    if (!this.player || this.zone.id !== 'linh-dien' || this.farmPlots.length === 0) return null;
    const foot = this.player.hitPoint();
    let best: { node: FarmPlotNode; distance: number } | null = null;
    for (const node of this.farmPlots) {
      const distance = Phaser.Math.Distance.Between(foot.x, foot.y, node.def.x, node.def.y);
      if (distance > FARM_PLOT_RADIUS) continue;
      if (!best || distance < best.distance) best = { node, distance };
    }
    return best?.node ?? null;
  }

  private interactFarmPlot(node: FarmPlotNode): void {
    const plot = this.farm.plots.find((candidate) => candidate.id === node.def.id);
    if (!plot) return;
    if (plot.status === 'ready') {
      this.onFarmCommand({ action: 'harvest', plotId: plot.id });
      return;
    }
    if (plot.status === 'growing' && !plot.watered) {
      this.onFarmCommand({ action: 'water', plotId: plot.id });
      return;
    }
    if (plot.status === 'growing') {
      const progress = Math.round(plotGrowth(plot, Date.now()) * 100);
      GameBus.emit(GameEvent.Notice, `Đang lớn · ${progress}%`);
      return;
    }
    if (this.bag.count(this.selectedFarmSeed) < 1) {
      GameBus.emit(GameEvent.Notice, 'Thiếu hạt giống — mở panel Linh Điền để chọn');
      GameBus.emit(GameEvent.FarmToggle);
      return;
    }
    this.onFarmCommand({
      action: 'plant',
      plotId: plot.id,
      seedId: this.selectedFarmSeed,
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

  private nearStorage(): boolean {
    const foot = this.player.hitPoint();
    const chest = this.storageAnchor();
    return Phaser.Math.Distance.Between(foot.x, foot.y, chest.x, chest.y) <= STORAGE_RADIUS;
  }

  private inShrineSafe(point: Vector2Like): boolean {
    return (
      Phaser.Math.Distance.Between(point.x, point.y, this.zone.shrine.x, this.zone.shrine.y) <=
      SHRINE_SAFE_RADIUS
    );
  }

  private keepMobOutOfShrine(mob: Phaser.Physics.Arcade.Sprite): void {
    const { x: sx, y: sy } = this.zone.shrine;
    const d = Phaser.Math.Distance.Between(mob.x, mob.y, sx, sy);
    if (d >= SHRINE_SAFE_RADIUS || d < 1) return;
    const nx = (mob.x - sx) / d;
    const ny = (mob.y - sy) / d;
    mob.setPosition(sx + nx * SHRINE_SAFE_RADIUS, sy + ny * SHRINE_SAFE_RADIUS);
    mob.setVelocity(0, 0);
  }

  private nearWaypoint(): boolean {
    const foot = this.player.hitPoint();
    return Phaser.Math.Distance.Between(foot.x, foot.y, this.zone.waypoint.x, this.zone.waypoint.y) <= SHRINE_RADIUS;
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
    GameBus.emit(GameEvent.Notice, `Đã đặt điểm hồi sinh · ${this.zone.name}`);
    void this.persist();
  }

  private openStorage(): void {
    this.emitInventory();
    GameBus.emit(GameEvent.StorageToggle, { forceOpen: true });
  }

  private onStorageCommand(payload: { action?: string; index?: number; quantity?: number }): void {
    if (!payload?.action || payload.index === undefined) return;
    if (!this.nearStorage()) {
      GameBus.emit(GameEvent.Notice, 'Hãy đứng gần rương trữ đồ');
      return;
    }
    const amount = payload.quantity;
    let ok = false;
    if (payload.action === 'deposit') {
      ok = this.bag.deposit(payload.index, amount);
      if (!ok) GameBus.emit(GameEvent.Notice, 'Rương đầy hoặc không gửi được');
    } else if (payload.action === 'withdraw') {
      ok = this.bag.withdraw(payload.index, amount);
      if (!ok) GameBus.emit(GameEvent.Notice, 'Túi đầy hoặc không lấy được');
    }
    if (!ok) return;
    this.emitInventory();
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
    if (!this.nearWaypoint()) {
      GameBus.emit(GameEvent.Notice, 'Đến trụ dịch chuyển');
      return;
    }
    this.discoverWarp(this.zone.id);
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
    if (!this.nearWaypoint()) {
      GameBus.emit(GameEvent.Notice, 'Đến trụ dịch chuyển');
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
    this.applyQuestEvent('reach', zone);
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
    for (const pile of this.loot) this.destroyPile(pile);
    this.loot = [];
    for (const resource of this.resources) {
      if (resource.kind === 'chest') resource.shadow.destroy();
      resource.sprite.destroy();
    }
    this.resources = [];
    for (const node of this.farmPlots) {
      node.soil.destroy();
      node.crop.destroy();
      node.label.destroy();
    }
    this.farmPlots = [];
    for (const sprite of this.farmDecorSprites) sprite.destroy();
    this.farmDecorSprites = [];
    for (const ground of this.farmGround) ground.destroy();
    this.farmGround = [];
    for (const portal of this.portals) {
      portal.sprite.destroy();
      portal.label.destroy();
    }
    this.portals = [];
    for (const npc of this.npcs) {
      npc.sprite.destroy();
      npc.label.destroy();
    }
    this.npcs = [];
    this.stones = [];
    this.targets = [];
    // Mob indices belong to the zone that produced them.
    this.hitEcho = [];
    this.shrineSprite?.destroy();
    this.shrineSprite = undefined;
    this.shrineLabel?.destroy();
    this.shrineLabel = undefined;
    this.shrineRing?.destroy();
    this.shrineRing = undefined;
    this.storageSprite?.destroy();
    this.storageSprite = undefined;
    this.storageLabel?.destroy();
    this.storageLabel = undefined;
    this.waypointSprite?.destroy();
    this.waypointSprite = undefined;
    this.waypointLabel?.destroy();
    this.waypointLabel = undefined;
    this.waypointRing?.destroy();
    this.waypointRing = undefined;
    this.arenaRing?.destroy();
    this.arenaRing = undefined;
    this.arenaLabel?.destroy();
    this.arenaLabel = undefined;
    for (const decal of this.decals) decal.destroy();
    this.decals = [];
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
    const questState = this.quests.snapshot();
    const access = canEnterZone(def.to, {
      level: this.progress.level,
      finishedQuests: new Set(
        Object.entries(questState.quests)
          .filter(([, progress]) => progress.status === 'completed' || progress.status === 'claimed')
          .map(([id]) => id),
      ),
    });
    if (!access.allowed) {
      GameBus.emit(GameEvent.Notice, access.reason ?? 'Khu vực chưa mở');
      return;
    }
    this.crossing = true;
    this.cameras.main.fadeOut(280, 6, 8, 15);
    await new Promise<void>((resolve) => this.cameras.main.once('camerafadeoutcomplete', () => resolve()));
    this.loadZone(def.to, def.spawn);
    this.applyQuestEvent('reach', def.to);
    if (def.to === 'ngoai-mon') {
      this.applyQuestEvent('talk', 'truong-lao');
      this.applyQuestEvent('talk', 'duoc-su');
    }
    if (def.to === 'huyet-ma-coc') this.applyQuestEvent('talk', 'de-tu-bi-thuong');
    this.cameras.main.fadeIn(280, 6, 8, 15);
    this.crossing = false;
    if (this.zone.arena) {
      GameBus.emit(GameEvent.Notice, `${this.zone.arena.label ?? 'Khu vực boss'} ở phía đông — Huyết Ma canh giữ`);
    }
    void this.persist();
  }

  /* ------------------------------------------------------------ player */

  private spawnPlayer(id: PlayerId, at: Vector2Like): void {
    if (this.skills.snapshot().classId !== id) this.skills = new SkillSystem(id as SkillClass);
    const derived = this.progress.derive(id, this.buildBonuses());
    this.player = PLAYER_FACTORIES[id](this, at.x, at.y, derived);
    this.player.sprite.y -= this.player.footY() - at.y;
    this.syncCombatKit();
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
    const derived = this.progress.derive(ROSTER[this.playerIndex], this.buildBonuses());
    writeDerived(this.player.stats, derived, fill);
    this.syncCombatKit();
    emitStats(this.player.stats);
    this.emitProgress();
  }

  /** Push skill-tree ranks into the live combat kit (locks + scaling). */
  private syncCombatKit(): void {
    if (!this.player) return;
    const state = this.skills.snapshot();
    const kit = buildCombatKit(state.classId, state.ranks);
    this.player.combat.replaceSkills(kit);
  }

  private buildBonuses(): Partial<import('../types').CharacterStats> {
    const total = { ...this.bag.bonuses() };
    const add = (bonuses: Partial<import('../types').CharacterStats>) => {
      for (const [key, value] of Object.entries(bonuses)) {
        const field = key as keyof import('../types').CharacterStats;
        total[field] = (total[field] ?? 0) + (value ?? 0);
      }
    };
    add(deriveAttributeBonuses(this.attributes.values));
    const learned = this.skills.snapshot().ranks;
    for (const [id, rank] of Object.entries(learned)) {
      const effect = SKILL_CATALOG[id]?.effect;
      if (effect?.stat && effect.value) add({ [effect.stat]: effect.value * rank });
    }
    return total;
  }

  private grantXp(amount: number, x: number, y: number, toId?: string): void {
    const who = toId ?? this.actorId();
    if (who !== this.selfId()) {
      peekSession()?.publishWorld({ kind: 'reward', playerId: who, xp: amount, x, y });
      return;
    }
    const gained = this.progress.grant(amount);
    this.floatingNumber(x, y - 40, 0, 0xffe9a8, false, `+${amount} KN`);
    if (gained > 0) {
      this.attributes.availablePoints += gained * 2;
      this.skills.grantPoints(gained);
      this.applyGrowth(true);
      this.floatingNumber(x, y - 64, 0, 0x9fe8ff, true, this.progress.title);
    } else {
      this.emitProgress();
    }
    this.emitRpgPanels();
    void this.persist();
  }

  /* --------------------------------------------------------------- mobs */

  private spawnMob(
    kind: Mob['kind'],
    x: number,
    y: number,
    index: number,
    opts?: { tribulation?: boolean; hpScale?: number },
  ): void {
    const mob = new Mob(this, { x, y }, kind, {
      onStrike: (_mob, strike) => this.onMobStrike(strike),
      onDeath: (dead) => this.onMobDeath(dead),
      onFrost: (target, froze) => {
        const p = target.hitPoint();
        if (froze) this.fx.freezeBurst(p.x, p.y);
        else this.fx.frostBurst(p.x, p.y);
      },
    });
    if (opts?.hpScale && opts.hpScale > 1) {
      mob.maxHp = Math.round(mob.maxHp * opts.hpScale);
      mob.hp = mob.maxHp;
    }
    if (opts?.tribulation) mob.setTint(0xffe08a);
    this.physics.add.collider(mob, this.props);
    if (this.player) {
      this.enemyColliders.push(this.physics.add.collider(this.player.sprite, mob));
    }
    this.packs.push({
      index,
      mob,
      ai: new EnemyAI(mob, MOB_AI[kind]),
      respawnAt: null,
      tribulation: opts?.tribulation,
    });
    this.targets.push(mob);
  }

  private onMobDeath(mob: Mob): void {
    if (!this.hosting) return;
    const foot = mob.hitPoint();
    const pack = this.packs.find((p) => p.mob === mob);
    const isTrib = pack?.tribulation === true;
    if (!isTrib) {
      this.grantXp(MOB_XP[mob.kind], foot.x, foot.y, this.lastHit.get(mob));
      this.applyQuestEvent('kill', mob.kind);
      const drops = rollDrops(MOB_DROPS[mob.kind]);
      if (drops.length) this.dropLoot(foot.x, foot.y, drops);
    }
    if (pack) {
      if (isTrib) {
        pack.respawnAt = null;
        this.onTribulationKill();
      } else {
        pack.respawnAt = this.time.now + MOB_RESPAWN_MS;
      }
    }
  }

  private onMobStrike(strike: MobStrike): void {
    if (!this.hosting) return;
    const end = { x: strike.x + strike.aim.x * strike.reach, y: strike.y + strike.aim.y * strike.reach };
    for (const prey of this.preyList()) {
      if (!prey.alive || this.inShrineSafe(prey.position)) continue;
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
      pack.mob.tick(time, delta);
      if (!this.hosting || !pack.mob.alive || pack.mob.frozen) continue;
      pack.ai.update(time, delta, this.nearestPrey(pack.mob.hitPoint()));
      this.keepMobOutOfShrine(pack.mob);
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
    const windLord = this.zone.id === 'thanh-phong-coc';
    const boss = new Boss1(this, x, y, {
      onStrike: (strike) => this.onBossStrike(strike),
      onAct: (act, aim) => {
        this.telegraphBossAct(act, aim);
        if (this.hosting) peekSession()?.publishWorld({ kind: 'boss-act', act, ax: aim.x, ay: aim.y });
      },
      onDeath: () => {
        this.floatingNumber(x, y - 120, 0, 0xffd070, true, windLord ? 'PHONG MA HẠ' : 'HẠ GỤC');
        if (!this.hosting) return;
        this.applyQuestEvent('boss', windLord ? 'phong-ma-chu' : 'huyet-ma-coc-chu');
        this.grantXp(BOSS_XP, x, y - 40, this.boss ? this.lastHit.get(this.boss) : undefined);
        const drops = rollDrops(windLord ? WIND_BOSS_DROPS : BOSS_DROPS);
        if (drops.length) this.dropLoot(x, y, drops);
      },
    });
    if (windLord) {
      boss.setTint(0xa8e6ff);
      boss.setScale(boss.scaleX * 1.05, boss.scaleY * 1.05);
    }
    this.physics.add.collider(boss, this.props);
    this.boss = boss;
    this.bossAi = new EnemyAI(boss, this.bossProfile());
    this.targets.push(boss);
    if (this.player) {
      this.enemyColliders.push(this.physics.add.collider(this.player.sprite, boss));
    }
  }

  private telegraphBossAct(act: string, aim: Vector2Like): void {
    if (!this.boss) return;
    const foot = this.boss.hitPoint();
    if (act === 'nova') {
      this.bossFx.telegraph(foot.x, foot.y, BOSS1_ACTIONS.nova.radius * 0.92, 0xff8866);
    } else if (act === 'melee') {
      const reach = BOSS1_ACTIONS.melee.reach;
      this.bossFx.telegraph(
        foot.x + aim.x * reach * 0.55,
        foot.y + aim.y * reach * 0.55,
        BOSS1_ACTIONS.melee.radius * 1.6,
        0xffaa77,
      );
    }
  }

  private tickBoss(time: number, delta: number): void {
    if (!this.boss) return;
    this.boss.tick(time, delta);
    if (this.hosting) {
      this.bossAi?.update(time, delta, this.nearestPrey(this.boss.hitPoint()));
      this.keepMobOutOfShrine(this.boss);
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
            this.inflict(prey, strike.damage, strike.aim, true);
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
        this.inflict(prey, strike.damage, strike.aim, true);
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
      this.inflict(prey, strike.damage, strike.aim, true);
    }
  }

  private hurtPlayer(damage: number, aim: Vector2Like, heavy = false): void {
    if (!this.player.alive) return;
    if (this.player.invulnerable) {
      const spot = this.player.hitPoint();
      this.floatingNumber(spot.x, spot.y - 120, 0, 0x9fe8ff, false, 'HƯ ẢNH');
      return;
    }
    this.player.applyHit({ damage, aim, side: 'enemy' });
    const spot = this.player.hitPoint();
    this.floatingNumber(spot.x, spot.y - 120, damage, 0xff8b96, false);
    const hard = heavy || damage >= 16;
    this.cameras.main.shake(hard ? 180 : 120, hard ? 0.01 : 0.004);
  }

  /* -------------------------------------------------------- death / loot */

  private onDeath(): void {
    if (this.tribulation.phase === 'active') this.failTribulation('death');
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
    const ground = y + 10;
    const sprite = this.physics.add.sprite(x, ground, dropTexture(this, items[0]));
    // Anchored at the foot, so a tall sword and a small herb rest on the same
    // ground line and both sort against props by where they touch down.
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(ground);
    sprite.setImmovable(true);
    (sprite.body as Phaser.Physics.Arcade.Body | null)?.setSize(20, 12);
    // A drop in tall grass is easy to walk past, so it hovers.
    this.tweens.add({
      targets: sprite,
      y: ground - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.loot.push({ id: pileId, sprite, items, ground });
  }

  private destroyPile(pile: LootPile): void {
    this.tweens.killTweensOf(pile.sprite);
    pile.sprite.destroy();
  }

  private tickResources(time: number): void {
    for (const resource of this.resources) {
      if (resource.sprite.active || time < resource.readyAt) continue;
      resource.readyAt = 0;
      resource.sprite.setActive(true).setVisible(true).setAlpha(0);
      if (resource.kind === 'chest') {
        resource.shadow.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: resource.shadow, alpha: 0.38, duration: 320 });
      }
      this.tweens.add({ targets: resource.sprite, alpha: 1, duration: 320 });
    }
  }

  private nearestResource(): { resource: WorldResource; distance: number } | null {
    const foot = this.player.hitPoint();
    let best: { resource: WorldResource; distance: number } | null = null;
    for (const resource of this.resources) {
      if (!resource.sprite.active) continue;
      const distance = Phaser.Math.Distance.Between(
        foot.x,
        foot.y,
        resource.sprite.x,
        resource.sprite.y,
      );
      if (distance > RESOURCE_RADIUS) continue;
      if (!best || distance < best.distance) best = { resource, distance };
    }
    return best;
  }

  private gatherResource(resource: WorldResource): void {
    if (resource.kind === 'plant') {
      if (!this.bag.add(resource.def.kind)) {
        GameBus.emit(GameEvent.Notice, 'Túi đã đầy — chưa thể hái');
        return;
      }
      resource.readyAt = this.time.now + PLANT_RESPAWN_MS;
      resource.sprite.setActive(false).setVisible(false);
      GameBus.emit(GameEvent.Notice, `Đã hái · ${itemOf(resource.def.kind)?.name ?? resource.def.kind}`);
      this.applyQuestEvent('collect', resource.def.kind);
      this.emitInventory();
      void this.persist();
      return;
    }

    const reward = CHEST_REWARD[resource.def.tier];
    resource.readyAt = this.time.now + CHEST_RESPAWN_MS;
    resource.sprite.setActive(false).setVisible(false);
    resource.shadow.setVisible(false);
    this.dropLoot(resource.def.x, resource.def.y, [reward.stone]);
    this.grantXp(reward.xp, resource.def.x, resource.def.y);
    GameBus.emit(
      GameEvent.Notice,
      `Đã mở ${reward.label} · linh thạch rơi dưới đất (+${reward.xp} KN)`,
    );
  }

  private tickLootPrompt(): void {
    const near = this.nearestLoot();
    if (near) {
      GameBus.emit(GameEvent.LootPrompt, { label: `F · nhặt (${near.pile.items.length})` });
      return;
    }
    const farmPlot = this.nearestFarmPlot();
    if (farmPlot) {
      const plot = this.farm.plots.find((candidate) => candidate.id === farmPlot.def.id);
      const status = plot?.status ?? 'empty';
      const label =
        status === 'ready'
          ? 'F · thu hoạch'
          : status === 'growing' && plot && !plot.watered
            ? 'F · tưới nước'
            : status === 'growing'
              ? `F · đang lớn ${Math.round(plotGrowth(plot!, Date.now()) * 100)}%`
              : `F · gieo ${SEED_CATALOG[this.selectedFarmSeed]?.name ?? 'hạt'}`;
      GameBus.emit(GameEvent.LootPrompt, { label });
      return;
    }
    const resource = this.nearestResource();
    if (resource) {
      GameBus.emit(GameEvent.LootPrompt, {
        label:
          resource.resource.kind === 'plant'
            ? `F · hái ${itemOf(resource.resource.def.kind)?.name ?? 'linh dược'}`
            : `F · mở ${CHEST_REWARD[resource.resource.def.tier].label}`,
      });
      return;
    }
    const npc = this.nearestNpc();
    if (npc) {
      GameBus.emit(GameEvent.LootPrompt, {
        label: `F · ${npc.role === 'merchant' ? 'giao dịch' : 'đối thoại'} ${npc.name}`,
      });
      return;
    }
    if (this.nearStorage()) {
      GameBus.emit(GameEvent.LootPrompt, { label: 'F · mở rương trữ đồ' });
      return;
    }
    if (this.nearShrine()) {
      GameBus.emit(GameEvent.LootPrompt, {
        label: this.isBoundHere() ? 'Đã khóa điểm hồi sinh' : 'F · đặt điểm hồi sinh',
      });
      return;
    }
    if (this.nearWaypoint()) {
      if (!this.warps.has(this.zone.id)) this.discoverWarp(this.zone.id);
      GameBus.emit(GameEvent.LootPrompt, { label: 'F / T · mở dịch chuyển' });
      if (this.warpOpen) this.emitWarpState();
      return;
    }
    if (this.warpOpen && !this.nearWaypoint()) this.closeWarp();
    GameBus.emit(GameEvent.LootPrompt, { label: null });
  }

  private nearestLoot(): { pile: LootPile; distance: number } | null {
    const foot = this.player.hitPoint();
    let best: { pile: LootPile; distance: number } | null = null;
    for (const pile of this.loot) {
      if (!pile.sprite.active) continue;
      const distance = Phaser.Math.Distance.Between(foot.x, foot.y, pile.sprite.x, pile.ground);
      if (distance > LOOT_RADIUS) continue;
      if (!best || distance < best.distance) best = { pile, distance };
    }
    return best;
  }

  private pickLoot(): void {
    const near = this.nearestLoot();
    if (!near) {
      const farmPlot = this.nearestFarmPlot();
      if (farmPlot) {
        this.interactFarmPlot(farmPlot);
        return;
      }
      const resource = this.nearestResource();
      if (resource) {
        this.gatherResource(resource.resource);
        return;
      }
      const npc = this.nearestNpc();
      if (npc) {
        this.interactNpc(npc);
        return;
      }
      if (this.nearStorage()) {
        this.openStorage();
        return;
      }
      if (this.nearShrine()) this.bindSpawn();
      else if (this.nearWaypoint()) this.toggleWarp();
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
      const granted = grantLoot(this.bag, pile.items);
      for (const id of granted.added) {
        const item = itemOf(id);
        GameBus.emit(GameEvent.Notice, `${item?.name ?? id} vào túi`);
      }
      if (granted.leftover.length) {
        GameBus.emit(GameEvent.Notice, 'Túi đã đầy');
        pile.items = granted.leftover;
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
        y: pile.ground,
      });
    }
    this.destroyPile(pile);
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
      envArt: keyboard.addKey(K.G, false),
    };
    if (import.meta.env.DEV) {
      this.keys.hurt = keyboard.addKey(K.H, false);
      this.keys.respawn = keyboard.addKey(K.R, false);
      this.keys.boss = keyboard.addKey(K.B, false);
    }
  }

  private tickKeys(): void {
    if (isInputGated() || isUiTyping()) return;
    if (consumePad('menu')) GameBus.emit(GameEvent.MenuToggle);
    if (isSystemMenuOpen()) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.bag) || consumePad('bag')) {
      GameBus.emit(GameEvent.InventoryToggle);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.pick) || consumePad('pick')) this.pickLoot();
    if (Phaser.Input.Keyboard.JustDown(this.keys.warp) || consumePad('warp')) this.toggleWarp();
    if (Phaser.Input.Keyboard.JustDown(this.keys.envArt) || consumePad('envArt')) this.swapEnvArt();
    if (Phaser.Input.Keyboard.JustDown(this.keys.swap) || consumePad('swap')) this.trySwap();
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

  /**
   * Cycles the environment art without disturbing the run. Repaint and rebuild
   * must land in the same tick: the old textures are dropped the moment the kit
   * swaps, and the standing props still hold frames from them until `loadZone`
   * tears them down.
   */
  private swapEnvArt(): void {
    const wanted = nextEnvArt();
    const foot = this.player.hitPoint();
    repaintEnvironment(this, wanted);
    this.loadZone(this.zone.id, { x: foot.x, y: foot.y });
    if (envArt() !== wanted) {
      GameBus.emit(GameEvent.Notice, 'Thiếu sheet Mana Seed — chạy `npm run env:manaseed`');
      return;
    }
    const step = ENV_ART_ORDER.indexOf(wanted) + 1;
    GameBus.emit(GameEvent.Notice, `Môi trường ${step}/${ENV_ART_ORDER.length} · ${envKit().label}`);
  }

  private applyLobbyPick(): void {
    if (this.lobbyApplied || this.applyingAvatar) return;
    void this.applyChosenAvatar();
  }

  /**
   * Loads the avatar the lobby picked (or the live session profile): kit, level,
   * xp, inventory, and last position. Re-runs every time the player leaves and
   * re-enters so switching characters always brings the right save.
   */
  private async applyChosenAvatar(): Promise<void> {
    if (this.applyingAvatar) return;
    this.applyingAvatar = true;
    this.lobbyApplied = true;
    try {
      const id =
        this.pendingAvatar?.id ??
        peekSession()?.profile.id ??
        localStorage.getItem('tmnd.pid') ??
        this.avatarId;
      const character =
        (this.pendingAvatar?.character as PlayerId | undefined) ??
        peekSession()?.profile.character ??
        loadSavedJoin().character;

      this.avatarId = id;

      const index = ROSTER.indexOf(character as PlayerId);
      if (index >= 0) {
        this.playerIndex = index;
        if (this.player.profile.id !== character) {
          this.replacePlayer(character as PlayerId);
        }
      }

      await this.restoreAvatar();
    } finally {
      this.applyingAvatar = false;
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
      this.emitRpgPanels();
      return;
    }
    this.progress.restore({ level: saved.level, xp: saved.xp });
    this.bag = new Inventory(saved.inventory);
    const wanted = saved.character;
    this.attributes = saved.attributes
      ? createAttributeState(saved.attributes.availablePoints, saved.attributes.values)
      : createAttributeState((this.progress.level - 1) * 2);
    const expectedAttributePoints = (this.progress.level - 1) * 2;
    const accountedAttributes =
      this.attributes.availablePoints +
      Object.values(this.attributes.values).reduce((sum, value) => sum + value, 0);
    this.attributes.availablePoints += Math.max(0, expectedAttributePoints - accountedAttributes);
    this.skills = new SkillSystem(
      wanted as SkillClass,
      Math.max(0, this.progress.level - 1),
      saved.skills,
    );
    const restoredSkills = this.skills.snapshot();
    const accountedSkills =
      restoredSkills.availablePoints +
      Object.entries(restoredSkills.ranks).reduce(
        (sum, [id, rank]) => sum + rank * (SKILL_CATALOG[id]?.costPerRank ?? 1),
        0,
      );
    this.skills.grantPoints(Math.max(0, this.progress.level - 1 - accountedSkills));
    this.quests = new QuestSystem(saved.quests);
    this.farm = ensureFarmPlots(saved.farm ?? createFarmState(DEFAULT_FARM_PLOTS), DEFAULT_FARM_PLOTS);
    this.trackedQuests = saved.trackedQuests ?? [];
    const index = ROSTER.indexOf(wanted);
    if (index >= 0 && ROSTER[this.playerIndex] !== wanted) {
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
    this.emitRpgPanels();
  }

  private onHidden = (): void => {
    if (document.visibilityState === 'hidden') void this.persist(true);
  };

  private persist(keepalive = false, force = false): Promise<void> {
    if (!this.player) return Promise.resolve();
    // While the lobby owns the screen, skip autosave so picking another avatar
    // cannot write the previous run's level onto the newly selected id.
    // Also skip while a load is in flight (progress may still be the old run).
    if (!force && (isInputGated() || this.applyingAvatar)) return Promise.resolve();
    const foot = this.player.hitPoint();
    return saveAvatar(
      defaultAvatar({
        id: this.avatarId,
        name:
          this.pendingAvatar?.name ??
          peekSession()?.profile.name ??
          localStorage.getItem('tmnd.name') ??
          'Vô Danh',
        character: ROSTER[this.playerIndex],
        level: this.progress.level,
        xp: this.progress.xp,
        hp: this.player.stats.hp,
        spiritualPower: this.player.stats.spiritualPower,
        inventory: this.bag.snapshot(),
        attributes: this.attributes,
        skills: this.skills.snapshot(),
        quests: this.quests.snapshot(),
        farm: this.farm,
        trackedQuests: this.trackedQuests,
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

  private onHudInventory(payload: {
    action?: string;
    index?: number;
    slot?: EquipSlot;
    quantity?: number;
    kinds?: readonly string[];
  }): void {
    if (!payload?.action) return;
    if (payload.action === 'equip' && payload.index !== undefined) {
      const item = itemOf(this.bag.bag[payload.index]);
      if (item && this.progress.level < (item.requiredLevel ?? 1)) {
        GameBus.emit(GameEvent.Notice, `Cần Luyện Khí ${item.requiredLevel}`);
        return;
      }
      this.bag.equip(payload.index);
    }
    if (payload.action === 'unequip' && payload.slot) this.bag.unequip(payload.slot);
    if (payload.action === 'socket' && payload.slot && payload.index !== undefined) {
      const state = this.bag.sockets[payload.slot];
      const socketIndex = state?.gems.findIndex((gem) => !gem) ?? -1;
      if (socketIndex < 0 || !this.bag.socket(payload.slot, socketIndex, payload.index)) {
        GameBus.emit(GameEvent.Notice, 'Không thể khảm ngọc vào trang bị này');
        return;
      }
      GameBus.emit(GameEvent.Notice, 'Khảm ngọc thành công');
    }
    if (
      payload.action === 'unsocket' &&
      payload.slot &&
      typeof (payload as { socketIndex?: number }).socketIndex === 'number'
    ) {
      const socketIndex = (payload as { socketIndex: number }).socketIndex;
      if (!this.bag.unsocket(payload.slot, socketIndex)) {
        GameBus.emit(GameEvent.Notice, 'Túi đầy hoặc ô ngọc trống');
        return;
      }
    }
    if (payload.action === 'use' && payload.index !== undefined) {
      const chosen = itemOf(this.bag.bag[payload.index]);
      if (chosen?.cultivationXp && (this.progress.atCap || this.progress.atRealmCap)) {
        GameBus.emit(
          GameEvent.Notice,
          this.progress.atCap
            ? 'Đã đạt đỉnh cảnh giới — hãy bán linh thạch'
            : `Đã đạt đỉnh ${this.progress.title.replace(' · đỉnh', '')} — cần đột phá`,
        );
        return;
      }
      const used = this.bag.use(payload.index);
      const stats = this.player.stats;
      if (used?.restoreSp) {
        stats.spiritualPower = Math.min(
          stats.maxSpiritualPower,
          stats.spiritualPower + used.restoreSp,
        );
      }
      // Herbs are for a fight in progress, so a corpse does not get to eat one.
      if (used?.restoreHp && this.player.alive) {
        stats.hp = Math.min(stats.maxHp, stats.hp + used.restoreHp);
      }
      if (used?.restoreSp || used?.restoreHp) emitStats(stats);
      if (used?.cultivationXp) {
        const foot = this.player.hitPoint();
        this.grantXp(used.cultivationXp, foot.x, foot.y);
        GameBus.emit(GameEvent.Notice, `Đã luyện hóa ${used.name} · +${used.cultivationXp} KN`);
      }
    }
    if (payload.action === 'sell' && payload.index !== undefined) {
      void this.sellInventory(payload.index, payload.quantity);
      return;
    }
    if (payload.action === 'sell-all') {
      void this.sellAllSellable(payload.kinds);
      return;
    }
    this.applyGrowth(false);
    this.emitInventory();
    this.emitShop();
    void this.persist();
  }

  private async sellInventory(index: number, quantity?: number): Promise<void> {
    const chosen = itemOf(this.bag.bag[index]);
    if (!chosen?.sellValue) return;
    const have = this.bag.quantities[index] || 1;
    const amount = Math.min(have, Math.max(1, Math.floor(quantity ?? have)));
    if (currentAccessToken()) {
      try {
        const receipt = await sellServerItem(this.avatarId, chosen.id, amount);
        this.bag.sell(index, amount);
        this.bag.coins = receipt.coins;
      } catch (error) {
        GameBus.emit(
          GameEvent.Notice,
          error instanceof Error ? error.message : 'Không thể bán vật phẩm',
        );
        return;
      }
      GameBus.emit(
        GameEvent.Notice,
        `Đã bán ${chosen.name} ×${amount} · +${chosen.sellValue * amount} tiền đồng`,
      );
    } else {
      const sold = this.bag.sell(index, amount);
      if (!sold) return;
      GameBus.emit(
        GameEvent.Notice,
        `Đã bán ${sold.item.name} ×${sold.quantity} · +${sold.gained} tiền đồng`,
      );
    }
    this.applyGrowth(false);
    this.emitInventory();
    this.emitShop();
    await this.persist();
  }

  /** Sells every bag stack whose kind is allowed (default: consumable + material). */
  private async sellAllSellable(kinds?: readonly string[]): Promise<void> {
    const allow = new Set(kinds?.length ? kinds : ['consumable', 'material']);
    let gained = 0;
    let soldCount = 0;
    for (let index = this.bag.bag.length - 1; index >= 0; index -= 1) {
      const item = itemOf(this.bag.bag[index]);
      if (!item?.sellValue || !allow.has(item.kind)) continue;
      const amount = this.bag.quantities[index] || 1;
      if (currentAccessToken()) {
        try {
          const receipt = await sellServerItem(this.avatarId, item.id, amount);
          const sold = this.bag.sell(index, amount);
          this.bag.coins = receipt.coins;
          if (sold) {
            gained += sold.gained;
            soldCount += sold.quantity;
          }
        } catch (error) {
          GameBus.emit(
            GameEvent.Notice,
            error instanceof Error ? error.message : 'Không thể bán vật phẩm',
          );
          break;
        }
      } else {
        const sold = this.bag.sell(index, amount);
        if (!sold) continue;
        gained += sold.gained;
        soldCount += sold.quantity;
      }
    }
    if (soldCount <= 0) {
      GameBus.emit(GameEvent.Notice, 'Không có vật phẩm để bán');
      return;
    }
    GameBus.emit(GameEvent.Notice, `Đã bán ${soldCount} vật phẩm · +${gained} tiền đồng`);
    this.applyGrowth(false);
    this.emitInventory();
    this.emitShop();
    await this.persist();
  }

  private onCharacterBuild(payload: { action?: string; id?: string }): void {
    if (!payload?.action) return;
    if (payload.action === 'attribute' && payload.id) {
      const result = allocateAttribute(
        this.attributes,
        payload.id as import('../systems/Attributes').AttributeKey,
      );
      if (!result.ok) {
        GameBus.emit(GameEvent.Notice, 'Không đủ điểm chỉ số');
        return;
      }
      this.attributes = result.state;
    } else if (payload.action === 'skill' && payload.id) {
      const result = this.skills.spend(payload.id, this.progress.level);
      if (!result.ok) {
        GameBus.emit(GameEvent.Notice, 'Chưa đủ cấp, điểm hoặc kỹ năng tiên quyết');
        return;
      }
      this.syncCombatKit();
      const bind = result.node ? kitBindHint(result.node.id, this.skills.snapshot().classId) : null;
      if (bind) {
        GameBus.emit(GameEvent.Notice, `${result.node.name} · gắn phím ${bind}`);
        if (bind === 'U') {
          const foot = this.player.hitPoint();
          this.floatingNumber(foot.x, foot.y - 72, 0, 0xffe08a, true, result.node.name);
        }
      }
    } else if (payload.action === 'reset-attributes') {
      const cost = this.progress.level * 20;
      if (this.bag.coins < cost) {
        GameBus.emit(GameEvent.Notice, `Cần ${cost} tiền đồng để tẩy điểm`);
        return;
      }
      this.bag.coins -= cost;
      this.attributes = createAttributeState((this.progress.level - 1) * 2);
    } else if (payload.action === 'breakthrough') {
      if (this.tribulation.phase === 'active') {
        GameBus.emit(GameEvent.Notice, 'Đang trong Thiên Kiếp — hãy vượt qua trước');
        return;
      }
      if (this.time.now < this.tribulation.cooldownUntil) {
        const wait = Math.ceil((this.tribulation.cooldownUntil - this.time.now) / 1000);
        GameBus.emit(GameEvent.Notice, `Thiên Kiếp còn CD ${wait}s`);
        return;
      }
      const gate = canBreakThrough(this.progress, this.bag);
      if (!gate.ok) {
        const notice =
          gate.error === 'missing-materials'
            ? `Thiếu nguyên liệu: ${(gate.missing ?? []).map((row) => costLabel(row)).join(', ')}`
            : gate.error === 'not-at-peak'
              ? 'Cần đạt đỉnh cảnh giới hiện tại mới đột phá'
              : gate.error === 'absolute-cap'
                ? 'Đã đạt đỉnh Kết Đan'
                : 'Chưa có công pháp đột phá cho cảnh giới này';
        GameBus.emit(GameEvent.Notice, notice);
        this.emitRpgPanels();
        return;
      }
      this.beginTribulation();
      return;
    }
    this.applyGrowth(false);
    this.emitRpgPanels();
    this.emitInventory();
    void this.persist();
  }

  private onAlchemyCommand(payload: { id?: string }): void {
    if (!payload?.id) return;
    const result = craftAlchemy(this.bag, payload.id, this.progress.level);
    if (!result.ok) {
      const notice =
        result.error === 'level'
          ? 'Cảnh giới chưa đủ để luyện công thức này'
          : result.error === 'missing'
            ? `Thiếu: ${(result.missing ?? []).map((row) => alchemyCostLabel(row)).join(', ')}`
            : result.error === 'full'
              ? 'Túi đã đầy'
              : 'Không luyện được';
      GameBus.emit(GameEvent.Notice, notice);
      return;
    }
    GameBus.emit(GameEvent.Notice, `Luyện thành · ${result.recipe.name}`);
    this.applyQuestEvent('collect', result.recipe.outputId);
    this.emitInventory();
    this.emitProgress();
    void this.persist();
  }

  private beginTribulation(): void {
    const plan = planTribulation(this.progress.level);
    const foot = this.player.hitPoint();
    this.tribulation = {
      phase: 'active',
      endsAt: this.time.now + TRIBULATION_DURATION_MS,
      cooldownUntil: 0,
      remaining: plan.count,
      label: plan.label,
    };
    const baseIndex = 9000;
    for (let i = 0; i < plan.count; i += 1) {
      const kind = plan.mobKinds[i % plan.mobKinds.length]!;
      const angle = (Math.PI * 2 * i) / plan.count;
      const x = Phaser.Math.Clamp(foot.x + Math.cos(angle) * 140, 80, this.zone.width - 80);
      const y = Phaser.Math.Clamp(foot.y + Math.sin(angle) * 110, 80, this.zone.height - 80);
      this.spawnMob(kind, x, y, baseIndex + i, { tribulation: true, hpScale: 1.45 });
    }
    this.floatingNumber(foot.x, foot.y - 80, 0, 0xffe08a, true, 'THIÊN KIẾP');
    GameBus.emit(GameEvent.Notice, `${plan.label} · tiêu diệt sóng yêu trong 45s`);
    this.emitTribulationHud();
  }

  private onTribulationKill(): void {
    if (this.tribulation.phase !== 'active') return;
    this.tribulation = {
      ...this.tribulation,
      remaining: Math.max(0, this.tribulation.remaining - 1),
    };
    this.emitTribulationHud();
    if (this.tribulation.remaining <= 0) this.completeTribulation();
  }

  private completeTribulation(): void {
    this.clearTribulationMobs();
    const result = breakThrough(this.progress, this.bag);
    this.tribulation = idleTribulation();
    this.emitTribulationHud();
    if (!result.ok) {
      GameBus.emit(GameEvent.Notice, 'Vượt Thiên Kiếp nhưng đột phá thất bại (thiếu vật liệu?)');
      this.emitRpgPanels();
      return;
    }
    this.attributes = {
      ...this.attributes,
      availablePoints: this.attributes.availablePoints + 2,
    };
    this.skills.grantPoints(1);
    GameBus.emit(GameEvent.Notice, `Vượt Thiên Kiếp · ${titleForLevel(result.toLevel)}`);
    const foot = this.player.hitPoint();
    this.floatingNumber(foot.x, foot.y - 64, 0, 0xffd27a, true, titleForLevel(result.toLevel));
    this.applyGrowth(false);
    this.emitRpgPanels();
    this.emitInventory();
    void this.persist();
  }

  private failTribulation(reason: 'death' | 'timeout' | 'zone'): void {
    if (this.tribulation.phase !== 'active') return;
    this.clearTribulationMobs();
    this.tribulation = {
      phase: 'cooldown',
      endsAt: 0,
      cooldownUntil: this.time.now + TRIBULATION_FAIL_COOLDOWN_MS,
      remaining: 0,
      label: '',
    };
    this.emitTribulationHud();
    const tip =
      reason === 'death'
        ? 'Thiên Kiếp thất bại · nguyên liệu giữ lại'
        : reason === 'timeout'
          ? 'Hết giờ Thiên Kiếp · thử lại sau'
          : 'Rời vùng · Thiên Kiếp hủy';
    GameBus.emit(GameEvent.Notice, tip);
  }

  private clearTribulationMobs(): void {
    const keep: MobPack[] = [];
    for (const pack of this.packs) {
      if (!pack.tribulation) {
        keep.push(pack);
        continue;
      }
      this.targets = this.targets.filter((t) => t !== pack.mob);
      pack.mob.destroy();
    }
    this.packs = keep;
  }

  private tickTribulation(time: number, delta: number): void {
    if (this.tribulation.phase === 'cooldown' && time >= this.tribulation.cooldownUntil) {
      this.tribulation = idleTribulation();
      this.emitTribulationHud();
    }
    if (this.tribulation.phase !== 'active') return;
    if (time >= this.tribulation.endsAt) {
      this.failTribulation('timeout');
      return;
    }
    this.tribulationHudTimer += delta;
    if (this.tribulationHudTimer >= 250) {
      this.tribulationHudTimer = 0;
      this.emitTribulationHud();
    }
  }

  private emitTribulationHud(): void {
    const active = this.tribulation.phase === 'active';
    GameBus.emit(GameEvent.TribulationState, {
      active,
      label: this.tribulation.label,
      secondsLeft: active
        ? Math.max(0, Math.ceil((this.tribulation.endsAt - this.time.now) / 1000))
        : 0,
      remaining: this.tribulation.remaining,
    });
  }

  private async onQuestCommand(payload: { action?: string; id?: string }): Promise<void> {
    if (!payload?.id || !payload.action) return;
    if (payload.action === 'accept') {
      const result = this.quests.start(payload.id, this.progress.level);
      if (!result.ok) {
        GameBus.emit(GameEvent.Notice, 'Chưa đủ điều kiện nhận nhiệm vụ');
        return;
      }
      const reach = this.quests.creditReach(this.zone.id, this.progress.level);
      if (reach.ok && reach.changedQuestIds.length) {
        GameBus.emit(GameEvent.Notice, 'Tiến độ nhiệm vụ đã cập nhật');
      }
      if (this.zone.id === 'ngoai-mon' && payload.id === 'q01-nhap-mon') {
        this.applyQuestEvent('talk', 'truong-lao');
      }
    } else if (payload.action === 'complete') {
      const beforeClaim = this.quests.snapshot();
      const result = this.quests.claim(payload.id, this.progress.level);
      if (!result.ok || !result.reward) {
        GameBus.emit(GameEvent.Notice, 'Mục tiêu nhiệm vụ chưa hoàn thành');
        return;
      }
      let reward = result.reward;
      if (currentAccessToken()) {
        await this.persist();
        try {
          const receipt = await claimServerQuestReward(this.avatarId, payload.id);
          this.bag.coins = receipt.coins;
          reward = { xp: receipt.xp, coins: 0, items: receipt.items };
        } catch (error) {
          this.quests = new QuestSystem(beforeClaim);
          this.emitQuests();
          GameBus.emit(
            GameEvent.Notice,
            error instanceof Error ? error.message : 'Không nhận được thưởng nhiệm vụ',
          );
          return;
        }
      } else {
        this.bag.coins += reward.coins;
      }
      for (const [id, quantity] of Object.entries(reward.items ?? {})) {
        this.bag.add(id, quantity);
      }
      const foot = this.player.hitPoint();
      this.grantXp(reward.xp, foot.x, foot.y);
      GameBus.emit(GameEvent.Notice, `Hoàn thành nhiệm vụ · +${result.reward.coins} tiền đồng`);
    } else if (payload.action === 'track') {
      this.trackedQuests = [
        payload.id,
        ...this.trackedQuests.filter((id) => id !== payload.id),
      ].slice(0, 3);
    }
    this.emitRpgPanels();
    this.emitInventory();
    void this.persist();
  }

  private async onShopCommand(payload: { action?: string; id?: string }): Promise<void> {
    if (payload.action !== 'buy' || !payload.id) return;
    if (this.zone.id !== 'ngoai-mon') {
      GameBus.emit(GameEvent.Notice, 'Chỉ giao dịch tại hub Ngoại Môn');
      return;
    }
    const offer = SHOP_CATALOG.find(({ id }) => id === payload.id);
    if (!offer || this.progress.level < (offer.requiredLevel ?? 1)) {
      GameBus.emit(GameEvent.Notice, 'Vật phẩm chưa được mở bán');
      return;
    }
    if (this.bag.coins < offer.buyPrice) {
      GameBus.emit(GameEvent.Notice, 'Không đủ tiền đồng');
      return;
    }
    if (!this.bag.canAdd(offer.itemId)) {
      GameBus.emit(GameEvent.Notice, 'Túi đã đầy');
      return;
    }
    if (currentAccessToken()) {
      try {
        const receipt = await buyServerItem(this.avatarId, offer.itemId);
        this.bag.coins = receipt.coins;
      } catch (error) {
        GameBus.emit(
          GameEvent.Notice,
          error instanceof Error ? error.message : 'Không thể mua vật phẩm',
        );
        return;
      }
    } else {
      this.bag.coins -= offer.buyPrice;
    }
    if (!this.bag.add(offer.itemId)) return;
    this.applyQuestEvent('talk', 'duoc-su');
    GameBus.emit(GameEvent.Notice, `Đã mua ${offer.name}`);
    this.emitInventory();
    this.emitShop();
    await this.persist();
  }

  private onFarmSelectSeed(payload: { seedId?: string }): void {
    if (!payload.seedId || !SEED_CATALOG[payload.seedId]) return;
    this.selectedFarmSeed = payload.seedId;
    this.emitFarm();
  }

  private onFarmCommand(payload: { action?: string; plotId?: string; seedId?: string }): void {
    if (!payload.plotId || this.zone.id !== 'linh-dien') {
      GameBus.emit(GameEvent.Notice, 'Hãy đến Linh Điền để canh tác');
      return;
    }
    const now = Date.now();
    if (payload.action === 'plant' && payload.seedId) {
      const available = this.bag.count(payload.seedId);
      const result = plantSeed(this.farm, payload.plotId, payload.seedId, now, available);
      if (!result.ok || !this.bag.take(payload.seedId)) {
        GameBus.emit(GameEvent.Notice, 'Thiếu hạt giống hoặc ô đất đang bận');
        return;
      }
      this.farm = result.state;
      this.selectedFarmSeed = payload.seedId;
      GameBus.emit(GameEvent.Notice, 'Đã gieo — hãy tưới nước');
    } else if (payload.action === 'water') {
      const result = waterPlot(this.farm, payload.plotId, now);
      if (!result.ok) {
        GameBus.emit(
          GameEvent.Notice,
          result.error === 'already-watered' ? 'Ô này đã tưới' : 'Không thể tưới ô này',
        );
        return;
      }
      this.farm = result.state;
      GameBus.emit(GameEvent.Notice, 'Đã tưới — linh dược bắt đầu lớn');
    } else if (payload.action === 'harvest') {
      const result = harvestPlot(this.farm, payload.plotId, now);
      if (!result.ok) {
        GameBus.emit(
          GameEvent.Notice,
          result.error === 'needs-water' ? 'Cần tưới trước khi thu' : 'Linh dược chưa thể thu hoạch',
        );
        return;
      }
      const [itemId, quantity] = Object.entries(result.inventoryDelta)[0] ?? [];
      if (!itemId || !this.bag.add(itemId, quantity)) {
        GameBus.emit(GameEvent.Notice, 'Túi đã đầy');
        return;
      }
      this.farm = result.state;
      this.applyQuestEvent('collect', itemId, quantity);
      GameBus.emit(GameEvent.Notice, `Thu hoạch ${itemOf(itemId)?.name ?? itemId} ×${quantity}`);
    }
    this.refreshFarmPlots();
    this.emitInventory();
    this.emitFarm();
    void this.persist();
  }

  private tickFarm(_time: number): void {
    const next = growFarm(this.farm, Date.now());
    const statusChanged = next.plots.some(
      (plot, index) =>
        plot.status !== this.farm.plots[index]?.status ||
        plot.watered !== this.farm.plots[index]?.watered,
    );
    const stageChanged = this.farmPlots.some((node) => {
      const plot = next.plots.find((candidate) => candidate.id === node.def.id);
      if (!plot || plot.status !== 'growing' || !plot.seedId || !plot.watered) return false;
      const progress = plotGrowth(plot, Date.now());
      const stage = growthStage(progress, false);
      const kind = cropKindFromSeed(plot.seedId);
      if (!kind) return false;
      return node.crop.visible && node.crop.texture.key !== farmGrowTexture(kind, stage);
    });
    this.farm = next;
    if (statusChanged || stageChanged || this.zone.id === 'linh-dien') {
      this.refreshFarmPlots();
    }
    if (statusChanged || stageChanged) this.emitFarm();
  }

  private emitInventory(): void {
    GameBus.emit(GameEvent.Inventory, this.bag.snapshot());
  }

  private emitRpgPanels(): void {
    const skillState = this.skills.snapshot();
    GameBus.emit(GameEvent.CharacterBuild, {
      character: skillState.classId,
      level: this.progress.level,
      title: this.progress.title,
      attributePoints: this.attributes.availablePoints,
      skillPoints: skillState.availablePoints,
      attributes: { ...this.attributes.values },
      skills: Object.fromEntries(
        SKILL_TREES[skillState.classId].map((node) => [node.id, skillState.ranks[node.id] ?? 0]),
      ),
      breakthrough: this.breakthroughView(),
    });
    this.emitQuests();
    this.emitShop();
    this.emitFarm();
  }

  private breakthroughView() {
    const check = canBreakThrough(this.progress, this.bag);
    const recipe = recipeForLevel(this.progress.level);
    const costs = (recipe?.costs ?? []).map((cost) => ({
      id: cost.id,
      name: itemOf(cost.id)?.name ?? cost.id,
      need: cost.quantity,
      have: this.bag.count(cost.id),
      icon: itemOf(cost.id)?.icon,
    }));
    if (check.ok) {
      return {
        available: true,
        recipeName: recipe?.name ?? check.title,
        costs,
      };
    }
    const lockedReason =
      check.error === 'missing-materials'
        ? 'Chưa đủ nguyên liệu đột phá'
        : check.error === 'not-at-peak'
          ? 'Tu luyện đến đỉnh cảnh giới để mở đột phá'
          : check.error === 'absolute-cap'
            ? 'Đã đạt đỉnh Kết Đan'
            : 'Công pháp đột phá tiếp theo chưa mở';
    return {
      available: false,
      lockedReason,
      recipeName: recipe?.name,
      costs,
    };
  }

  private emitQuests(): void {
    const state = refreshQuestAvailability(this.quests.snapshot(), this.progress.level);
    const views = QUESTS.map((quest) => {
      const progress = state.quests[quest.id];
      const completed = quest.objectives.reduce(
        (sum, objective) => sum + Math.min(objective.required, progress.objectives[objective.id] ?? 0),
        0,
      );
      const required = quest.objectives.reduce((sum, objective) => sum + objective.required, 0);
      const status =
        progress.status === 'completed'
          ? 'ready'
          : progress.status === 'claimed'
            ? 'completed'
            : progress.status;
      return {
        id: quest.id,
        title: quest.name,
        summary: quest.objectives.map(({ description }) => description).join(' '),
        status,
        progress: `${completed}/${required}`,
        minLevel: quest.level,
        reward: `${quest.rewards.xp} KN · ${quest.rewards.coins} đồng`,
      };
    });
    GameBus.emit(GameEvent.QuestState, {
      quests: views,
      tracked: views.filter(({ id }) => this.trackedQuests.includes(id)),
    });
  }

  private emitShop(): void {
    GameBus.emit(GameEvent.ShopState, {
      merchant: 'Dược Sư Ngoại Môn',
      coins: this.bag.coins,
      offers: SHOP_CATALOG.map((offer) => ({
        id: offer.id,
        itemId: offer.itemId,
        name: offer.name,
        price: offer.buyPrice,
        minLevel: offer.requiredLevel ?? 1,
        available:
          this.zone.id === 'ngoai-mon' &&
          this.progress.level >= (offer.requiredLevel ?? 1),
      })),
    });
  }

  private emitFarm(): void {
    const now = Date.now();
    this.farm = growFarm(this.farm, now);
    GameBus.emit(GameEvent.FarmState, {
      available: this.zone.id === 'linh-dien',
      selectedSeed: this.selectedFarmSeed,
      seeds: Object.values(SEED_CATALOG).map((seed) => ({
        id: seed.id,
        name: seed.name,
        quantity: this.bag.count(seed.seedItemId),
      })),
      plots: this.farm.plots.map((plot) => ({
        id: plot.id,
        status: plot.status,
        watered: plot.watered,
        crop: plot.seedId ? SEED_CATALOG[plot.seedId]?.name ?? plot.seedId : '',
        progress: plotGrowth(plot, now),
      })),
    });
  }

  private applyQuestEvent(type: QuestEvent['type'], target: string, amount = 1): void {
    const result = this.quests.apply(
      {
        id: `${this.avatarId}:${type}:${target}:${Date.now()}:${this.rpgEventSeq++}`,
        type,
        target,
        amount,
      },
      this.progress.level,
    );
    if (result.ok && result.changedQuestIds.length) {
      GameBus.emit(GameEvent.Notice, 'Tiến độ nhiệm vụ đã cập nhật');
      this.emitQuests();
    }
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

  private tickMinimap(delta: number): void {
    this.minimapTimer += delta;
    if (this.minimapTimer < 200) return;
    this.minimapTimer = 0;
    if (!this.player) return;

    GameBus.emit(GameEvent.Minimap, {
      zoneId: this.zone.id,
      zoneName: this.zone.name,
      width: this.zone.width,
      height: this.zone.height,
      player: { x: this.player.sprite.x, y: this.player.footY() },
      shrine: { x: this.zone.shrine.x, y: this.zone.shrine.y, label: 'Trụ hồi sinh' },
      waypoint: {
        x: this.zone.waypoint.x,
        y: this.zone.waypoint.y,
        label: 'Trụ dịch chuyển',
      },
      portals: this.zone.portals.map((portal) => ({
        x: portal.x,
        y: portal.y,
        label: portal.label,
      })),
      boss: this.zone.boss
        ? {
            x: this.zone.boss.x,
            y: this.zone.boss.y,
            label: this.zone.id === 'thanh-phong-coc' ? 'Phong Ma' : 'Boss',
          }
        : this.zone.arena
          ? { x: this.zone.arena.x, y: this.zone.arena.y, label: this.zone.arena.label ?? 'Boss' }
          : null,
      peers: this.net
        ? this.net.prey().map((peer) => ({
            x: peer.position.x,
            y: peer.position.y,
          }))
        : [],
    });
  }

  private selfId(): string {
    return peekSession()?.id ?? this.avatarId;
  }

  /** Who is landing the hit being resolved — a replaying peer, otherwise us. */
  private actorId(): string {
    return this.net?.remoteActor() ?? this.selfId();
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
    let best: { position: Vector2Like; alive: boolean } | null = null;
    let bestD = 1e9;
    const consider = (position: Vector2Like, alive: boolean) => {
      if (!alive || this.inShrineSafe(position)) return;
      const d = Phaser.Math.Distance.Between(from.x, from.y, position.x, position.y);
      if (d < bestD) {
        best = { position, alive: true };
        bestD = d;
      }
    };
    consider(this.player.hitPoint(), this.player.alive);
    for (const prey of this.net.prey()) {
      consider(prey.position, prey.alive);
    }
    return best ?? { position: from, alive: false };
  }

  private inflict(
    prey: { id: string; self: boolean },
    damage: number,
    aim: Vector2Like,
    heavy = false,
  ): void {
    if (prey.self) {
      this.hurtPlayer(damage, aim, heavy);
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
    this.flushHits(delta);
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
            w: this.boss.bossState === 'walk' ? 1 : 0,
            f: this.boss.bossFacing,
          }
        : undefined,
      stones: this.stones.map((stone, i) => ({ i, hp: Math.max(0, Math.round(stone.hp)) })),
      loot: this.loot.map((pile) => ({
        id: pile.id,
        x: Math.round(pile.sprite.x),
        y: Math.round(pile.ground),
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
      this.boss.syncFromHost({
        x: snap.boss.x,
        y: snap.boss.y,
        hp: snap.boss.hp,
        alive: snap.boss.a === 1,
        walking: snap.boss.w === 1,
        facing: snap.boss.f,
      });
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
      this.destroyPile(pile);
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
    if (event.kind === 'hit') {
      if (!this.hosting) for (const row of event.rows) this.takeHit(row);
      return;
    }
    if (event.kind === 'boss-act') {
      if (!this.hosting) {
        this.telegraphBossAct(event.act, { x: event.ax, y: event.ay });
        this.boss?.replicateAct(event.act, { x: event.ax, y: event.ay });
      }
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
      if (foot && Phaser.Math.Distance.Between(foot.x, foot.y, pile.sprite.x, pile.ground) > LOOT_RADIUS + 24) {
        return;
      }
      this.giveLoot(pile, event.playerId);
    }
  }

  private onHostChanged(payload: { hostId?: string; host?: boolean }): void {
    const was = this.hosting;
    this.hosting = payload.host ?? this.net.hosting;
    if (this.hosting === was) return;
    if (this.hosting) this.takeOverSim();
    else this.hitEcho = [];
  }

  /** Freshly promoted: drop the old host's targets and drive the mobs ourselves. */
  private takeOverSim(): void {
    for (const pack of this.packs) pack.mob.releaseNet();
    this.boss?.releaseNet();
  }

  private onAvatarChosen(payload: AvatarChosenPayload): void {
    if (!payload?.id) return;
    this.pendingAvatar = payload;
    this.avatarId = payload.id;
    this.lobbyApplied = false;
    // Lobby is picking — wait until enter (ungate / NetSession) to load saves.
    if (!isInputGated()) void this.applyChosenAvatar();
  }

  private onNetSession(session: WorldSession | null): void {
    if (!session) {
      // Flush the run we just left (solo path may already be gated).
      void this.persist(false, true);
      this.hosting = true;
      this.lobbyApplied = false;
      return;
    }
    this.pendingAvatar = {
      id: session.profile.id,
      character: session.profile.character,
      name: session.profile.name,
    };
    this.avatarId = session.profile.id;
    session.followZone(this.zone.id);
    this.hosting = session.isHost;
    this.lobbyApplied = false;
    void this.applyChosenAvatar();
  }

  /* -------------------------------------------------------------- scenery */

  private addProp(art: PropArt, x: number, y: number): Phaser.Physics.Arcade.Sprite {
    const sprite = this.props.create(x, y, art.texture) as Phaser.Physics.Arcade.Sprite;
    sprite.setOrigin(0.5, art.originY).setDepth(y);
    const box = art.box;
    if (box) {
      const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(box.width, box.height);
      body.position.set(x - box.width / 2, y + box.offsetY);
      body.updateCenter();
    }
    return sprite;
  }

  /**
   * Ground clutter for kits that ship decals. Seeded off the zone id so the
   * layout is stable across repaints — otherwise comparing two magnifications
   * would also be comparing two different forests.
   */
  private scatterDecals(kit: EnvKit): void {
    const decals = kit.decals;
    if (decals.length === 0) return;

    const rng = new Phaser.Math.RandomDataGenerator([this.zone.id]);
    const total = decals.reduce((sum, d) => sum + d.weight, 0);
    const pick = () => {
      let roll = rng.frac() * total;
      for (const decal of decals) {
        roll -= decal.weight;
        if (roll <= 0) return decal;
      }
      return decals[decals.length - 1];
    };

    const clear = (x: number, y: number) => {
      const { shrine, arena, portals, farmBed } = this.zone;
      if (Phaser.Math.Distance.Between(x, y, shrine.x, shrine.y) < SHRINE_SAFE_RADIUS) return false;
      if (arena && Phaser.Math.Distance.Between(x, y, arena.x, arena.y) < arena.radius + 40) return false;
      if (!portals.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > 140)) return false;
      if (farmBed) {
        const pad = 40;
        if (
          x >= farmBed.x - pad &&
          x <= farmBed.x + farmBed.width + pad &&
          y >= farmBed.y - pad &&
          y <= farmBed.y + farmBed.height + pad
        ) {
          return false;
        }
      }
      const farmPath = this.zone.farmPath;
      if (farmPath) {
        const pad = 36;
        if (
          x >= farmPath.x - pad &&
          x <= farmPath.x + farmPath.width + pad &&
          y >= farmPath.y - 16 &&
          y <= farmPath.y + farmPath.height + 16
        ) {
          return false;
        }
      }
      return true;
    };

    const count = Math.round((this.zone.width * this.zone.height) / 26000);
    for (let i = 0; i < count; i++) {
      const x = Math.round(rng.between(40, this.zone.width - 40));
      const y = Math.round(rng.between(40, this.zone.height - 40));
      if (!clear(x, y)) continue;
      this.decals.push(this.add.image(x, y, pick().texture).setOrigin(0.5, 1).setDepth(y - 1));
    }
  }

  private stoneTarget(stone: TrainingStone): Damageable {
    return {
      get alive() {
        return stone.hp > 0;
      },
      hitPoint: () => this.stoneCentre(stone),
      hitRadius: () => 0,
      applyHit: (hit: HitInfo) =>
        this.damageStone(stone, hit, hit.tint ?? 0xffffff, hit.frost ?? 0, hit.knockback ?? 0, hit.aim),
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
    // Kit damage already scaled from tree ranks in syncCombatKit.
    switch (payload.name) {
      case BANG_PHACH_TRAM.name:
      case 'Hàn Băng Chưởng':
      case 'Thiên Lý Băng Phong':
        this.castQiSlash(payload);
        this.juiceHitStop(50);
        return;
      case BANG_TINH_TRAN.name:
      case 'Băng Liên':
        this.castIceArray(payload);
        this.juiceHitStop(60);
        return;
      case HUYET_DIEM_TRAM.name:
      case 'Huyết Trảm':
      case 'Ma Thần Giáng Thế':
        this.castMagmaSlash(payload);
        this.juiceHitStop(50);
        return;
      case TAM_THU_HONG.name:
      case 'Huyết Bạo':
        this.castRoar(payload);
        this.juiceHitStop(60);
        return;
      case TINH_MANG_TRAM.name:
      case 'Âm Nhận':
      case 'Vạn Âm Triều Tông':
        this.castStarSlash(payload);
        this.juiceHitStop(50);
        return;
      case TINH_KHONG_TRAN.name:
      case 'Thất Huyền Khúc':
        this.castStarArray(payload);
        this.juiceHitStop(60);
        return;
      default:
        this.spawnQiBurst(payload);
        this.resolveHit(payload, {
          damage: payload.damage,
          tint: 0x6fd8ff,
          sweep: 150,
          radius: HIT_RADIUS * (payload.name.includes('Vạn') || payload.name.includes('Phá') ? 1.35 : 1),
          frost: 0,
          knockback: 0,
        });
        this.juiceHitStop(45);
    }
  }

  private juiceHitStop(ms: number): void {
    if (!this.player?.alive) return;
    this.time.timeScale = 0.35;
    this.time.delayedCall(ms, () => {
      this.time.timeScale = 1;
    });
  }

  private castQiSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    const by = this.actorId();
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
          this.land(
            target,
            {
              damage: payload.damage,
              aim: payload.aim,
              frost: payload.frost ?? 0,
              knockback: 6,
              tint: 0x8fd4ff,
              side: 'player',
            },
            by,
          );
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
    const by = this.actorId();
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
          this.land(
            target,
            {
              damage: payload.damage,
              aim: payload.aim,
              frost: payload.frost ?? 0,
              knockback: 0,
              tint: 0x8fd4ff,
              side: 'player',
            },
            by,
          );
        }
      };
      if (wave === 0) sweep();
      else this.time.delayedCall(ICE_ARRAY_STAGGER * wave, sweep);
    }
  }

  private castMagmaSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    const by = this.actorId();
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
          this.land(
            target,
            {
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 8,
              tint: 0xff6a3a,
              side: 'player',
            },
            by,
          );
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
    const by = this.actorId();
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
          this.land(
            target,
            {
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 0,
              tint: 0xff4a28,
              side: 'player',
            },
            by,
          );
        }
      };
      if (wave === 0) sweep();
      else this.time.delayedCall(MAGMA_ARRAY_STAGGER * wave, sweep);
    }
  }

  private castStarSlash(payload: SkillPayload): void {
    const hitAlready = new Set<Damageable>();
    const by = this.actorId();
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
          if (Phaser.Math.Distance.Between(spot.x, spot.y, x, y) > MAGMA_SLASH_RADIUS + target.hitRadius()) {
            continue;
          }
          hitAlready.add(target);
          this.starFx.starBurst(spot.x, spot.y, 0.7);
          this.land(
            target,
            {
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 8,
              tint: 0xc9a0ff,
              side: 'player',
            },
            by,
          );
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
    const by = this.actorId();
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
          this.land(
            target,
            {
              damage: payload.damage,
              aim: payload.aim,
              frost: 0,
              knockback: 0,
              tint: 0xb48cff,
              side: 'player',
            },
            by,
          );
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
    for (const target of this.targets) {
      if (!target.alive) continue;
      const spot = target.hitPoint();
      const distance = options.sweep
        ? distanceToSegment(spot, origin, end)
        : Phaser.Math.Distance.Between(origin.x, origin.y, spot.x, spot.y);
      if (distance > options.radius + target.hitRadius()) continue;
      this.land(target, {
        damage: options.damage,
        aim: origin.aim,
        frost: options.frost,
        knockback: options.knockback,
        tint: options.tint,
        side: 'player',
      });
    }
  }

  /* ------------------------------------------------------------ authority */

  /**
   * Every player hit goes through here.
   *
   * The host owns the numbers and echoes them the same frame. A guest replays
   * the identical hit locally so its swing lands when it was thrown instead of
   * a round trip later, then takes the host's hp the moment the echo arrives —
   * a mispredicted bar is corrected within a frame or two, and only the host
   * ever decides that something died.
   */
  private land(target: Damageable, hit: HitInfo, actor?: string): void {
    if (!target.alive) return;
    // Sweeps and arrays land over several frames, long after the remote swing
    // that started them stopped being the current actor, so casts pass it in.
    const by = actor ?? this.actorId();
    const before = this.hpOf(target);
    if (this.hosting) this.lastHit.set(target, by);
    target.applyHit(this.hosting ? hit : { ...hit, predicted: true });

    const dealt = Math.round(before - this.hpOf(target));
    if (dealt <= 0) return;
    this.showDamage(target, dealt, hit.tint ?? 0xffffff, by);
    if (this.hosting) this.echoHit(target, dealt, by);
  }

  private hpOf(target: Damageable): number {
    if (target === this.boss) return this.boss?.stats.hp ?? 0;
    return target instanceof Mob ? target.hp : 0;
  }

  private echoHit(target: Damageable, dealt: number, by: string): void {
    if (!peekSession()) return;
    if (target === this.boss && this.boss) {
      this.hitEcho.push({ k: 'b', i: 0, d: dealt, hp: Math.round(this.boss.stats.hp), by });
      return;
    }
    const pack = this.packs.find((p) => p.mob === target);
    if (pack) {
      this.hitEcho.push({ k: 'm', i: pack.index, d: dealt, hp: Math.round(pack.mob.hp), by });
    }
  }

  /** Push landed damage out well ahead of the snapshot, batched to a fixed rate. */
  private flushHits(delta: number): void {
    this.hitTimer += delta;
    if (this.hitTimer < HIT_ECHO_MS) return;
    this.hitTimer = 0;
    if (!this.hitEcho.length) return;
    const rows = this.hitEcho;
    this.hitEcho = [];
    peekSession()?.publishWorld({ kind: 'hit', rows });
  }

  private takeHit(row: NetHitRow): void {
    const target = row.k === 'b' ? this.boss : this.packs.find((p) => p.index === row.i)?.mob;
    if (!target) return;
    // The thrower already drew its own number when it predicted the swing.
    if (row.by !== this.selfId()) this.showDamage(target, row.d, ALLY_DAMAGE_TINT, row.by);
    target.setNetHp(row.hp);
  }

  /** Your own damage burns, an ally's reads cool, so a shared kill stays legible. */
  private showDamage(target: Damageable, damage: number, tint: number, by: string): void {
    const spot = target.hitPoint();
    const mine = by === this.selfId();
    this.floatingNumber(
      spot.x + Phaser.Math.Between(-9, 9),
      spot.y - (target === this.boss ? 150 : 46),
      damage,
      mine ? tint : ALLY_DAMAGE_TINT,
      false,
    );
  }

  private damageStone(
    stone: TrainingStone,
    hit: HitInfo,
    tint: number,
    frost: number,
    knockback: number,
    aim: Vector2Like,
  ): void {
    const now = this.time.now;
    const wasFrozen = stone.frost.frozen(now);
    const damage = stone.frost.amplify(hit.damage, now);
    stone.hp = Math.max(hit.predicted ? 1 : 0, stone.hp - damage);
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
    GameBus.off(GameEvent.CharacterBuildCommand, this.onCharacterBuild, this);
    GameBus.off(GameEvent.QuestCommand, this.onQuestCommand, this);
    GameBus.off(GameEvent.ShopCommand, this.onShopCommand, this);
    GameBus.off(GameEvent.FarmCommand, this.onFarmCommand, this);
    GameBus.off(GameEvent.FarmSelectSeed, this.onFarmSelectSeed, this);
    GameBus.off(GameEvent.StorageCommand, this.onStorageCommand, this);
    GameBus.off(GameEvent.WarpCommand, this.onWarpCommand, this);
    GameBus.off(GameEvent.AlchemyCommand, this.onAlchemyCommand, this);
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
