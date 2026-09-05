import type { RealtimeChannel } from '@supabase/supabase-js';
import { GameBus, GameEvent } from '../game/events';
import { getSupabase } from './supabase';
import {
  cellKey,
  cellOf,
  channelName,
  neighbourhood,
  sameCell,
  type Cell,
} from './spatial';
import type {
  NetAction,
  NetPose,
  PeerInfo,
  PlayerNetState,
  RosterPayload,
  SessionProfile,
  WorldNetEvent,
} from './types';
import { parseNetCharacter, POSE_INTERVAL_MS } from './types';

interface CellSub {
  cell: Cell;
  channel: RealtimeChannel;
  ready: boolean;
}

/**
 * One player's live connection to a world.
 *
 * Presence lives per cell (who is nearby). Broadcast carries poses at 12 Hz
 * and one-shot actions. Rooms, occupancy and zone snapshots live in Supabase.
 */
export class WorldSession {
  readonly profile: SessionProfile;

  private readonly cells = new Map<string, CellSub>();
  private home: Cell | null = null;
  private lastPoseAt = 0;
  private lastPose: NetPose | null = null;
  private lastPresenceAt = 0;
  private readonly peers = new Map<string, PeerInfo>();
  private alive = true;
  private zoneId: string | null = null;
  private zoneChannel: RealtimeChannel | null = null;
  private zoneReady = false;
  private hostId: string | null = null;
  private lastActAt = new Map<string, number>();
  private readonly seen = new Map<string, { peer: PeerInfo; at: number }>();

  private constructor(profile: SessionProfile) {
    this.profile = profile;
  }

  static async connect(profile: SessionProfile): Promise<WorldSession> {
    const session = new WorldSession(profile);
    session.emitRoster();
    return session;
  }

  get id(): string {
    return this.profile.id;
  }

  get world(): string {
    return this.profile.world;
  }

  get isHost(): boolean {
    return !this.hostId || this.hostId === this.id;
  }

  get hostPlayerId(): string | null {
    return this.hostId;
  }

  /**
   * Keep the 3×3 subscription centred on the local feet. Cheap when the
   * player stays in one cell; only the three cells that fall off / slide in
   * are touched on a crossing.
   */
  follow(x: number, y: number): void {
    if (!this.alive) return;
    const next = cellOf(x, y);
    if (this.home && sameCell(this.home, next)) return;
    this.home = next;
    this.syncCells(neighbourhood(next));
  }

  publishPose(state: PlayerNetState, now: number): void {
    if (!this.alive || !this.home) return;
    if (now - this.lastPoseAt < POSE_INTERVAL_MS) return;

    const pose: NetPose = {
      id: this.id,
      t: now,
      name: this.profile.name,
      x: Math.round(state.x),
      y: Math.round(state.y),
      facing: state.facing,
      ax: roundAim(state.aim.x),
      ay: roundAim(state.aim.y),
      state: state.state,
      character: state.character,
      hp: state.hp,
      atk: state.state === 'attack' ? state.atk : undefined,
      zone: state.zone,
    };

    this.lastPoseAt = now;
    this.lastPose = pose;
    this.send('pose', pose);
    this.maybeRefreshPresence(state, now);
  }

  publishAction(action: Omit<NetAction, 'id' | 't'>): void {
    if (!this.alive) return;
    this.send('act', { ...action, id: this.id, t: performance.now() } satisfies NetAction);
  }

  publishWorld(event: WorldNetEvent): void {
    if (!this.alive) return;
    if (this.zoneReady && this.zoneChannel) {
      void this.zoneChannel.send({ type: 'broadcast', event: 'world', payload: event });
    }
    const home = this.homeSub();
    if (home?.ready) {
      void home.channel.send({ type: 'broadcast', event: 'world', payload: event });
    }
  }

  /**
   * One Realtime topic per zone: everyone in the khu hears poses, swings,
   * and the host's PvE snapshot. Spatial cells stay for neighbourhood presence.
   */
  followZone(zone: string): void {
    if (!this.alive) return;
    if (this.lastPose) this.lastPose = { ...this.lastPose, zone };
    if (this.zoneId === zone && this.zoneChannel) {
      this.refreshPresenceNow();
      return;
    }
    this.dropZone();
    this.zoneId = zone;
    this.openZone(zone);
  }

  setCharacter(character: SessionProfile['character']): void {
    this.profile.character = character;
    this.refreshPresenceNow();
  }

