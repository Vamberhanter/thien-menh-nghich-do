import type { TriggerDef } from '../systems/map/TriggerManager';
import { GROUND_FAMILIES, pickGroundTile } from '../systems/map/groundTiles';
import type { ZoneDef } from './types';
import {
  BACKDROP_DEPTH,
  FLOOR_DEPTH,
  NGUHANHSON_TILE as T,
  VOID_TILE,
  type TilemapLayout,
  type TilemapProp,
} from '../systems/map/TilemapTerrain';

/**
 * Ngũ Hành Sơn — Chân Núi, second pass.
 *
 * Built directly against a composition the user sketched: one island, roughly
 * as wide at the temple as at the entrance, cliff-and-tree rim running
 * unbroken all the way round. A grand hall at the north with a stair and six
 * banners; a waterfall feeding a lily pond at the north-west, crossed by a
 * bridge; a cave mouth at the north-east with lanterns and a stall; a river
 * crossing the south on its own bridge and falling off the island there; and
 * in the middle a stamped yin-yang plaza ringed by steles and braziers, with
 * loose clusters of tree and rock scattered around it rather than a forest.
 *
 * The props below come from a second art drop (`tools/build-nguhanhson2.mjs`,
 * `dist/assets/environment/nguhanh_son`), segmented by real flood fill instead
 * of the first drop's row/column pass — that sheet set scatters across both
 * axes at once, and a row/column pass returned one 1500px blob for the
 * waterfall-island sheet where flood fill found 29 real objects. See that
 * tool's header for the measurement. No ground tileset came with it — every
 * one of the eight sheets is raised terrain or decoration, nothing flat enough
 * to butt-join at 64px — so the walking surface is still the first drop's
 * `ground.png`, cut from a true 64px repeating tile.
 *
 * The geometry underneath — the island as a table of half-widths, roads as
 * line segments, arenas as named rectangles — is unchanged from the first
 * pass and is not repeated in comment here beyond what changed:
 *
 *  - `RIM` is close to constant width, rounding only at the very top and
 *    narrowing only at the entrance, because the sketch's island does not
 *    taper toward the temple the way the first attempt's did — the hall
 *    stands directly in the north wall, at full width, not on a shelf above a
 *    climb.
 *  - There is no second gate at the entrance. The sketch has exactly one
 *    building, at the north; the south is the river, its bridge, and open
 *    ground to land on.
 */

const COLS = 40;
const ROWS = 30;

/* ------------------------------------------------------------ tile indices */

/**
 * Which of the 64 ground tiles is what, and a stable per-position pick —
 * shared with `MapEditor`'s ground brush now, so moved to `groundTiles.ts`
 * rather than kept as this file's own private copy. See that module.
 */
const { grass: GRASS, dirt: DIRT, stone: STONE, road: ROAD } = GROUND_FAMILIES;

/* ------------------------------------------------------------------- shape */

/**
 * The island's outline: half-width in tiles, one entry per row, `-1` for none.
 *
 * Close to constant at 17-18 for the whole body, rounding off only in the top
 * three rows and the bottom four — a hexagon more than a teardrop, which is
 * what the sketch draws: the temple sits in the north wall at the same width
 * as the plaza below it, not on a narrowed shelf.
 */
const RIM: readonly number[] = [
  -1, -1, //          0–1   sky
  13, 16, //          2–3   rounding into the top
  17, 18, 18, 18, //  4–7   the temple's row and the plaza below it
  18, 18, 18, 18, //  8–11
  18, 18, 18, 18, //  12–15
  18, 18, 18, 18, //  16–19
  18, 18, 18, 18, //  20–23
  17, 16, 15, 13, //  24–27  narrowing toward the entrance
  11, 9, //           28–29  the promontory at the entrance
];

/** The centre column of the island, and of the map. */
const AXIS = (COLS - 1) / 2;

const onIsland = (col: number, row: number): boolean => {
  const half = RIM[row] ?? -1;
  return half >= 0 && Math.abs(col - AXIS) <= half;
};

