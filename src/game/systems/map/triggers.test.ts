import { beforeEach, describe, expect, it } from 'vitest';
import { TriggerManager, contains, type TriggerDef, type TriggerPhase } from './TriggerManager';
import { ZONES } from '../../zones';

/**
 * The whole point of a trigger is the *edge* — the frame the player crosses in
 * — and an edge is the easiest thing to get wrong. Standing still inside a
 * circle must not fire sixty times a second, leaving and coming back must fire
 * again on `per-visit`, and a `once` must not.
 */

type Fired = { id: string; phase: TriggerPhase };

function harness(defs: TriggerDef[], allow?: (def: TriggerDef) => boolean) {
  const fired: Fired[] = [];
  const manager = new TriggerManager({
    fire: (def, phase) => fired.push({ id: def.id, phase }),
    allow,
  });
  manager.load(defs);
  return { manager, fired };
}

const circle: TriggerDef = {
  id: 'ring',
  shape: { kind: 'circle', x: 100, y: 100, radius: 50 },
  event: 'notice',
};

describe('contains', () => {
  it('measures a circle by true distance, not a bounding box', () => {
    // The corner of the box is inside it and outside the circle: 35,35 away is
    // 49.5 from the centre, 45,45 is 63.6.
    expect(contains(circle.shape, { x: 135, y: 135 })).toBe(true);
    expect(contains(circle.shape, { x: 145, y: 145 })).toBe(false);
  });

  it('includes a rect on its edges', () => {
    const rect = { kind: 'rect' as const, x: 10, y: 20, width: 100, height: 40 };
    expect(contains(rect, { x: 10, y: 20 })).toBe(true);
    expect(contains(rect, { x: 110, y: 60 })).toBe(true);
    expect(contains(rect, { x: 111, y: 60 })).toBe(false);
  });
});

describe('TriggerManager', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness([{ ...circle, exit: true }]);
  });

  it('fires on the frame the player crosses in, and not again while inside', () => {
    h.manager.tick({ x: 200, y: 200 });
    expect(h.fired).toEqual([]);
    h.manager.tick({ x: 100, y: 100 });
    expect(h.fired).toEqual([{ id: 'ring', phase: 'enter' }]);
    // Sixty more frames of standing still.
    for (let i = 0; i < 60; i++) h.manager.tick({ x: 100 + (i % 3), y: 100 });
    expect(h.fired).toHaveLength(1);
  });

  it('reports the exit only when asked to', () => {
    h.manager.tick({ x: 100, y: 100 });
    h.manager.tick({ x: 500, y: 500 });
    expect(h.fired).toEqual([
      { id: 'ring', phase: 'enter' },
      { id: 'ring', phase: 'exit' },
    ]);

    const quiet = harness([circle]); // no `exit`
    quiet.manager.tick({ x: 100, y: 100 });
    quiet.manager.tick({ x: 500, y: 500 });
    expect(quiet.fired).toEqual([{ id: 'ring', phase: 'enter' }]);
  });

  it('fires again on a second visit, but never twice for `once`', () => {
    const visit = harness([{ ...circle, repeat: 'per-visit' }]);
    const only = harness([{ ...circle, id: 'only', repeat: 'once' }]);
    for (const m of [visit, only]) {
      m.manager.tick({ x: 100, y: 100 });
      m.manager.tick({ x: 500, y: 500 });
      m.manager.tick({ x: 100, y: 100 });
    }
    // Two crossings in, so two firings. Asserting 1 here is exactly what let
    // the bug through: the test was written against the code rather than
    // against what `per-visit` names, and both agreed on the wrong answer.
    expect(visit.fired.filter((f) => f.phase === 'enter')).toHaveLength(2);
    expect(only.fired).toHaveLength(1);
  });

  it('keeps firing every frame for `always`', () => {
    const field = harness([{ ...circle, repeat: 'always' }]);
    for (let i = 0; i < 5; i++) field.manager.tick({ x: 100, y: 100 });
    expect(field.fired).toHaveLength(5);
  });

  it('lets the scene veto a firing without consuming it', () => {
    let open = false;
    const gated = harness([{ ...circle, repeat: 'per-visit' }], () => open);
    gated.manager.tick({ x: 100, y: 100 });
    expect(gated.fired).toEqual([]);
    // Out, gate opens, back in — the veto must not have used up the one firing.
    gated.manager.tick({ x: 500, y: 500 });
    open = true;
    gated.manager.tick({ x: 100, y: 100 });
    expect(gated.fired).toEqual([{ id: 'ring', phase: 'enter' }]);
  });

  it('ignores a null focus, so a dead player triggers nothing', () => {
    h.manager.tick(null);
    expect(h.fired).toEqual([]);
  });

  it('forgets everything on unload', () => {
    h.manager.tick({ x: 100, y: 100 });
    h.manager.clear();
    expect(h.manager.count).toBe(0);
    expect(h.manager.occupied).toEqual([]);
  });
});

describe('the triggers the zones ship', () => {
  it('all sit inside the map they belong to', () => {
    for (const zone of Object.values(ZONES)) {
      for (const trigger of zone.triggers ?? []) {
        const s = trigger.shape;
        const [x, y] =
          s.kind === 'circle' ? [s.x, s.y] : [s.x + s.width / 2, s.y + s.height / 2];
        expect(
          x >= 0 && y >= 0 && x <= zone.width && y <= zone.height,
          `${zone.id}/${trigger.id} tam (${x}, ${y}) ngoai ban do ${zone.width}x${zone.height}`,
        ).toBe(true);
      }
    }
  });

  it('has no two triggers sharing an id inside one map', () => {
    for (const zone of Object.values(ZONES)) {
      const ids = (zone.triggers ?? []).map((t) => t.id);
      expect(new Set(ids).size, `${zone.id}: id trung nhau`).toBe(ids.length);
    }
  });
});
