import { describe, expect, it } from 'vitest';
import {
  WORLD_STATE_VERSION,
  bossIsDown,
  chestId,
  chestIsSpent,
  createWorldState,
  flagSet,
  markBossDefeated,
  markChestOpened,
  markVisited,
  mergeWorldState,
  migrateWorldState,
  setFlag,
  triggerFlag,
} from './WorldFlags';

/**
 * A save is the one format whose old versions are in other people's hands, so
 * the reader is tested against every shape that could reach it — including the
 * shapes that are simply wrong, because a corrupt blob must read as a fresh
 * world and never as a crash on load.
 */

describe('migrateWorldState', () => {
  it('reads a missing or unusable blob as a fresh world', () => {
    for (const raw of [undefined, null, 0, '', 'nonsense', [], true]) {
      expect(migrateWorldState(raw)).toEqual(createWorldState());
    }
  });

  it('keeps what a real save holds', () => {
    const saved = {
      version: 1,
      openedChests: { 'ngoai-mon:100,200': 1_700_000_000_000 },
      defeatedBosses: { 'huyet-ma-coc:boss': 1_700_000_001_000 },
      flags: { 'trigger:rung-ngoai-mon:deep-wood': true },
      visitedZones: ['ngoai-mon', 'rung-ngoai-mon'],
    };
    expect(migrateWorldState(saved)).toEqual({ ...saved, version: WORLD_STATE_VERSION });
  });

  it('drops entries of the wrong type instead of carrying them through', () => {
    const state = migrateWorldState({
      openedChests: { good: 123, bad: 'hôm qua', alsoBad: null },
      flags: { real: true, off: false, notABool: 'yes' },
      visitedZones: ['a', 42, 'a', null],
    });
    expect(state.openedChests).toEqual({ good: 123 });
    // Only `true` survives. A flag means "this happened" and absence covers
    // the other case, so a stored `false` would be dead weight riding along in
    // every future save — which is also why `setFlag(…, false)` deletes.
    expect(state.flags).toEqual({ real: true });
    expect(state.visitedZones).toEqual(['a']);
  });

  it('reads `true` as "happened, time unknown"', () => {
    // A shape that only recorded *whether* still loads; the chest is available
    // rather than locked shut for good.
    const state = migrateWorldState({ openedChests: { old: true } });
    expect(state.openedChests.old).toBe(0);
    expect(chestIsSpent(state, 'old', Date.now(), 90_000)).toBe(false);
  });

  it('reads a newer save as best it can rather than discarding it', () => {
    const fromTheFuture = {
      version: 99,
      openedChests: { chest: 500 },
      flags: { seen: true },
      visitedZones: ['x'],
      somethingNew: { nobody: 'knows' },
    };
    const state = migrateWorldState(fromTheFuture);
    expect(state.version).toBe(WORLD_STATE_VERSION);
    expect(state.openedChests).toEqual({ chest: 500 });
    expect(state.flags).toEqual({ seen: true });
  });
});

describe('chests', () => {
  const id = chestId('ngoai-mon', 1200.4, 940.6);

  it('names a chest by the map and the rounded spot', () => {
    expect(id).toBe('ngoai-mon:1200,941');
  });

  it('is spent only inside the respawn window, measured from the stamp', () => {
    const state = createWorldState();
    expect(chestIsSpent(state, id, 1000, 90_000)).toBe(false);
    markChestOpened(state, id, 1000);
    expect(chestIsSpent(state, id, 1000, 90_000)).toBe(true);
    expect(chestIsSpent(state, id, 90_999, 90_000)).toBe(true);
    expect(chestIsSpent(state, id, 91_001, 90_000)).toBe(false);
    // Retuning the window applies to a chest already in the save.
    expect(chestIsSpent(state, id, 50_000, 10_000)).toBe(false);
  });
});

describe('bosses and flags', () => {
  it('records a boss with the same window logic', () => {
    const state = createWorldState();
    expect(bossIsDown(state, 'z:boss', 5, 1000)).toBe(false);
    markBossDefeated(state, 'z:boss', 5);
    expect(bossIsDown(state, 'z:boss', 500, 1000)).toBe(true);
    expect(bossIsDown(state, 'z:boss', 5_000, 1000)).toBe(false);
  });

  it('scopes a trigger flag by zone, so two maps never share one', () => {
    expect(triggerFlag('a', 'gate')).not.toBe(triggerFlag('b', 'gate'));
    const state = createWorldState();
    setFlag(state, triggerFlag('a', 'gate'));
    expect(flagSet(state, triggerFlag('a', 'gate'))).toBe(true);
    expect(flagSet(state, triggerFlag('b', 'gate'))).toBe(false);
  });

  it('reports a first visit once', () => {
    const state = createWorldState();
    expect(markVisited(state, 'ngoai-mon')).toBe(true);
    expect(markVisited(state, 'ngoai-mon')).toBe(false);
    expect(state.visitedZones).toEqual(['ngoai-mon']);
  });
});

describe('mergeWorldState', () => {
  /**
   * The case this exists for: the avatar store picks one record wholesale by
   * `updatedAt`, so without a merge a fresh row from the server would erase a
   * world the device remembered. None of these facts ever un-happen.
   */
  it('keeps facts from both sides, taking the later stamp', () => {
    const device = createWorldState();
    markChestOpened(device, 'chest-a', 500);
    markChestOpened(device, 'chest-shared', 900);
    setFlag(device, 'saw-the-gate');
    markVisited(device, 'rung-ngoai-mon');

    const server = createWorldState();
    markChestOpened(server, 'chest-b', 700);
    markChestOpened(server, 'chest-shared', 100);
    setFlag(server, 'met-the-elder');
    markVisited(server, 'ngoai-mon');

    const merged = mergeWorldState(device, server);
    expect(merged.openedChests).toEqual({ 'chest-a': 500, 'chest-b': 700, 'chest-shared': 900 });
    expect(merged.flags).toEqual({ 'saw-the-gate': true, 'met-the-elder': true });
    expect(merged.visitedZones.sort()).toEqual(['ngoai-mon', 'rung-ngoai-mon']);
  });

  it('is order-independent', () => {
    const a = createWorldState();
    markChestOpened(a, 'c', 10);
    const b = createWorldState();
    markChestOpened(b, 'c', 20);
    expect(mergeWorldState(a, b)).toEqual(mergeWorldState(b, a));
  });
});
