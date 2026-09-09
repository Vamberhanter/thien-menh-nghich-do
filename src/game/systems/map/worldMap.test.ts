import { describe, expect, it } from 'vitest';
import { WorldMapManager } from './WorldMapManager';
import { ZONES, type ZoneDef, type ZoneId } from '../../zones';

/**
 * Two jobs. The first is a guard on the shipped maps: the portals are the only
 * map data that points at other map data, so they are the only part that can
 * be wrong without anything throwing, and a bad one strands the player rather
 * than crashing. The second is a guard on the guard — a validator that never
 * reports anything is indistinguishable from one that cannot.
 */

/** A deep-enough copy to bend one portal without touching the real zones. */
function clone(): Record<ZoneId, ZoneDef> {
  return JSON.parse(JSON.stringify(ZONES)) as Record<ZoneId, ZoneDef>;
}

describe('WorldMapManager', () => {
  it('derives one link per portal', () => {
    const world = new WorldMapManager();
    const portals = Object.values(ZONES).reduce((n, zone) => n + zone.portals.length, 0);
    expect(world.links.length).toBe(portals);
  });

  it('finds nothing wrong with the shipped maps', () => {
    expect(new WorldMapManager().problems()).toEqual([]);
  });

  it('routes through the zones that connect them', () => {
    const world = new WorldMapManager();
    // Thanh Phong Cốc is two roads out from the training ground, via the forest.
    expect(world.route('ngoai-mon', 'thanh-phong-coc')).toEqual([
      'ngoai-mon',
      'rung-ngoai-mon',
      'thanh-phong-coc',
    ]);
    expect(world.route('ngoai-mon', 'ngoai-mon')).toEqual(['ngoai-mon']);
  });

  it('reports a portal aimed at a zone that does not exist', () => {
    const zones = clone();
    zones['ngoai-mon'].portals[0].to = 'khong-ton-tai' as ZoneId;
    const problems = new WorldMapManager(zones).problems();
    expect(problems.some((p) => p.includes('khong ton tai'))).toBe(true);
  });

  it('reports a spawn point outside the map it lands on', () => {
    const zones = clone();
    const target = zones['ngoai-mon'].portals[0].to;
    zones['ngoai-mon'].portals[0].spawn = { x: zones[target].width + 500, y: 10 };
    const problems = new WorldMapManager(zones).problems();
    expect(problems.some((p) => p.includes('nam ngoai ban do'))).toBe(true);
  });

  it('reports a road with no way back', () => {
    const zones = clone();
    // Cut the return leg: the forest keeps its road in, and loses its road out.
    zones['rung-ngoai-mon'].portals = zones['rung-ngoai-mon'].portals.filter(
      (portal) => portal.to !== 'ngoai-mon',
    );
    const problems = new WorldMapManager(zones).problems();
    expect(problems.some((p) => p.includes('mot chieu'))).toBe(true);
  });

  it('reports a zone nothing leads to', () => {
    const zones = clone();
    for (const zone of Object.values(zones)) {
      zone.portals = zone.portals.filter((portal) => portal.to !== 'huyet-ma-coc');
    }
    const problems = new WorldMapManager(zones).problems();
    expect(problems.some((p) => p.includes('khong cong nao tro den'))).toBe(true);
    // And it is then unreachable on foot, which is the thing that matters.
    expect(new WorldMapManager(zones).route('ngoai-mon', 'huyet-ma-coc')).toBeNull();
  });
});
