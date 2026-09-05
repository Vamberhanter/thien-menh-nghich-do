import type { ZoneDef } from './types';

const W = 2400;
const H = 1800;

export const NGOAI_MON: ZoneDef = {
  id: 'ngoai-mon',
  name: 'Ngoại môn luyện địa',
  width: W,
  height: H,
  ground: 'grass',
  shrine: { x: W / 2, y: H / 2 + 40 },
  trees: [
    [630, 540], [780, 450], [960, 630], [1350, 480], [1620, 600],
    [570, 1050], [840, 1290], [1140, 1410], [1530, 1230], [1830, 990],
    [450, 720], [1980, 720], [1050, 360], [1470, 1530],
  ],
  rocks: [
    [720, 840], [1290, 960], [1710, 840], [990, 1050], [1500, 690], [780, 1500],
  ],
  stones: [
    [W / 2 + 190, H / 2],
    [W / 2 - 210, H / 2 + 90],
    [W / 2 + 60, H / 2 - 220],
  ],
  mobs: [
    { kind: 'wolf', x: 780, y: 720 },
    { kind: 'wolf', x: 1680, y: 780 },
    { kind: 'wolf', x: 900, y: 1260 },
    { kind: 'archer', x: 1500, y: 1140 },
    { kind: 'archer', x: 540, y: 960 },
    { kind: 'brute', x: 1860, y: 540 },
    { kind: 'wolf', x: 1200, y: 480 },
    { kind: 'wolf', x: 1080, y: 1560 },
  ],
  portals: [
    {
      x: 2200,
      y: 900,
      to: 'rung-ngoai-mon',
      spawn: { x: 180, y: 900 },
      label: 'Rừng ngoại môn',
    },
  ],
};
