import Phaser from 'phaser';
import type { CharacterState, CharacterStats, Direction, Vector2Like } from './types';

/** Bridge between the Phaser world and the React HUD. */
export const GameBus = new Phaser.Events.EventEmitter();

export const GameEvent = {
  StatsChanged: 'stats-changed',
  StateChanged: 'state-changed',
  Attack: 'player-attack',
  Skill: 'player-skill',
  SkillRejected: 'player-skill-rejected',
  Hurt: 'player-hurt',
  Death: 'player-death',
  /** One step of a melee chain connected (Như Yên's Hàn Băng Tam Thức). */
  Combo: 'player-combo',
  /** Chain state changed — fires on advance and on lapse, for the HUD pips. */
  ComboChanged: 'player-combo-changed',
  /** Sương Ảnh Bộ started; the scene draws the afterimages. */
  Dash: 'player-dash',
  /** Which character the scene handed the controls to. */
  CharacterChanged: 'character-changed',
  /** A WorldSession was attached or dropped. */
  NetSession: 'net-session',
  /** Nearby players changed. */
  NetRoster: 'net-roster',
  /** Another player's pose arrived. */
  NetPose: 'net-pose',
  /** Another player's attack / skill / dash arrived. */
  NetAction: 'net-action',
  /** Shared PvE event (snapshot, hurt, loot, reward). */
  NetWorld: 'net-world',
  /** Zone host changed. */
  NetHost: 'net-host',
  /** Seconds left on the death respawn clock. `null` means alive. */
  DeathCountdown: 'death-countdown',
  /** Skill cooldown ratios for the HUD pips, 0 = ready. */
  Cooldowns: 'skill-cooldowns',
  /** Cultivation rank / XP changed. */
  Progression: 'progression-changed',
  /** Bag or equipment changed. */
  Inventory: 'inventory-changed',
  /** HUD asked to wear / take off / use an item. */
  InventoryCommand: 'inventory-command',
  /** Inventory panel should open or close. */
  InventoryToggle: 'inventory-toggle',
  /** Character build (attributes, skills and sockets) changed. */
  CharacterBuild: 'character-build-changed',
  /** HUD asked to allocate an attribute or unlock a skill. */
  CharacterBuildCommand: 'character-build-command',
  /** Character development panel should open or close. */
  CharacterPanelToggle: 'character-panel-toggle',
  /** Quest journal and tracked objectives changed. */
  QuestState: 'quest-state-changed',
  /** HUD asked to accept, complete or track a quest. */
  QuestCommand: 'quest-command',
  /** Quest journal should open or close. */
  QuestToggle: 'quest-toggle',
  /** Merchant inventory and availability changed. */
  ShopState: 'shop-state-changed',
  /** HUD asked to buy an offer or sell an inventory slot. */
  ShopCommand: 'shop-command',
  /** Merchant panel should open or close. */
  ShopToggle: 'shop-toggle',
  /** Personal cultivation plots changed. */
  FarmState: 'farm-state-changed',
  /** HUD asked to plant or harvest a personal plot. */
  FarmCommand: 'farm-command',
  /** Farming panel should open or close. */
  FarmToggle: 'farm-toggle',
  /** Seed selected in the Linh Điền panel (used for world-plot planting). */
  FarmSelectSeed: 'farm-select-seed',
  /** Personal shrine warehouse panel. */
  StorageToggle: 'storage-toggle',
  /** Deposit / withdraw between bag and warehouse. */
  StorageCommand: 'storage-command',
  /** Alchemy cauldron panel. */
  AlchemyToggle: 'alchemy-toggle',
  /** Craft one alchemy recipe. */
  AlchemyCommand: 'alchemy-command',
  /** Tribulation HUD countdown. */
  TribulationState: 'tribulation-state',
  /** Pause / system menu (Esc or gamepad Start). */
  MenuToggle: 'menu-toggle',
  /** Standing on a loot pile — HUD can prompt F. */
  LootPrompt: 'loot-prompt',
  /** Entered a named zone. */
  ZoneChanged: 'zone-changed',
  /** A toast the HUD should show (shrine-only swap, full bag, …). */
  Notice: 'game-notice',
  /** Cloud save just finished. */
  Persist: 'persist-status',
  /** Lobby selected an owned avatar before (or instead of) joining a room. */
  AvatarChosen: 'avatar-chosen',
  /** Visited warp list + whether the picker is open. */
  WarpState: 'warp-state',
  /** HUD asked to open, close, or travel. */
  WarpCommand: 'warp-command',
  /** Player / peers / landmarks for the HUD minimap. */
  Minimap: 'minimap-update',
} as const;

export interface WarpStatePayload {
  open: boolean;
  current: string;
  unlocked: readonly string[];
}

export interface WarpCommandPayload {
  action: 'toggle' | 'close' | 'travel';
  zone?: string;
}

export interface AvatarChosenPayload {
  id: string;
  character: string;
  name: string;
}

export interface PersistPayload {
  remote: boolean;
  error?: string;
}

export interface TribulationHudPayload {
  active: boolean;
  label: string;
  secondsLeft: number;
  remaining: number;
}

