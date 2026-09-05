import { GameBus, GameEvent } from '../game/events';
import { WorldSession } from './WorldSession';
import { enterRoom, leaveRoom } from './rooms';
import { newPlayerId } from './supabase';
import { clampPlayerName, parseNetCharacter, slugifyWorld, type NetCharacter, type SessionProfile } from './types';

let current: WorldSession | null = null;
let inputGated = true;
let beat: number | null = null;

/** True while the join overlay owns the keyboard. */
export function isInputGated(): boolean {
  return inputGated;
}

export function setInputGated(value: boolean): void {
  inputGated = value;
}

export function peekSession(): WorldSession | null {
  return current;
}

export async function joinWorld(input: {
  name: string;
  character: NetCharacter;
  world: string;
  roomName?: string;
  avatarId?: string;
}): Promise<WorldSession> {
  await leaveWorld();

  const id = input.avatarId || newPlayerId();
  localStorage.setItem('tmnd.pid', id);

  const profile: SessionProfile = {
    id,
    name: clampPlayerName(input.name),
    character: input.character,
    world: slugifyWorld(input.world),
    roomName: input.roomName?.trim() || undefined,
  };

  await enterRoom({
    roomId: profile.world,
    playerId: profile.id,
    name: profile.name,
    character: profile.character,
  });

  const session = await WorldSession.connect(profile);
  current = session;
  persistJoin(input);
  startBeat(session);
  inputGated = false;
  GameBus.emit(GameEvent.NetSession, session);
  return session;
}

export async function leaveWorld(): Promise<void> {
  stopBeat();
  if (!current) return;
  const { world, id } = current.profile;
  current.disconnect();
  current = null;
  await leaveRoom(world, id);
  GameBus.emit(GameEvent.NetSession, null);
  GameBus.emit(GameEvent.NetRoster, { world: '', selfName: '', nearby: [] });
}

export function flushLeave(): void {
  stopBeat();
  if (!current) return;
  const { world, id } = current.profile;
  current.disconnect();
  current = null;
  void leaveRoom(world, id, true);
}

export function loadSavedJoin(): {
  name: string;
  character: NetCharacter;
  world: string;
  roomName: string;
} {
  return {
    name: localStorage.getItem('tmnd.name') ?? '',
    character: parseNetCharacter(localStorage.getItem('tmnd.character')),
    world: localStorage.getItem('tmnd.world') ?? 'thien-menh',
    roomName: localStorage.getItem('tmnd.roomName') ?? 'Thiên Mệnh',
  };
}

function persistJoin(input: { name: string; character: NetCharacter; world: string; roomName?: string }): void {
  localStorage.setItem('tmnd.name', clampPlayerName(input.name));
  localStorage.setItem('tmnd.character', input.character);
  localStorage.setItem('tmnd.world', slugifyWorld(input.world));
  if (input.roomName) localStorage.setItem('tmnd.roomName', input.roomName);
}

export function rememberJoin(input: { name: string; character: NetCharacter; world: string; roomName?: string }): void {
  persistJoin(input);
}

function startBeat(session: WorldSession): void {
  stopBeat();
  beat = window.setInterval(() => {
    void enterRoom({
      roomId: session.world,
      playerId: session.id,
      name: session.profile.name,
      character: session.profile.character,
    });
  }, 8000);
}

function stopBeat(): void {
  if (beat == null) return;
  window.clearInterval(beat);
  beat = null;
}