/** Westmost / eastmost ground column on a row, or `null` where there is none. */
function edgeCols(row: number): readonly [number, number] | null {
  const half = RIM[row] ?? -1;
  if (half < 0) return null;
  return [Math.ceil(AXIS - half), Math.floor(AXIS + half)];
}

/** The southmost ground row in a column, or `null` if the column is all sky. */
function bottomRow(col: number): number | null {
  for (let row = ROWS - 1; row >= 0; row--) if (onIsland(col, row)) return row;
  return null;
}

/* ------------------------------------------------------------------- roads */

interface Path {
  readonly id: string;
  readonly half: number;
  readonly points: ReadonlyArray<readonly [number, number]>;
}

/**
 * Spawn → plaza → temple, almost straight — the sketch's own path is a
 * near-vertical strip of dirt down the island's centreline, with only a
 * slight drift, not the switchback the first attempt drew.
 */
const MAIN_ROAD: Path = {
  id: 'main',
  half: 2.2,
  points: [
    [20, 28],
    [19, 22],
    [20, 16],
    [19, 10],
    [20, 5],
  ],
};

/*
 * 1.0 rather than the 0.6 this was first tried at. Checked against the actual
 * painted grid, not eyeballed: at 0.6 a diagonal segment covers barely one
 * tile in three, because a tile only counts as "on the path" when its centre
 * falls within 0.6 tiles of the line, and most tile centres along a shallow
 * diagonal sit further than that from it. The result was a dashed line of
 * single dirt tiles rather than a trail — a footpath that reads as scattered
 * rubble is worse than no footpath, and it is what "khu vực chưa trải đều"
 * was pointing at. 1.0 guarantees a tile on every row or column the segment
 * crosses, at roughly half the main road's width, which is still visibly the
 * smaller path.
 */
const SIDE_HALF = 1.0;

const SIDE_PATHS: readonly Path[] = [
  // North-west, to the pond and its bridge.
  { id: 'pond-path', half: SIDE_HALF, points: [[17, 16], [12, 14], [8, 11], [7, 9]] },
  // North-east, all the way to the cave mouth — it used to stop three tiles
  // short, at (31, 10), leaving the cave with no path reaching it at all.
  { id: 'cave-path', half: SIDE_HALF, points: [[23, 16], [28, 13], [31, 10], [31, 7]] },
];

