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
} as const;

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

export function emitStats(stats: CharacterStats): void {
  const payload: StatsPayload = {
    hp: stats.hp,
    maxHp: stats.maxHp,
    sp: stats.spiritualPower,
    maxSp: stats.maxSpiritualPower,
  };
  GameBus.emit(GameEvent.StatsChanged, payload);
}
