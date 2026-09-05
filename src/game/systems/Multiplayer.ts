import Phaser from 'phaser';
import { GameBus, GameEvent } from '../events';
import type { AttackPayload, DashPayload, SkillPayload } from '../events';
import { RemoteAvatar } from '../entities/RemoteAvatar';
import type { PlayerHandle } from '../entities/playerHandle';
import type { WorldSession } from '../../net/WorldSession';
import type { NetAction, NetCharacter, NetPose, PeerInfo, RosterPayload } from '../../net/types';
import type { Vector2Like } from '../types';
import { PEER_TIMEOUT_MS } from '../../net/types';
import { peekSession } from '../../net/bind';
import { currentZone } from '../worldState';

export interface MultiplayerHost {
  onRemoteAttack(payload: AttackPayload): void;
  onRemoteSkill(payload: SkillPayload): void;
  onRemoteDash(payload: DashPayload, sprite: Phaser.GameObjects.Sprite): void;
}

/**
 * Owns every replica in the scene and the publish loop for the local player.
 * The scene stays in charge of combat; this only moves pictures and forwards
 * the actions other people already resolved on their own machine.
 */
export class Multiplayer {
  private session: WorldSession | null = null;
  private readonly remotes = new Map<string, RemoteAvatar>();
  private readonly names = new Map<string, string>();
  private readonly heard = new Map<string, number>();
  private incomingId: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: MultiplayerHost,
  ) {
    GameBus.on(GameEvent.NetSession, this.onSession, this);
    GameBus.on(GameEvent.NetPose, this.onPose, this);
    GameBus.on(GameEvent.NetAction, this.onAction, this);
    GameBus.on(GameEvent.NetRoster, this.onRoster, this);
    GameBus.on(GameEvent.Attack, this.forwardAttack, this);
    GameBus.on(GameEvent.Skill, this.forwardSkill, this);
    GameBus.on(GameEvent.Dash, this.forwardDash, this);

    const existing = peekSession();
    if (existing) this.onSession(existing);
  }

  get connected(): boolean {
    return this.session !== null;
  }

  get hosting(): boolean {
    return !this.session || this.session.isHost;
  }

  /** Who is currently resolving a swing — remote id while replaying, else local. */
  actorId(): string {
    return this.incomingId ?? this.session?.id ?? 'local';
  }

  footOf(id: string): Vector2Like | null {
    const remote = this.remotes.get(id);
    return remote ? remote.foot() : null;
  }

  prey(): Array<{ id: string; position: Vector2Like; radius: number; alive: boolean }> {
    const out: Array<{ id: string; position: Vector2Like; radius: number; alive: boolean }> = [];
    for (const remote of this.remotes.values()) {
      out.push({
        id: remote.id,
        position: remote.foot(),
        radius: 16,
        alive: remote.hp > 0,
      });
    }
    return out;
  }

  characterId(): NetCharacter | null {
    return this.session?.profile.character ?? null;
  }

  tick(time: number, delta: number, player: PlayerHandle): void {
    const session = this.session;
    if (session) {
      const snap = player.snapshot();
      session.follow(snap.x, snap.y);
      session.publishPose(snap, time);
    }

    for (const remote of this.remotes.values()) remote.update(delta);

    const cutoff = performance.now() - PEER_TIMEOUT_MS;
    for (const [id, at] of this.heard) {
      if (at >= cutoff) continue;
      this.heard.delete(id);
      this.drop(id);
    }
  }

  destroy(): void {
    GameBus.off(GameEvent.NetSession, this.onSession, this);
    GameBus.off(GameEvent.NetPose, this.onPose, this);
    GameBus.off(GameEvent.NetAction, this.onAction, this);
    GameBus.off(GameEvent.NetRoster, this.onRoster, this);
    GameBus.off(GameEvent.Attack, this.forwardAttack, this);
    GameBus.off(GameEvent.Skill, this.forwardSkill, this);
    GameBus.off(GameEvent.Dash, this.forwardDash, this);
    for (const remote of this.remotes.values()) remote.destroy();
    this.remotes.clear();
  }

  /* -------------------------------------------------------------- session */

  private onSession(session: WorldSession | null): void {
    this.session = session;
    if (!session) {
      for (const remote of this.remotes.values()) remote.destroy();
      this.remotes.clear();
      this.names.clear();
      this.heard.clear();
    }
  }

  private onRoster(roster: RosterPayload): void {
    const live = new Set<string>();
    for (const peer of roster.nearby) {
      live.add(peer.id);
      this.names.set(peer.id, peer.name);
      this.remotes.get(peer.id)?.rename(peer.name);
      this.ensure(peer);
    }
    const now = performance.now();
    for (const id of [...this.remotes.keys()]) {
      if (live.has(id)) continue;
      const at = this.heard.get(id) ?? 0;
      if (now - at < PEER_TIMEOUT_MS) continue;
      this.drop(id);
    }
  }

  private onPose(pose: NetPose): void {
    if (pose.zone && pose.zone !== currentZone()) {
      return;
    }
    this.heard.set(pose.id, performance.now());
    if (pose.name) this.names.set(pose.id, pose.name);
    const remote = this.remotes.get(pose.id) ?? this.spawn(pose);
    if (pose.name) remote.rename(pose.name);
    remote.applyPose(pose);
  }

  private onAction(action: NetAction): void {
    this.heard.set(action.id, performance.now());
    this.remotes.get(action.id)?.playAction(action);
    this.incomingId = action.id;
    this.runRemote(() => {
      if (action.kind === 'attack' && action.attack) this.host.onRemoteAttack(action.attack);
      if (action.kind === 'skill' && action.skill) this.host.onRemoteSkill(action.skill);
      if (action.kind === 'dash' && action.dash) {
        const sprite = this.remotes.get(action.id)?.spriteRef;
        if (sprite) this.host.onRemoteDash(action.dash, sprite);
      }
    });
    this.incomingId = null;
  }

  /* ------------------------------------------------------------- forward */

  private forwarding = false;

  private forwardAttack(payload: AttackPayload): void {
    if (this.forwarding) return;
    this.session?.publishAction({ kind: 'attack', attack: payload });
  }

  private forwardSkill(payload: SkillPayload): void {
    if (this.forwarding) return;
    this.session?.publishAction({ kind: 'skill', skill: payload });
  }

  private forwardDash(payload: DashPayload): void {
    if (this.forwarding) return;
    this.session?.publishAction({ kind: 'dash', dash: payload });
  }

  /** Replay a remote hit without echoing it back out onto the wire. */
  runRemote<T>(fn: () => T): T {
    this.forwarding = true;
    try {
      return fn();
    } finally {
      this.forwarding = false;
    }
  }

  /* -------------------------------------------------------------- replicas */

  private ensure(peer: PeerInfo): void {
    if (this.remotes.has(peer.id)) return;
    this.spawn({
      id: peer.id,
      t: 0,
      x: peer.x,
      y: peer.y,
      facing: 'down',
      ax: 0,
      ay: 1,
      state: 'idle',
      character: peer.character,
      hp: 100,
    });
  }

  private spawn(pose: NetPose): RemoteAvatar {
    const remote = new RemoteAvatar(this.scene, pose, this.names.get(pose.id) ?? 'Vô Danh');
    this.remotes.set(pose.id, remote);
    return remote;
  }

  private drop(id: string): void {
    this.remotes.get(id)?.destroy();
    this.remotes.delete(id);
    this.names.delete(id);
  }
}