/** Distance in tiles from (col, row) to a path's centre-line. */
function distToPath(path: Path, col: number, row: number): number {
  let best = Infinity;
  for (let i = 1; i < path.points.length; i++) {
    const [ax, ay] = path.points[i - 1];
    const [bx, by] = path.points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((col - ax) * dx + (row - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(col - (ax + dx * t), row - (ay + dy * t)));
  }
  return best;
}

const onMainRoad = (col: number, row: number): boolean => distToPath(MAIN_ROAD, col, row) <= MAIN_ROAD.half;
const onSidePath = (col: number, row: number): boolean =>
  SIDE_PATHS.some((path) => distToPath(path, col, row) <= path.half);

/* ------------------------------------------------------------------- water */

/** The pond, north-west: an ellipse, in tiles. */
const POND = { col: 7, row: 9, rx: 3.4, ry: 2.6 } as const;

const pondAt = (col: number, row: number): number => ((col - POND.col) / POND.rx) ** 2 + ((row - POND.row) / POND.ry) ** 2;
const inPond = (col: number, row: number): boolean => pondAt(col, row) <= 1;
const onPondShore = (col: number, row: number): boolean => !inPond(col, row) && pondAt(col, row) <= 1.8;

/** The river: a nearly straight band crossing the south third of the island. */
const RIVER_ROW = { from: 24, to: ROWS - 1 } as const;

const riverCentre = (row: number): number => AXIS + Math.sin((row - RIVER_ROW.from) / 3) * 0.8;
const inRiver = (col: number, row: number): boolean =>
  row >= RIVER_ROW.from && row <= RIVER_ROW.to && Math.abs(col - riverCentre(row)) <= 1.3;

const BRIDGE_ROW = 26;
const onBridge = (col: number, row: number): boolean => row === BRIDGE_ROW && Math.abs(col - riverCentre(row)) <= 2.5;

/* --------------------------------------------------------------- the plaza */

const PLAZA_RADIUS = 7;
const inPlaza = (col: number, row: number): boolean => Math.hypot(col - AXIS, row - 17) <= PLAZA_RADIUS;
/**
 * One tile of worn dirt around the stone, rather than grass butting straight
 * against it.
 *
 * A circle rasterised on a 64px grid is a stair-step at any radius — that
 * part cannot be fixed without tiles drawn to blend, which this set does not
 * have. What can be fixed is what the step is a step *between*: grass next to
 * bare stone reads as a rendering fault because nothing in the world explains
 * the line, while a worn ring of dirt reads as ground that has simply been
 * walked on right up to the edge of the flagstones — the same stair-step
 * geometry, but now it looks like a place instead of a glitch.
 */
const onPlazaEdge = (col: number, row: number): boolean => {
  const d = Math.hypot(col - AXIS, row - 17);
  return d > PLAZA_RADIUS && d <= PLAZA_RADIUS + 1.4;
};

/* ---------------------------------------------------------------- gameplay */

export interface ArenaDef {
  readonly id: string;
  readonly label: string;
  readonly col: number;
  readonly row: number;
  readonly w: number;
  readonly h: number;
  readonly elite?: boolean;
}

/**
 * One large arena at the plaza (§5's main combat space, and the sketch's own
 * open centre), and two smaller pockets either side of it near the pond and
 * the cave — closer to the sketch's actual reading than the first pass's
 * three widely separated fields.
 */
export const ARENAS: readonly ArenaDef[] = [
  { id: 'combat-01', label: 'Trung Nguyên · trận đồ Âm Dương', col: 13, row: 12, w: 14, h: 10 },
  { id: 'combat-02', label: 'Đàm Thủy · bên hồ sen', col: 4, row: 6, w: 8, h: 6 },
  { id: 'combat-03', label: 'Huyền Động · trước hang đá', col: 27, row: 6, w: 8, h: 6, elite: true },
];

const inArena = (col: number, row: number): boolean =>
  ARENAS.some((a) => col >= a.col && col < a.col + a.w && row >= a.row && row < a.row + a.h);

export const MARKERS = {
  // Off the river's own centreline (~col 20 at this row) — the column that
  // looked obviously safe from the layout sat in the water instead. On the
  // west bank, south of the bridge, close to where the sketch's stairs land.
  playerSpawn: [15, 27],
  npcArea: [20, 20],
  itemEast: [29, 9],
  caveMouth: [31, 7],
  landmark: [20, 17],
  mapExit: [20, 4],
} as const satisfies Record<string, readonly [number, number]>;

/* ------------------------------------------------------------------ ground */

function buildLayout(): TilemapLayout {
  const ground: number[] = [];
  const overlay: number[] = [];
  const blocked: boolean[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!onIsland(col, row)) {
        ground.push(VOID_TILE);
        overlay.push(VOID_TILE);
        blocked.push(true);
        continue;
      }

      const water = inPond(col, row) || inRiver(col, row);
      const bridge = onBridge(col, row);
      const plaza = inPlaza(col, row) && !water;
      const paved = (onMainRoad(col, row) || onSidePath(col, row)) && !plaza && !water;

      const base =
        water || onPondShore(col, row) || onPlazaEdge(col, row)
          ? DIRT
          : plaza || bridge
            ? STONE
            : GRASS;
      ground.push(pickGroundTile(base, col, row));
      overlay.push(paved ? pickGroundTile(ROAD, col, row) : VOID_TILE);
      blocked.push(water && !bridge);
    }
  }

  return {
    ground,
    overlay,
    blocked,
    props: buildProps(),
    cols: COLS,
    rows: ROWS,
    sky: [0x74a3d2, 0xd6e7f2],
  };
}