export interface StatsPayload {
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
}

export interface AttackPayload {
  damage: number;
  /** Nearest drawn facing — what the sprite is playing. */
  direction: Direction;
  /**
   * Where the hit is actually aimed, as a unit vector. Eight-way for a keyboard,
   * so a diagonal press lands diagonally even though `direction` had to round to
   * one of the four facings the art provides. Ranges, projectile travel and
   * effect rotation all read this, never `direction`.
   */
  aim: Vector2Like;
  /** Origin of the hit, on the ground plane. */
  x: number;
  y: number;
}

export interface SkillPayload extends AttackPayload {
  name: string;
  cost: number;
  /** Frost stacks the skill applies; absent for characters without Frost. */
  frost?: number;
}

export interface StatePayload {
  state: CharacterState;
  facing: Direction;
}

/** One connected step of a melee chain. */
export interface ComboPayload extends AttackPayload {
  /** 0-based step in the chain. */
  step: number;
  /** Total steps, so the HUD does not need to know the chain's shape. */
  of: number;
  /** True on the finisher. */
  final: boolean;
  /** Frost stacks this step applies. */
  frost: number;
  reach: number;
  /** Radius of this step's hit — the later forms sweep wider. */
  radius: number;
  knockback: number;
}

/** Chain progress for the HUD: how many pips are lit right now. */
export interface ComboStatePayload {
  /** Step the next press would play; 0 means the chain is closed. */
  pending: number;
  of: number;
}

export interface DashPayload {
  direction: Direction;
  /** Unit vector the lunge actually travels along; eight-way. */
  aim: Vector2Like;
  x: number;
  y: number;
  distance: number;
  duration: number;
}

export interface CharacterChangedPayload {
  /** Stable id, e.g. `lamuyen` / `nhuyen`. */
  id: string;
  /** Display name for the HUD. */
  name: string;
  /** Sect / school, shown under the name. */
  sect: string;
  /** Skill names in slot order, for the skill bar. */
  skills: readonly string[];
  /**
   * Length of the character's melee chain, 0 if they have none.
   *
   * Part of the character's identity rather than something the HUD learns from
   * the first ComboChanged: an entity announces its chain while being built,
   * which is necessarily before the scene can announce the entity, so a HUD that
   * sized its pips from ComboChanged would have them wiped by the swap that
   * followed.
   */
  comboSteps: number;
}

export interface DeathCountdownPayload {
  /** Whole seconds remaining; 0 means the revive is happening. */
  seconds: number | null;
}

export interface CooldownPayload {
  /** 0 = ready, 1 = just used. Same order as the character's skill bar. */
  skills: readonly number[];
}

export interface ProgressionPayload {
  level: number;
  xp: number;
  need: number;
  title: string;
}

export interface BreakthroughCostView {
  id: string;
  name: string;
  need: number;
  have: number;
  icon?: string;
}

export interface BreakthroughView {
  available: boolean;
  lockedReason?: string;
  recipeName?: string;
  costs: readonly BreakthroughCostView[];
}

export interface CharacterBuildPayload {
  character: string;
  level: number;
  title: string;
  attributePoints: number;
  skillPoints: number;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  breakthrough: BreakthroughView;
}

export interface QuestView {
  id: string;
  title: string;
  summary: string;
  status: 'available' | 'active' | 'ready' | 'completed' | 'locked';
  progress: string;
  minLevel: number;
  reward: string;
}

export interface QuestStatePayload {
  quests: readonly QuestView[];
  tracked: readonly QuestView[];
}

export interface ShopOfferView {
  id: string;
  itemId: string;
  name: string;
  price: number;
  minLevel: number;
  available: boolean;
}

export interface ShopStatePayload {
  merchant: string;
  coins: number;
  offers: readonly ShopOfferView[];
}

export interface FarmPlotView {
  id: string;
  status: 'empty' | 'growing' | 'ready';
  watered: boolean;
  crop: string;
  progress: number;
}

export interface FarmStatePayload {
  available: boolean;
  selectedSeed: string;
  seeds: ReadonlyArray<{ id: string; name: string; quantity: number }>;
  plots: readonly FarmPlotView[];
}

export interface StorageCommandPayload {
  action: 'deposit' | 'withdraw';
  index: number;
  quantity?: number;
}

export interface ZonePayload {
  id: string;
  name: string;
}

export interface MinimapMark {
  x: number;
  y: number;
  label?: string;
}

export interface MinimapPayload {
  zoneId: string;
  zoneName: string;
  width: number;
  height: number;
  player: MinimapMark;
  shrine: MinimapMark;
  waypoint: MinimapMark;
  portals: readonly MinimapMark[];
  boss: MinimapMark | null;
  peers: readonly MinimapMark[];
}

export interface LootPromptPayload {
  label: string | null;
}

export function emitStats(stats: CharacterStats): void {
  const payload: StatsPayload = {
    hp: stats.hp,
    maxHp: stats.maxHp,
    sp: stats.spiritualPower,
    maxSp: stats.maxSpiritualPower,
  };
  GameBus.emit(GameEvent.StatsChanged, payload);
}
