import { ZONES, ZONE_ORDER, type ZoneDef, type ZoneId } from '../../zones';

/**
 * How the maps join up, derived rather than declared.
 *
 * A hand-written `WORLD_MAP = { village: { north: 'forest' } }` table is a
 * second source of truth for something the portals already say, and the two
 * drift the first time a portal moves. So the graph is read off the zones: a
 * link is a portal, and there is no way to have one without the other.
 *
 * What that buys, beyond a world-map screen knowing where the roads go, is
 * `problems()` — the portals are the one part of the map data that points at
 * *other* map data, so they are the one part that can be quietly wrong. A
 * target zone that does not exist, a spawn point outside its map, a road with
 * no way back: none of those throw, they just strand the player.
 */

export interface WorldLink {
  from: ZoneId;
  to: ZoneId;
  /** Where the portal stands on the origin map. */
  at: { x: number; y: number };
  /** Where the player is put down on the destination map. */
  spawn: { x: number; y: number };
  label: string;
}

export class WorldMapManager {
  private readonly graph: WorldLink[] = [];

  constructor(private readonly zones: Readonly<Record<ZoneId, ZoneDef>> = ZONES) {
    for (const id of ZONE_ORDER) {
      const zone = this.zones[id];
      if (!zone) continue;
      for (const portal of zone.portals) {
        this.graph.push({
          from: id,
          to: portal.to,
          at: { x: portal.x, y: portal.y },
          spawn: { ...portal.spawn },
          label: portal.label,
        });
      }
    }
  }

  get links(): readonly WorldLink[] {
    return this.graph;
  }

  exitsFrom(id: ZoneId): readonly WorldLink[] {
    return this.graph.filter((link) => link.from === id);
  }

  neighbours(id: ZoneId): readonly ZoneId[] {
    return [...new Set(this.exitsFrom(id).map((link) => link.to))];
  }

  /** True when a road runs from one to the other, in that direction. */
  connects(from: ZoneId, to: ZoneId): boolean {
    return this.graph.some((link) => link.from === from && link.to === to);
  }

  /**
   * Fewest zones to walk through, `from` and `to` included, or null if there is
   * no road at all. Breadth-first, because every hop costs the same — one fade.
   *
   * For a world map that wants to say "three zones east", and for a quest that
   * needs to know whether the place it is sending the player is reachable yet.
   */
  route(from: ZoneId, to: ZoneId): ZoneId[] | null {
    if (from === to) return [from];
    const seen = new Set<ZoneId>([from]);
    const queue: ZoneId[][] = [[from]];
    while (queue.length) {
      const path = queue.shift()!;
      for (const next of this.neighbours(path[path.length - 1])) {
        if (seen.has(next)) continue;
        if (next === to) return [...path, next];
        seen.add(next);
        queue.push([...path, next]);
      }
    }
    return null;
  }

  /**
   * Everything wrong with the map graph, in plain sentences.
   *
   * Reported rather than thrown: a broken portal should be loud in development
   * and survivable in play, because `zoneOf` already falls back to the training
   * ground and stranding the player is better than a black screen.
   */
  problems(): string[] {
    const out: string[] = [];
    for (const link of this.graph) {
      const target = this.zones[link.to];
      if (!target) {
        out.push(`${link.from}: cong "${link.label}" tro den zone khong ton tai "${link.to}"`);
        continue;
      }
      const { x, y } = link.spawn;
      if (x < 0 || y < 0 || x > target.width || y > target.height) {
        out.push(
          `${link.from} -> ${link.to}: diem dat chan (${x}, ${y}) nam ngoai ban do ` +
            `${target.width}x${target.height}`,
        );
      }
      if (!this.connects(link.to, link.from)) {
        // Not always a bug — a one-way drop into a dungeon is a design — but it
        // is always worth seeing, because the usual cause is a forgotten portal.
        out.push(`${link.from} -> ${link.to}: mot chieu, khong co duong ve`);
      }
    }
    for (const id of ZONE_ORDER) {
      if (this.exitsFrom(id).length === 0) out.push(`${id}: khong co cong nao di ra`);
      if (!this.graph.some((link) => link.to === id)) {
        out.push(`${id}: khong cong nao tro den (chi vao duoc bang dich chuyen)`);
      }
    }
    return out;
  }
}