/* ------------------------------------------------------------------- props */

const at = (col: number, row: number) => ({ x: col * T + T / 2, y: row * T + T });

/**
 * Named frames from the second drop. Identified off labeled contact sheets
 * (`.tmp/probe/sheet2-*.png`) rather than by size, the same discipline as the
 * first pass — this time every frame is genuinely one clean object, because
 * flood-fill segmentation does not merge across a real gap the way the
 * row/column pass did.
 */
const CLIFF = {
  /** The one grand hall — roofed, staired, the tallest single prop in play. */
  grandHall: 'cliff2_40',
  /** A cave mouth with its own lit torches, for the entrance and nowhere else. */
  caveMouth: 'cliff2_30',
  /** The stamped yin-yang plaza — floor art, not a footprint. */
  yinyangPlaza: 'cliff2_53',
  archBridge: 'cliff2_54',
  stairBlock: 'cliff2_29',
} as const;

const BANNER = ['cliff2_45', 'cliff2_46', 'cliff2_47', 'cliff2_48', 'cliff2_43', 'cliff2_50'] as const;
const STELE = ['cliff2_60', 'cliff2_68', 'cliff2_75', 'cliff2_79', 'cliff2_57'] as const;
const BRAZIER = ['cliff2_42', 'cliff2_65'] as const;
const LANTERN_POST = ['cliff2_51', 'cliff2_52', 'cliff2_64', 'cliff2_80'] as const;
const FENCE = ['cliff2_56', 'cliff2_87'] as const;
const SIGNPOST = 'cliff2_61';
const STALL = 'cliff2_67';

/** Rim blocks: plain grass-top cliff, no waterfall or cave baked in. */
const RIM_BLOCK = [
  'cliff2_0', 'cliff2_1', 'cliff2_6', 'cliff2_8', 'cliff2_9', 'cliff2_10', 'cliff2_11',
  'cliff2_12', 'cliff2_13', 'cliff2_14', 'cliff2_15', 'cliff2_16', 'cliff2_17', 'cliff2_20',
  'cliff2_24', 'cliff2_25', 'cliff2_26', 'cliff2_27', 'cliff2_31', 'cliff2_32', 'cliff2_33', 'cliff2_39',
] as const;
const CLIFF_ROCK = ['cliff2_58', 'cliff2_59', 'cliff2_62', 'cliff2_63', 'cliff2_66', 'cliff2_69', 'cliff2_71'] as const;

/**
 * Rim blocks with their own waterfall baked in, for the one or two places the
 * pond and the river actually spill past the island's edge.
 *
 * The reference the user pointed at shows exactly this: the pond does not
 * just feed a contained pool, it drains *over the cliff*, into open air. A
 * flat water tile at the mouth (what the river already had) reads as the
 * river stopping; a cliff block with a fall built into its own rock face
 * reads as the ground itself giving way to the drop. `cliff2_18` is the
 * sheet's tallest single fall, `cliff2_4` its widest double one.
 */
const RIM_WATERFALL: readonly { row: number; side: 'west' | 'east'; frame: string }[] = [
  { row: 9, side: 'west', frame: 'cliff2_18' },
  { row: 10, side: 'west', frame: 'cliff2_4' },
];

const TREE = {
  banyan: 'flora_1',
  maple: 'flora_0',
  cherry: 'flora_4',
  gold: 'flora_5',
  pine: 'flora_6',
  bamboo: 'flora_7',
  willow: 'flora_11',
  apple: 'flora_12',
  jacaranda: 'flora_13',
} as const;
const BUSH = ['flora_15', 'flora_16', 'flora_24', 'flora_26', 'flora_27', 'flora_28', 'flora_30', 'flora_37', 'flora_44'] as const;
const STUMP = 'flora_49';
const LOG = ['flora_53', 'flora_54'] as const;
const CRYSTAL = ['flora_25', 'flora_32', 'flora_42'] as const;
const TWIN_STELE = 'flora_38';
const RUNE_PILLARS = 'flora_40';
const STONE_ARCH = 'flora_18';
const PAVILION = ['flora_21', 'flora_22'] as const;

