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
export const POSE_HZ = 12;
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
  boss?: { x: number; y: number; hp: number; a: 0 | 1 };
  stones: Array<{ i: number; hp: number }>;
  loot: Array<{ id: string; x: number; y: number; items: string[] }>;
}

export type WorldNetEvent =
  | { kind: 'snap'; snap: WorldSnap }
  | { kind: 'hurt'; playerId: string; damage: number; ax: number; ay: number }
  | { kind: 'reward'; playerId: string; xp?: number; items?: string[]; x: number; y: number }
  | { kind: 'loot-take'; pileId: string; playerId: string };

export const WORLD_SNAP_MS = 160;

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
