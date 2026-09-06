import type { FarmDecorDef, FarmPlotDef, ZoneDef } from './types';

const W = 2400;
const H = 1800;

/** Continuous tilled field bounds (inclusive pad grid). */
const FIELD = {
  left: 960,
  right: 1440,
  top: 800,
  bottom: 1200,
  pad: 48,
  plotCols: 3,
  plotRows: 4,
  plotGapX: 120,
  plotGapY: 88,
  originX: 1080,
  originY: 860,
} as const;

/** Dense tree ring — leave a north gap for the portal road. */
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

  // Path from portal down to the north gate
  for (let y = 220; y <= FIELD.top - 20; y += FIELD.pad) {
    decor.push({ kind: 'path', x: 1200, y });
  }
  // Short path into the field
  for (let y = FIELD.top; y <= FIELD.top + FIELD.pad * 2; y += FIELD.pad) {
    decor.push({ kind: 'path', x: 1200, y });
  }

  // Continuous tilled soil under the whole court
  for (let y = FIELD.top; y <= FIELD.bottom; y += FIELD.pad) {
    for (let x = FIELD.left; x <= FIELD.right; x += FIELD.pad) {
      decor.push({ kind: 'soil-pad', x, y });
    }
  }

  // Fence around the field — gap at north centre for the gate
  const left = FIELD.left - 48;
  const right = FIELD.right + 48;
  const top = FIELD.top - 40;
  const bottom = FIELD.bottom + 40;
  for (let x = left; x <= right; x += 48) {
    if (Math.abs(x - 1200) >= 56) {
      decor.push({ kind: 'fence-h', x, y: top });
    }
    decor.push({ kind: 'fence-h', x, y: bottom });
  }
  for (let y = top + 48; y < bottom; y += 48) {
    decor.push({ kind: 'fence-v', x: left, y });
    decor.push({ kind: 'fence-v', x: right, y });
  }
  decor.push({ kind: 'fence-post', x: left, y: top });
  decor.push({ kind: 'fence-post', x: right, y: top });
  decor.push({ kind: 'fence-post', x: left, y: bottom });
  decor.push({ kind: 'fence-post', x: right, y: bottom });

  decor.push({ kind: 'house', x: 720, y: 1000 });
  decor.push({ kind: 'chicken', x: 800, y: 1100 });
  decor.push({ kind: 'chicken', x: 840, y: 1140 });
  decor.push({ kind: 'chicken', x: 760, y: 1160 });
  decor.push({ kind: 'chicken', x: 820, y: 1180 });

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
    [900, 400], [1500, 400], [1200, 1500],
  ],
  // Wild herbs outside the fence only
  plants: [
    { kind: 'spirit-herb', x: 560, y: 640 },
    { kind: 'spirit-herb', x: 1840, y: 640 },
    { kind: 'spirit-herb', x: 500, y: 1300 },
    { kind: 'spirit-herb', x: 1900, y: 1300 },
    { kind: 'blood-berry', x: 580, y: 900 },
    { kind: 'blood-berry', x: 1820, y: 900 },
    { kind: 'earth-fruit', x: 600, y: 1480 },
    { kind: 'earth-fruit', x: 1800, y: 1480 },
    { kind: 'essence-root', x: 860, y: 1400 },
    { kind: 'essence-root', x: 1540, y: 1400 },
  ],
  farmPlots: farmPlots(),
  farmDecor: farmDecor(),
  chests: [
    { tier: 'common', x: 860, y: 720 },
    { tier: 'common', x: 1540, y: 720 },
    { tier: 'rare', x: 1200, y: 1320 },
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