const LAKE_FALL_BIG = 'lake_0';
const LAKE_FALL_SMALL = 'lake_5';
const LAKE_POND_RING = ['lake_6', 'lake_9', 'lake_10'] as const;
const LAKE_LILY = ['lake_32', 'lake_36', 'lake_44', 'lake_45', 'lake_49'] as const;
const LAKE_BRIDGE = 'lake_25';
const LAKE_LAMP = 'lake_18';

const GROUND_RIVER = ['ground_0', 'ground_1', 'ground_2'] as const;
const GROUND_FALL = 'ground_87';

const PEAK_SILHOUETTE = ['peak_6', 'peak_10', 'peak_14', 'peak_20', 'peak_23', 'peak_51', 'peak_59', 'peak_60'] as const;
const PEAK_TEMPLE = 'peak_48';
const ISLE_FAR = ['isleA_4', 'isleB_2'] as const;

/** Deterministic pick from a pool. */
const one = <A>(pool: readonly A[], seed: number): A => pool[Math.abs(Math.trunc(seed)) % pool.length];

const FOOT = {
  hall: { width: 210, height: 90 },
  cave: { width: 90, height: 50 },
  tree: { width: 48, height: 32 },
  greatTree: { width: 70, height: 40 },
  rim: { width: 110, height: 60 },
  rock: { width: 56, height: 36 },
} as const;

/** Whether anything may be planted on a tile — see the first pass for why one rule serves every reader. */
const plantable = (col: number, row: number): boolean =>
  onIsland(col, row) &&
  !inArena(col, row) &&
  !onMainRoad(col, row) &&
  !onSidePath(col, row) &&
  !inPlaza(col, row) &&
  !inPond(col, row) &&
  !inRiver(col, row) &&
  !onPondShore(col, row);

