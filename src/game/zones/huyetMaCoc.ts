import type { ZoneDef } from './types';

const W = 4200;
const H = 3200;
const ARENA = { x: 2860, y: 1600, radius: 560 };

/** Rock ring around the court. `gap` is an open arc (west = Math.PI) so the path can enter. */
function ring(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  jitter = 28,
  gap = { center: Math.PI, width: 0.72 },
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const delta = Math.abs(Math.atan2(Math.sin(a - gap.center), Math.cos(a - gap.center)));
    if (delta < gap.width / 2) continue;
    const r = radius + ((i % 3) - 1) * jitter;
    out.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
  }
  return out;
}

export const HUYET_MA_COC: ZoneDef = {
  id: 'huyet-ma-coc',
  name: 'Huyết Ma Cốc',
  width: W,
  height: H,
  ground: 'ash',
  shrine: { x: 380, y: 1600 },
  arena: { ...ARENA, label: 'Sàn Huyết Ma' },
  trees: [
    [220, 420], [480, 280], [760, 360], [1100, 240], [1480, 320],
    [200, 720], [560, 640], [920, 580], [1280, 700],
    [180, 2200], [520, 2360], [880, 2480], [1240, 2320], [1680, 2520],
    [240, 2800], [640, 2920], [1080, 2860], [1520, 2980],
    [3800, 360], [3960, 720], [4040, 1100], [3980, 2100], [3880, 2600], [4060, 2920],
    [2100, 180], [2480, 220], [3200, 200], [3600, 280],
    [2140, 3000], [2580, 3080], [3320, 3020], [3720, 2940],
  ],
  rocks: [
    ...ring(ARENA.x, ARENA.y, ARENA.radius + 70, 20, 22),
    [ARENA.x - ARENA.radius - 80, ARENA.y - 150],
    [ARENA.x - ARENA.radius - 80, ARENA.y + 150],
    [680, 1460], [900, 1740], [1080, 1520], [1220, 1780],
    [1500, 1360], [1640, 1840], [1880, 1480], [2000, 1760],
    [720, 980], [980, 2200], [1340, 1040], [1540, 2280],
  ],
  stones: [],
  mobs: [
    { kind: 'brute', x: 720, y: 1480 },
    { kind: 'brute', x: 780, y: 1740 },
    { kind: 'brute', x: 1680, y: 1520 },
    { kind: 'brute', x: 1760, y: 1720 },
    { kind: 'archer', x: 1100, y: 1360 },
    { kind: 'archer', x: 1180, y: 1880 },
    { kind: 'archer', x: 2040, y: 1400 },
    { kind: 'archer', x: 2100, y: 1820 },
    { kind: 'wolf', x: 980, y: 1600 },
    { kind: 'wolf', x: 1460, y: 1580 },
    { kind: 'wolf', x: 1920, y: 1640 },
  ],
  boss: { x: ARENA.x, y: ARENA.y },
  portals: [
    {
      x: 160,
      y: 1600,
      to: 'rung-ngoai-mon',
      spawn: { x: 2100, y: 900 },
      label: 'Rừng ngoại môn',
    },
  ],
};
