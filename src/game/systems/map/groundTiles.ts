/**
 * The 64-tile ground set's classification, shared rather than copied.
 *
 * Cut by `tools/build-nguhanhson.mjs` from `terrain.png`'s 4x16 grid; which
 * index is grass, dirt, stone or road was worked out by eye once, for
 * `nguHanhSon.ts`. `MapEditor` needs the same table — a ground-paint tool
 * that invented its own classification would silently drift from what the
 * one shipped zone already means by "grass" — so it lives here and
 * `nguHanhSon.ts` imports it rather than the other way round.
 */

export const GROUND_TILE_SIZE = 64;

export const GRASS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 18, 19] as const;
export const DIRT = [10, 11, 12, 20, 21, 22, 23, 24, 29] as const;
export const STONE = [26, 27, 28, 30, 32, 33, 34, 35, 36, 37, 38, 39, 53, 54] as const;
export const ROAD = [13, 14, 15, 25, 31, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52] as const;

export const GROUND_FAMILIES = { grass: GRASS, dirt: DIRT, stone: STONE, road: ROAD } as const;
export type GroundFamily = keyof typeof GROUND_FAMILIES;

/**
 * A stable pick from a family, by position — seeded off the tile's own
 * coordinates so the ground looks the same on every reload rather than
 * re-scattering itself.
 */
export const pickGroundTile = (family: readonly number[], col: number, row: number): number =>
  family[(col * 7 + row * 13 + ((col * row) % 5)) % family.length];