function buildProps(): TilemapProp[] {
  const props: TilemapProp[] = [];

  const put = (col: number, row: number, texture: string, frame: string, extra: Partial<TilemapProp> = {}) =>
    props.push({ ...at(col, row), texture, frame, ...extra });

  const tree = (col: number, row: number, frame: string) => put(col, row, 'nhs2-flora', frame, { solid: FOOT.tree });
  const great = (col: number, row: number, frame: string) => put(col, row, 'nhs2-flora', frame, { solid: FOOT.greatTree });
  const flora = (col: number, row: number, frame: string) => put(col, row, 'nhs2-flora', frame);
  const cliff = (col: number, row: number, frame: string, extra: Partial<TilemapProp> = {}) =>
    put(col, row, 'nhs2-cliff2', frame, extra);
  const lake = (col: number, row: number, frame: string, extra: Partial<TilemapProp> = {}) =>
    put(col, row, 'nhs2-lake', frame, extra);

  /* ==== the backdrop ==================================================== */

  const back = (col: number, row: number, texture: string, frame: string, alpha: number) =>
    put(col, row, texture, frame, { depth: BACKDROP_DEPTH, unlit: true, alpha });

  for (const [i, col] of [3, 10, 30, 37].entries()) back(col, 1.6, 'nhs2-peak', PEAK_SILHOUETTE[i % PEAK_SILHOUETTE.length], 0.75);
  back(26, 2.4, 'nhs2-peak', PEAK_TEMPLE, 0.92);
  for (const [i, [col, row]] of ([[35.5, 24], [4, 9]] as const).entries()) {
    put(col, row, i ? 'nhs2-isleB' : 'nhs2-isleA', ISLE_FAR[i], {
      depth: BACKDROP_DEPTH + 1,
      unlit: true,
      alpha: 0.5,
      width: 170,
      height: 176,
    });
  }

  /* ==== the island's rim ================================================ */

  for (let row = 0; row < ROWS; row++) {
    const edges = edgeCols(row);
    if (!edges) continue;
    const [west, east] = edges;
    const fallWest = RIM_WATERFALL.find((f) => f.row === row && f.side === 'west');
    const fallEast = RIM_WATERFALL.find((f) => f.row === row && f.side === 'east');
    cliff(west, row, fallWest?.frame ?? one(RIM_BLOCK, row * 3 + 1), { solid: FOOT.rim });
    cliff(east, row, fallEast?.frame ?? one(RIM_BLOCK, row * 5 + 2), { solid: FOOT.rim });
    // A tree on the rim's crown every couple of rows, so the ring reads as
    // forested the way the sketch draws it, not as bare grey rock — except
    // right beside a waterfall block, where a canopy this wide would cover
    // the thing it is meant to be next to.
    if (row % 2 === 0) {
      if (!fallWest) tree(west - 0.6, row - 0.3, one([TREE.banyan, TREE.pine, TREE.willow], row));
      if (!fallEast) tree(east + 0.6, row - 0.3, one([TREE.banyan, TREE.pine, TREE.willow], row + 4));
    }
  }
  for (let col = 0; col < COLS; col++) {
    const row = bottomRow(col);
    if (row === null) continue;
    cliff(col, row, one(RIM_BLOCK, col * 7), { solid: FOOT.rim });
  }
  // Accent colour at three points on the rim, matching the sketch's maple and
  // cherry standing out against the green.
  tree(6, 4, TREE.maple);
  tree(33, 8, TREE.maple);
  tree(4, 22, TREE.cherry);
  tree(35, 20, TREE.gold);

  /* ==== the grand hall, north ============================================ */

  cliff(AXIS, 4, CLIFF.grandHall, { solid: FOOT.hall });
  cliff(AXIS, 6, CLIFF.stairBlock, { solid: { width: 60, height: 32 } });
  for (const [i, dx] of [-3.2, -2, -0.8, 0.8, 2, 3.2].entries()) cliff(AXIS + dx, 5, BANNER[i]);
  for (const dx of [-1.6, 1.6]) cliff(AXIS + dx, 6.4, one(LANTERN_POST, dx));

  /* ==== the pond, north-west, and its bridge ============================= */

  lake(POND.col - 0.5, POND.row - POND.ry + 0.3, LAKE_FALL_BIG, { solid: { width: 70, height: 40 } });
  lake(POND.col + 2.2, POND.row - 1, LAKE_FALL_SMALL);
  for (const [i, [dc, dr]] of ([[0, 0], [-1.5, 0.8], [1.6, 0.6]] as const).entries()) {
    lake(POND.col + dc, POND.row + dr, one(LAKE_POND_RING, i), { depth: FLOOR_DEPTH });
  }
  for (const [i, [dc, dr]] of ([[-0.6, -0.4], [0.8, 0.5]] as const).entries()) {
    lake(POND.col + dc, POND.row + dr, one(LAKE_LILY, i), { depth: FLOOR_DEPTH + 1 });
  }
  lake(POND.col + 0.2, POND.row + POND.ry - 0.2, LAKE_BRIDGE, { solid: { width: 24, height: 40 } });
  lake(POND.col + 1.6, POND.row + POND.ry + 0.4, LAKE_LAMP);
  cliff(POND.col - 2.6, POND.row - 2, one(LANTERN_POST, 2));
  // South of the pond rather than beside it — its old spot at (row 9-10,
  // the west rim) is where the outflow waterfall stands now, and a willow's
  // drooping canopy is wide enough to hide a cliff block twice its width.
  great(POND.col - 2, POND.row + 3.2, TREE.willow);
  great(POND.col + 3.4, POND.row - 2.5, TREE.banyan);

  /* ==== the cave, north-east, with its stall ============================= */

  const [caveCol, caveRow] = MARKERS.caveMouth;
  cliff(caveCol, caveRow, CLIFF.caveMouth, { solid: FOOT.cave });
  cliff(caveCol - 1.8, caveRow + 0.6, one(BRAZIER, 0));
  cliff(caveCol + 1.8, caveRow + 0.6, one(BRAZIER, 1));
  const [itemCol, itemRow] = MARKERS.itemEast;
  cliff(itemCol, itemRow, STALL);
  cliff(itemCol + 1.4, itemRow + 0.4, SIGNPOST);
  tree(caveCol - 3, caveRow + 2, TREE.maple);
  tree(caveCol + 2, caveRow - 2, TREE.pine);

  /* ==== the river, south, and its bridge ================================= */

  for (let row = RIVER_ROW.from; row <= RIVER_ROW.to; row++) {
    const centre = riverCentre(row);
    if (!onIsland(Math.round(centre), row) || onBridge(Math.round(centre), row)) continue;
    put(Math.round(centre), row, 'nhs2-ground', one(GROUND_RIVER, row), { depth: FLOOR_DEPTH });
  }
  cliff(Math.round(riverCentre(BRIDGE_ROW)), BRIDGE_ROW, CLIFF.archBridge, { solid: { width: 24, height: 40 } });
  {
    const mouthRow = bottomRow(Math.round(riverCentre(RIVER_ROW.to))) ?? RIVER_ROW.to;
    put(riverCentre(mouthRow), mouthRow + 0.6, 'nhs2-ground', GROUND_FALL, { depth: FLOOR_DEPTH + 1 });
  }
  for (const dx of [-2.2, 2.2]) cliff(riverCentre(23) + dx, 23, one(FENCE, dx));

  /* ==== the centre plaza ================================================= */

  const [markCol, markRow] = MARKERS.landmark;
  cliff(markCol, markRow, CLIFF.yinyangPlaza, { depth: FLOOR_DEPTH + 2 });
  for (const [i, [dc, dr]] of ([[-2.6, -1.4], [2.6, -1.4], [-2.6, 1.4], [2.6, 1.4]] as const).entries()) {
    cliff(markCol + dc, markRow + dr, one(STELE, i));
  }
  for (const [dc, dr] of [[-1.6, -2.2], [1.6, -2.2]] as const) cliff(markCol + dc, markRow + dr, one(BRAZIER, dc));
  flora(markCol - 4, markRow, TWIN_STELE);
  flora(markCol + 4, markRow + 0.5, RUNE_PILLARS);

  /* ==== the NPC area, and the stone arch marking the plaza's edge ======== */

  const [npcCol, npcRow] = MARKERS.npcArea;
  flora(npcCol - 3, npcRow + 2, one(PAVILION, 0));
  flora(npcCol + 3, npcRow + 1, STONE_ARCH);
  for (const dx of [-1.4, 1.4]) cliff(npcCol + dx, npcRow + 3.4, one(FENCE, dx));

  /* ==== scattered clusters, kept out of the arenas and the road ========== */

  const clusters: ReadonlyArray<readonly [number, number]> = [
    [16, 13], [24, 13], [14, 22], [26, 22], [11, 18], [29, 17],
    [17, 8], [23, 8], [9, 15], [31, 15], [14, 26], [26, 26],
    [7, 13], [33, 12], [10, 24], [30, 24], [18, 24], [22, 24],
  ];
  for (const [i, [col, row]] of clusters.entries()) {
    if (!plantable(col, row)) continue;
    if (i % 4 === 0) put(col, row, 'nhs2-cliff2', one(CLIFF_ROCK, i), { solid: FOOT.rock });
    else if (i % 4 === 1) tree(col, row, one([TREE.pine, TREE.bamboo, TREE.jacaranda, TREE.apple], i));
    else flora(col, row, one(BUSH, i));
  }
  // A handful of glowing crystal clusters and stumps, for texture rather than
  // for a reason — the sketch itself scatters small clutter this way.
  for (const [i, [col, row]] of ([[12, 20], [28, 15], [21, 11]] as const).entries()) {
    if (plantable(col, row)) flora(col, row, one(CRYSTAL, i));
  }
  if (plantable(19, 21)) flora(19, 21, STUMP);
  for (const [i, [col, row]] of ([[15, 19], [25, 12]] as const).entries()) {
    if (plantable(col, row)) flora(col, row, one(LOG, i));
  }

  return props;
}