  disconnect(): void {
    if (!this.alive) return;
    this.alive = false;
    this.dropZone();
    for (const sub of this.cells.values()) {
      void getSupabase().removeChannel(sub.channel);
    }
    this.cells.clear();
    this.peers.clear();
    this.emitRoster();
  }

  /* -------------------------------------------------------------- cells */

  private syncCells(wanted: Cell[]): void {
    const keep = new Set(wanted.map(cellKey));

    for (const [key, sub] of this.cells) {
      if (keep.has(key)) continue;
      void getSupabase().removeChannel(sub.channel);
      this.cells.delete(key);
    }

    for (const cell of wanted) {
      const key = cellKey(cell);
      if (this.cells.has(key)) continue;
      this.cells.set(key, this.openCell(cell));
    }

    this.refreshPresenceNow();
  }

  private openCell(cell: Cell): CellSub {
    const sub: CellSub = { cell, channel: null as unknown as RealtimeChannel, ready: false };
    const channel = getSupabase().channel(channelName(this.world, cell), {
      config: {
        presence: { key: this.id },
        broadcast: { self: false, ack: false },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => this.rebuildPeers())
      .on('presence', { event: 'join' }, () => this.rebuildPeers())
      .on('presence', { event: 'leave' }, () => this.rebuildPeers())
      .on('broadcast', { event: 'pose' }, ({ payload }) => this.onPose(payload as NetPose))
      .on('broadcast', { event: 'act' }, ({ payload }) => this.onAction(payload as NetAction))
      .on('broadcast', { event: 'world' }, ({ payload }) => this.onWorld(payload as WorldNetEvent));

    channel.subscribe((status) => {
      if (!this.alive) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        sub.ready = false;
        window.setTimeout(() => {
          if (this.alive && this.cells.get(cellKey(cell)) === sub) {
            channel.subscribe();
          }
        }, 800);
        return;
      }
      if (status !== 'SUBSCRIBED') return;
      sub.ready = true;
      if (this.home && sameCell(this.home, cell)) {
        void channel.track(this.presenceBody());
      }
    });

    sub.channel = channel;
    return sub;
  }

  private homeSub(): CellSub | undefined {
    if (!this.home) return undefined;
    return this.cells.get(cellKey(this.home));
  }

  private send(event: 'pose' | 'act', payload: NetPose | NetAction): void {
    if (this.zoneReady && this.zoneChannel) {
      void this.zoneChannel.send({ type: 'broadcast', event, payload });
    }
    const home = this.homeSub();
    if (home?.ready) {
      void home.channel.send({ type: 'broadcast', event, payload });
    }
  }

  private openZone(zone: string): void {
    const channel = getSupabase().channel(`tmnd-${this.world}-z-${zone}`, {
      config: {
        presence: { key: this.id },
        broadcast: { self: false, ack: false },
      },
    });
    this.zoneChannel = channel;
    this.zoneReady = false;

    channel
      .on('presence', { event: 'sync' }, () => {
        this.electHost();
        this.rebuildPeers();
      })
      .on('presence', { event: 'join' }, () => {
        this.electHost();
        this.rebuildPeers();
      })
      .on('presence', { event: 'leave' }, () => {
        this.electHost();
        this.rebuildPeers();
      })
      .on('broadcast', { event: 'pose' }, ({ payload }) => this.onPose(payload as NetPose))
      .on('broadcast', { event: 'act' }, ({ payload }) => this.onAction(payload as NetAction))
      .on('broadcast', { event: 'world' }, ({ payload }) => this.onWorld(payload as WorldNetEvent));

    channel.subscribe((status) => {
      if (!this.alive || this.zoneChannel !== channel) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.zoneReady = false;
        window.setTimeout(() => {
          if (this.alive && this.zoneChannel === channel) channel.subscribe();
        }, 800);
        return;
      }
      if (status !== 'SUBSCRIBED') return;
      this.zoneReady = true;
      void channel.track(this.presenceBody());
      this.rebuildPeers();
      if (this.lastPose?.zone === zone) this.send('pose', this.lastPose);
    });
  }

  private dropZone(): void {
    if (this.zoneChannel) {
      void getSupabase().removeChannel(this.zoneChannel);
    }
    this.zoneChannel = null;
    this.zoneReady = false;
    this.zoneId = null;
    this.hostId = null;
  }

  private electHost(): void {
    const ids = new Set<string>([this.id]);
    for (const id of this.peers.keys()) ids.add(id);
    if (this.zoneChannel) {
      for (const key of Object.keys(this.zoneChannel.presenceState())) {
        if (key) ids.add(key);
      }
    }
    const next = [...ids].sort()[0] ?? this.id;
    if (next === this.hostId) return;
    this.hostId = next;
    GameBus.emit(GameEvent.NetHost, { hostId: next, host: next === this.id });
    this.emitRoster();
  }

