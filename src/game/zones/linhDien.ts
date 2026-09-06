import type { FarmDecorDef, FarmPlotDef, ZoneDef } from './types';

const W = 2400;
const H = 1800;

/**
 * One continuous dirt court + a shared 48px grid for fence / plots.
 * Road to the gate is a single TileSprite (`farmPath`), not stamped tiles.
 */
const PAD = 48;
const PATH_W = 56;
const FIELD = {
  left: 960,
  right: 1440,
  top: 800,
  bottom: 1184,
  pad: PAD,
  plotCols: 3,
  plotRows: 4,
  plotGapX: PAD * 3,
  plotGapY: PAD * 2,
  originX: 1056,
  originY: 896,
  gateX: 1200,
} as const;

const FARM_BED = {
  x: FIELD.left - PAD / 2,
  y: FIELD.top - PAD,
  width: FIELD.right - FIELD.left + PAD,
  height: FIELD.bottom - FIELD.top + PAD,
} as const;

/** Portal → into the court: continuous strip centred on the gate. */
const FARM_PATH = {
  x: FIELD.gateX - PATH_W / 2,
  y: 168,
  width: PATH_W,
  /** Reach ~3 pads into the tilled bed so the gate reads as an entrance. */
  height: FARM_BED.y + PAD * 3 - 168,
} as const;

function treeRing(): Array<[number, number]> {
  const trees: Array<[number, number]> = [];
  for (let x = 180; x <= W - 180; x += 140) {
    if (x > 900 && x < 1500) continue;
    trees.push([x, 200]);
  }
  for (let x = 160; x <= W - 160; x += 150) {
    trees.push([x, H - 160]);
  }
  for (let y = 280; y <= H - 220; y += 150) {
    trees.push([160, y]);
    trees.push([W - 160, y]);
  }
  const inner: Array<[number, number]> = [
    [520, 520], [680, 460], [1720, 460], [1880, 520],
    [480, 720], [1920, 720], [440, 980], [1960, 980],
    [500, 1240], [700, 1340], [1700, 1340], [1900, 1240],
    [620, 1500], [900, 1580], [1500, 1580], [1780, 1500],
    [780, 580], [1620, 580], [820, 1480], [1580, 1480],
  ];
  trees.push(...inner);
  return trees;
}

function farmPlots(): FarmPlotDef[] {
  const plots: FarmPlotDef[] = [];
  let index = 0;
  for (let row = 0; row < FIELD.plotRows; row++) {
    for (let col = 0; col < FIELD.plotCols; col++) {
      index += 1;
      plots.push({
        id: `plot-${index}`,
        x: FIELD.originX + col * FIELD.plotGapX,
        y: FIELD.originY + row * FIELD.plotGapY,
      });
    }
  }
  return plots;
}

function farmDecor(): FarmDecorDef[] {
  const decor: FarmDecorDef[] = [];

  const left = FIELD.left - FIELD.pad;
  const right = FIELD.right + FIELD.pad;
  const top = FIELD.top - FIELD.pad;
  const bottom = FIELD.bottom + FIELD.pad;
  const gateHalf = PATH_W / 2 + 8;

  for (let x = left; x <= right; x += FIELD.pad) {
    // North fence opens for the road.
    if (Math.abs(x - FIELD.gateX) >= gateHalf) {
      decor.push({ kind: 'fence-h', x, y: top });
    }
    decor.push({ kind: 'fence-h', x, y: bottom });
  }
  for (let y = top + FIELD.pad; y < bottom; y += FIELD.pad) {
    decor.push({ kind: 'fence-v', x: left, y });
    decor.push({ kind: 'fence-v', x: right, y });
  }
  decor.push({ kind: 'fence-post', x: left, y: top });
  decor.push({ kind: 'fence-post', x: right, y: top });
  decor.push({ kind: 'fence-post', x: left, y: bottom });
  decor.push({ kind: 'fence-post', x: right, y: bottom });
  // Gate posts frame the entrance.
  decor.push({ kind: 'fence-post', x: FIELD.gateX - gateHalf, y: top });
  decor.push({ kind: 'fence-post', x: FIELD.gateX + gateHalf, y: top });

  decor.push({ kind: 'house', x: 720, y: 1008 });
  decor.push({ kind: 'chicken', x: 816, y: 1104 });
  decor.push({ kind: 'chicken', x: 864, y: 1152 });
  decor.push({ kind: 'chicken', x: 768, y: 1152 });
  decor.push({ kind: 'chicken', x: 816, y: 1200 });

  return decor;
}

export const LINH_DIEN: ZoneDef = {
  id: 'linh-dien',
  name: 'Linh Điền',
  width: W,
  height: H,
  ground: 'grass',
  shrine: { x: W / 2 - 160, y: 300 },
  waypoint: { x: W / 2 + 160, y: 300 },
  trees: treeRing(),
  rocks: [
    [420, 400], [1980, 400], [360, 1100], [2040, 1100], [560, 1600], [1840, 1600],
  ],
  stones: [
    [900, 400], [1500, 400], [1200, 1536],
  ],
  plants: [
    { kind: 'spirit-herb', x: 560, y: 640 },
    { kind: 'spirit-herb', x: 1840, y: 640 },
    { kind: 'spirit-herb', x: 500, y: 1300 },
    { kind: 'spirit-herb', x: 1900, y: 1300 },
    { kind: 'blood-berry', x: 576, y: 912 },
    { kind: 'blood-berry', x: 1824, y: 912 },
    { kind: 'earth-fruit', x: 600, y: 1488 },
    { kind: 'earth-fruit', x: 1800, y: 1488 },
    { kind: 'essence-root', x: 864, y: 1392 },
    { kind: 'essence-root', x: 1536, y: 1392 },
  ],
  farmBed: { ...FARM_BED },
  farmPath: { ...FARM_PATH },
  farmPlots: farmPlots(),
  farmDecor: farmDecor(),
  chests: [
    // Nestled by the fence corners — off the road and tilled court.
    { tier: 'common', x: 912, y: 768 },
    { tier: 'common', x: 1488, y: 768 },
    { tier: 'rare', x: 1200, y: 1296 },
  ],
  mobs: [],
  portals: [
    {
      x: 1200,
      y: 120,
      to: 'ngoai-mon',
      spawn: { x: 1200, y: 1580 },
      label: 'Ngoại môn luyện địa',
    },
  ],
};