/* ---------------------------------------------------------------- triggers */

const arenaTriggers = (): TriggerDef[] =>
  ARENAS.map(
    (a): TriggerDef => ({
      id: a.id,
      shape: { kind: 'rect', x: a.col * T, y: a.row * T, width: a.w * T, height: a.h * T },
      event: a.elite ? 'arena' : 'region',
      data: { text: a.label },
      exit: !a.elite,
    }),
  );

/* -------------------------------------------------------------------- zone */

const [spawnCol, spawnRow] = MARKERS.playerSpawn;
const [npcCol0, npcRow0] = MARKERS.npcArea;
const [itemCol0, itemRow0] = MARKERS.itemEast;
const [caveCol0, caveRow0] = MARKERS.caveMouth;
const [exitCol, exitRow] = MARKERS.mapExit;

/** Where the player lands coming in from Ngoại Môn — read by that zone's portal. */
export const NGU_HANH_SON_ENTRY = { x: spawnCol * T + T / 2, y: spawnRow * T + T } as const;

export const NGU_HANH_SON: ZoneDef & { terrain: 'tilemap'; layout: TilemapLayout } = {
  id: 'ngu-hanh-son',
  name: 'Ngũ Hành Sơn · Chân Núi',
  terrain: 'tilemap',
  width: COLS * T,
  height: ROWS * T,
  ground: 'grass',
  ambient: 0xe4e4ea,
  layout: buildLayout(),
  shrine: { x: npcCol0 * T, y: npcRow0 * T + T },
  waypoint: { x: (npcCol0 + 4) * T, y: (npcRow0 + 1) * T + T },
  trees: [],
  rocks: [],
  stones: [
    [24 * T, 21 * T],
    [11 * T, 11 * T],
  ],
  plants: [
    { kind: 'spirit-herb', x: 7 * T, y: 12 * T },
    { kind: 'blood-berry', x: 30 * T, y: 12 * T },
    { kind: 'essence-root', x: 20 * T, y: 8 * T },
  ],
  chests: [
    { tier: 'rare', x: itemCol0 * T, y: itemRow0 * T },
    { tier: 'epic', x: (npcCol0 - 5) * T, y: (npcRow0 - 1) * T },
  ],
  mobs: [
    { kind: 'troll', x: 20 * T, y: 17 * T, maxCount: 4, radius: 250, respawnMs: 13000 },
    { kind: 'serpent', x: 7 * T, y: 9 * T, maxCount: 3, radius: 180, respawnMs: 11000 },
    { kind: 'golem', x: 30 * T, y: 9 * T, maxCount: 2, radius: 180, respawnMs: 20000, minLevel: 8 },
  ],
  triggers: [
    {
      id: 'gate-arrival',
      shape: { kind: 'rect', x: 13 * T, y: 23 * T, width: 14 * T, height: 6 * T },
      event: 'region',
      data: { text: 'Chân Núi · bến sông' },
      exit: true,
    },
    ...arenaTriggers(),
    {
      id: 'summit-approach',
      shape: { kind: 'circle', x: exitCol * T, y: exitRow * T, radius: 4 * T },
      event: 'notice',
      data: { text: 'Đại Điện Ngũ Hành · linh khí dày đặc' },
    },
    {
      id: 'cave-mouth',
      shape: { kind: 'circle', x: caveCol0 * T, y: caveRow0 * T, radius: 2.5 * T },
      event: 'notice',
      data: { text: 'Huyền Động · khu vực chưa mở khoá' },
    },
  ],
  portals: [
    {
      x: exitCol * T + T / 2,
      y: exitRow * T + T,
      to: 'ngoai-mon',
      spawn: { x: 320, y: 900 },
      label: 'Ngoại môn luyện địa',
    },
  ],
};