  private onWorld(event: WorldNetEvent): void {
    if (!event?.kind) return;
    GameBus.emit(GameEvent.NetWorld, event);
  }

  /* ----------------------------------------------------------- presence */

  private presenceBody(): Record<string, unknown> {
    const pose = this.lastPose;
    return {
      id: this.id,
      name: this.profile.name,
      character: this.profile.character,
      x: pose?.x ?? 0,
      y: pose?.y ?? 0,
      zone: this.zoneId ?? pose?.zone,
    };
  }

  private maybeRefreshPresence(state: PlayerNetState, now: number): void {
    if (now - this.lastPresenceAt < 2000) return;
    this.lastPresenceAt = now;
    const home = this.homeSub();
    if (!home?.ready) return;
    void home.channel.track({
      id: this.id,
      name: this.profile.name,
      character: state.character,
      x: Math.round(state.x),
      y: Math.round(state.y),
      zone: state.zone ?? this.zoneId,
    });
    if (this.zoneReady && this.zoneChannel) {
      void this.zoneChannel.track(this.presenceBody());
    }
  }

  private refreshPresenceNow(): void {
    this.lastPresenceAt = 0;
    const body = this.presenceBody();
    const home = this.homeSub();
    if (home?.ready) void home.channel.track(body);
    if (this.zoneReady && this.zoneChannel) void this.zoneChannel.track(body);
  }

  private rebuildPeers(): void {
    const next = new Map<string, PeerInfo>();
    const ingest = (state: Record<string, unknown[]>) => {
      for (const metas of Object.values(state)) {
        for (const raw of metas as Array<Record<string, unknown>>) {
          const id = String(raw.id ?? '');
          if (!id || id === this.id) continue;
          next.set(id, {
            id,
            name: String(raw.name ?? 'Vô Danh'),
            character: parseNetCharacter(raw.character),
            x: Number(raw.x) || 0,
            y: Number(raw.y) || 0,
          });
        }
      }
    };
    for (const sub of this.cells.values()) ingest(sub.channel.presenceState());
    if (this.zoneChannel) ingest(this.zoneChannel.presenceState());

    const cutoff = performance.now() - 4000;
    for (const [id, seen] of this.seen) {
      if (seen.at < cutoff) {
        this.seen.delete(id);
        continue;
      }
      if (!next.has(id)) next.set(id, seen.peer);
    }

    const changed = !samePeerSet(this.peers, next);
    this.peers.clear();
    for (const [id, peer] of next) this.peers.set(id, peer);
    this.electHost();
    if (changed) this.emitRoster();
  }

  private emitRoster(): void {
    const payload: RosterPayload = {
      world: this.profile.roomName || this.world,
      selfName: this.profile.name,
      nearby: [...this.peers.values()],
      host: this.hostId ? this.hostId === this.id : undefined,
    };
    GameBus.emit(GameEvent.NetRoster, payload);
  }

  /* ---------------------------------------------------------- inbound */

  private onPose(pose: NetPose): void {
    if (!pose?.id || pose.id === this.id) return;
    const peer: PeerInfo = this.peers.get(pose.id) ?? {
      id: pose.id,
      name: pose.name || 'Vô Danh',
      character: pose.character,
      x: pose.x,
      y: pose.y,
    };
    peer.x = pose.x;
    peer.y = pose.y;
    peer.character = pose.character;
    if (pose.name) peer.name = pose.name;
    const fresh = !this.peers.has(pose.id);
    this.peers.set(pose.id, peer);
    this.seen.set(pose.id, { peer, at: performance.now() });
    if (fresh) {
      this.electHost();
      this.emitRoster();
    }
    GameBus.emit(GameEvent.NetPose, pose);
  }

  private onAction(action: NetAction): void {
    if (!action?.id || action.id === this.id) return;
    const stamp = action.t ?? 0;
    if (stamp && this.lastActAt.get(action.id) === stamp) return;
    if (stamp) this.lastActAt.set(action.id, stamp);
    GameBus.emit(GameEvent.NetAction, action);
  }
}

function roundAim(n: number): number {
  return Math.round(n * 100) / 100;
}

function samePeerSet(a: Map<string, PeerInfo>, b: Map<string, PeerInfo>): boolean {
  if (a.size !== b.size) return false;
  for (const id of b.keys()) {
    if (!a.has(id)) return false;
  }
  return true;
}
