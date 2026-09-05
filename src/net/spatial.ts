/**
 * World interest grid.
 *
 * One Realtime channel per cell. A player publishes only on the cell they
 * stand in, and subscribes to the 3×3 neighbourhood around it. Cell occupancy
 * stays bounded no matter how many people are on the rest of the map, which is
 * what makes the player count unbounded.
 */

export const CELL_SIZE = 400;

export interface Cell {
  cx: number;
  cy: number;
}

export function cellOf(x: number, y: number): Cell {
  return {
    cx: Math.floor(x / CELL_SIZE),
    cy: Math.floor(y / CELL_SIZE),
  };
}

export function cellKey(cell: Cell): string {
  return `${cell.cx}:${cell.cy}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.cx === b.cx && a.cy === b.cy;
}

/** Home cell plus the eight around it — what this client listens to. */
export function neighbourhood(home: Cell): Cell[] {
  const out: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      out.push({ cx: home.cx + dx, cy: home.cy + dy });
    }
  }
  return out;
}

export function channelName(world: string, cell: Cell): string {
  // One topic segment after the project prefix — extra `:` confused some
  // Realtime joins, and two clients then only saw each other one way.
  return `tmnd-${world}-${cell.cx}-${cell.cy}`;
}
