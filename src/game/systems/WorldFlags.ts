/**
 * What the world remembers about a run, past where the player is standing.
 *
 * The save already carried everything about the *character* — level, bag,
 * quests, farm, the zone and the spot in it. What it carried nothing about was
 * the world: a chest opened stayed open until the respawn timer, and then was
 * shut again on the next load; a boss put down was standing again; and a
 * trigger declared `repeat: 'once'` was only once per map load, because there
 * was nowhere to write "this has happened" that outlived the session.
 *
 * Kept apart from `QuestState` on purpose. A quest is a thing the player is
 * *doing* and has its own lifecycle — offered, active, completed, claimed —
 * while these are facts about the world that never un-happen. Folding them in
 * would mean a chest could be un-opened by a quest reset.
 *
 * Pure and Phaser-free, so the migration below can be tested without a
 * browser. Nothing here reaches a store; `avatarStore` owns the writing.
 */

/**
 * Bumped whenever a shape below changes in a way an old save cannot be read
 * as. `migrateWorldState` is the only reader, and it is written to accept
 * every version that has ever shipped — a save is the one file format whose
 * old versions are in other people's hands.
 */
export const WORLD_STATE_VERSION = 1;

export interface WorldState {
  version: number;
  /**
   * Chest ids already looted, and when.
   *
   * The timestamp is what makes a chest respawn survive a reload: the world
   * used to hold the deadline in a live field on the sprite, so quitting reset
   * it. A chest with no entry has never been opened.
   */
  openedChests: Record<string, number>;
  /** Boss ids put down, and when. Same reasoning as the chests. */
  defeatedBosses: Record<string, number>;
  /**
   * Everything else, as named booleans.
   *
   * Deliberately a bag rather than fields. A flag is set by content — a
   * trigger fired, a cutscene watched, a gate opened — and content should not
   * need a schema change and a migration to remember one bit. The cost is that
   * a typo in a flag name is silently a different flag, which is why the ones
   * the game itself sets are built by the helpers below rather than spelled
   * out at each site.
   */
  flags: Record<string, boolean>;
  /** Zones the player has stood in, for a world map and for fog of war. */
  visitedZones: string[];
}

export function createWorldState(): WorldState {
  return {
    version: WORLD_STATE_VERSION,
    openedChests: {},
    defeatedBosses: {},
    flags: {},
    visitedZones: [],
  };
}

/**
 * Reads whatever is in a save into the current shape.
 *
 * Tolerant by design: a missing blob is a fresh world (every save written
 * before this existed), and an unknown *newer* version is read as best it can
 * be rather than discarded — a player who opened the game on a newer build and
 * came back should lose the fields that build added, not their whole world.
 */
export function migrateWorldState(raw: unknown): WorldState {
  const fresh = createWorldState();
  if (!raw || typeof raw !== 'object') return fresh;
  const from = raw as Partial<WorldState> & Record<string, unknown>;

  const stamps = (value: unknown): Record<string, number> => {
    if (!value || typeof value !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [key, at] of Object.entries(value as Record<string, unknown>)) {
      // `true` is accepted so a future shape that only records *whether* still
      // reads; it becomes "happened, time unknown".
      if (at === true) out[key] = 0;
      else if (typeof at === 'number' && Number.isFinite(at)) out[key] = at;
    }
    return out;
  };

  return {
    version: WORLD_STATE_VERSION,
    openedChests: stamps(from.openedChests),
    defeatedBosses: stamps(from.defeatedBosses),
    // Only `true` survives. A flag means "this happened", and absence already
    // covers the other case — so a stored `false` is dead weight that would
    // ride along in the save forever. `setFlag(…, false)` deletes for the same
    // reason; the two used to disagree, which is how this got noticed.
    flags: Object.fromEntries(
      Object.entries((from.flags as Record<string, unknown>) ?? {})
        .filter(([, on]) => on === true)
        .map(([key]) => [key, true as const]),
    ),
    visitedZones: Array.isArray(from.visitedZones)
      ? [...new Set(from.visitedZones.filter((z): z is string => typeof z === 'string'))]
      : [],
  };
}

/* ------------------------------------------------------------------ chests */

/** Stable id for a chest, which the zone data identifies only by position. */
export function chestId(zone: string, x: number, y: number): string {
  return `${zone}:${Math.round(x)},${Math.round(y)}`;
}

/**
 * True while a looted chest is still on its respawn clock.
 *
 * `respawnMs` is passed in rather than stored, so retuning the timer applies
 * to chests already in a save instead of only to new ones.
 */
export function chestIsSpent(state: WorldState, id: string, now: number, respawnMs: number): boolean {
  const at = state.openedChests[id];
  if (at === undefined) return false;
  // A stamp of 0 means "opened, time unknown" — treated as long ago, so it is
  // available rather than locked shut forever.
  if (at === 0) return false;
  return now - at < respawnMs;
}

export function markChestOpened(state: WorldState, id: string, now: number): void {
  state.openedChests[id] = now;
}

/* ------------------------------------------------------------------ bosses */

export function bossIsDown(state: WorldState, id: string, now: number, respawnMs: number): boolean {
  const at = state.defeatedBosses[id];
  if (at === undefined || at === 0) return false;
  return now - at < respawnMs;
}

export function markBossDefeated(state: WorldState, id: string, now: number): void {
  state.defeatedBosses[id] = now;
}

/* ------------------------------------------------------------------- flags */

/**
 * The name a trigger's one-shot is remembered under.
 *
 * Scoped by zone so two maps may both have a `first-crossing` without sharing
 * it, and prefixed so a trigger can never collide with a flag set by anything
 * else.
 */
export function triggerFlag(zone: string, triggerId: string): string {
  return `trigger:${zone}:${triggerId}`;
}

export function flagSet(state: WorldState, name: string): boolean {
  return state.flags[name] === true;
}

export function setFlag(state: WorldState, name: string, on = true): void {
  if (on) state.flags[name] = true;
  else delete state.flags[name];
}

/* ------------------------------------------------------------------- zones */

/** Records a visit; returns true the first time only. */
export function markVisited(state: WorldState, zone: string): boolean {
  if (state.visitedZones.includes(zone)) return false;
  state.visitedZones.push(zone);
  return true;
}

/**
 * Keeps the later of two worlds, field by field.
 *
 * Needed because the save has two homes. The remote row is the authority on the
 * character, and a device that has been offline can hold world facts the row
 * has never seen; picking one record wholesale — which is what the avatar store
 * does, by `updatedAt` — would throw the other's away. Chests and bosses take
 * the *later* stamp, flags and visits are unions, because none of them ever
 * un-happen.
 */
export function mergeWorldState(a: WorldState, b: WorldState): WorldState {
  const latest = (x: Record<string, number>, y: Record<string, number>) => {
    const out: Record<string, number> = { ...x };
    for (const [key, at] of Object.entries(y)) {
      out[key] = Math.max(out[key] ?? 0, at);
    }
    return out;
  };
  return {
    version: WORLD_STATE_VERSION,
    openedChests: latest(a.openedChests, b.openedChests),
    defeatedBosses: latest(a.defeatedBosses, b.defeatedBosses),
    flags: { ...a.flags, ...b.flags },
    visitedZones: [...new Set([...a.visitedZones, ...b.visitedZones])],
  };
}
