import type { CharacterState, Direction, Vector2Like } from '../game/types';
import type { AttackPayload, DashPayload, SkillPayload } from '../game/events';

export const NET_CHARACTERS = ['nhuyen', 'lamuyen', 'huyetlang', 'miku'] as const;
export type NetCharacter = (typeof NET_CHARACTERS)[number];

export const CHARACTER_NAME: Record<NetCharacter, string> = {
  nhuyen: 'Như Yên',
  lamuyen: 'Lâm Uyên',
  huyetlang: 'Huyết Lang',
  miku: 'Miku',
};

export function parseNetCharacter(raw: unknown): NetCharacter {
  const value = String(raw);
  return (NET_CHARACTERS as readonly string[]).includes(value) ? (value as NetCharacter) : 'nhuyen';
}

/** Default shared world. Anyone who joins this name stands on the same map. */
export const DEFAULT_WORLD = 'thien-menh';

/** How often a pose is published. Interpolation covers the gaps. */
export const POSE_HZ = 15;
export const POSE_INTERVAL_MS = 1000 / POSE_HZ;

/**
 * How long a replica waits before drawing the latest pose — hides jitter so
 * other people glide instead of teleporting on every packet.
 */
export const INTERP_DELAY_MS = 80;

/** Drop a peer that has gone silent this long, even if Presence missed the leave. */
export const PEER_TIMEOUT_MS = 4000;

export interface SessionProfile {
  id: string;
  name: string;
  character: NetCharacter;
  world: string;
  roomName?: string;
}

export interface NetPose {
  id: string;
  t: number;
  name?: string;
  x: number;
  y: number;
  facing: Direction;
  ax: number;
  ay: number;
  state: CharacterState;
  character: NetCharacter;
  hp: number;
  /** 0-based combo step, only meaningful while `state === 'attack'`. */
  atk?: number;
  zone?: string;
}

export type NetActionKind = 'attack' | 'skill' | 'dash';

export interface NetAction {
  id: string;
  kind: NetActionKind;
  /** Publisher clock, used to drop a cell+zone duplicate of the same swing. */
  t?: number;
  attack?: AttackPayload;
  skill?: SkillPayload;
  dash?: DashPayload;
}

/** Host snapshot of the shared PvE layer in one zone. */
export interface WorldSnap {
  zone: string;
  host: string;
  t: number;
  mobs: Array<{ i: number; x: number; y: number; hp: number; a: 0 | 1 }>;
  boss?: { x: number; y: number; hp: number; a: 0 | 1; w?: 0 | 1; f?: Direction };
  stones: Array<{ i: number; hp: number }>;
  loot: Array<{ id: string; x: number; y: number; items: string[] }>;
}

/**
 * One resolved hit on the shared PvE layer.
 *
 * The snapshot alone would make an ally's damage arrive up to a full snapshot
 * late, so the host echoes every landed hit on the frame it lands and lets the
 * snapshot go back to being a slow correction.
 */
export interface NetHitRow {
  /** `m` mob (by spawn index), `b` boss. */
  k: 'm' | 'b';
  i: number;
  /** Damage the host actually subtracted. */
  d: number;
  /** Authoritative hp left, so a guest that mispredicted snaps back. */
  hp: number;
  /** Who landed it — the thrower already drew its own number. */
  by: string;
}

export type WorldNetEvent =
  | { kind: 'snap'; snap: WorldSnap }
  | { kind: 'hit'; rows: NetHitRow[] }
  | { kind: 'boss-act'; act: 'melee' | 'bolt' | 'nova'; ax: number; ay: number }
  | { kind: 'hurt'; playerId: string; damage: number; ax: number; ay: number }
  | { kind: 'reward'; playerId: string; xp?: number; items?: string[]; x: number; y: number }
  | { kind: 'loot-take'; pileId: string; playerId: string };

export const WORLD_SNAP_MS = 100;

/**
 * Window a replica takes to glide onto the host's position. Longer than the
 * snapshot gap so a dropped packet stretches the glide instead of stalling it.
 */
export const SNAP_LERP_MS = 140;

/** Past this gap the host is somewhere else entirely: cut, do not glide. */
export const SNAP_TELEPORT_PX = 180;

/**
 * Longest a landed hit waits before the host echoes it. Well under a snapshot
 * so damage still reads as instant, but capped: a four-player pile-on lands
 * something on most frames and one message per frame would blow the budget.
 */
export const HIT_ECHO_MS = 50;

export interface PeerInfo {
  id: string;
  name: string;
  character: NetCharacter;
  x: number;
  y: number;
}

export interface RosterPayload {
  world: string;
  selfName: string;
  nearby: readonly PeerInfo[];
  /** Who simulates the zone's mobs. Absent when playing solo. */
  host?: boolean;
}

export interface PlayerNetState {
  character: NetCharacter;
  x: number;
  y: number;
  facing: Direction;
  aim: Vector2Like;
  state: CharacterState;
  hp: number;
  atk?: number;
  zone?: string;
}

/** Turns a typed name into a channel-safe world slug. */
export function slugifyWorld(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || DEFAULT_WORLD;
}

export function clampPlayerName(input: string): string {
  const name = input.replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || 'Vô Danh';
}
