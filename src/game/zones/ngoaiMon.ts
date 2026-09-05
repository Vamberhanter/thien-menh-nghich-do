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
  waypoint: { x: W / 2 + 170, y: H / 2 + 70 },
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
  plants: [
    { kind: 'spirit-herb', x: 540, y: 620 },
    { kind: 'spirit-herb', x: 920, y: 1180 },
    { kind: 'spirit-herb', x: 1770, y: 700 },
    { kind: 'blood-berry', x: 700, y: 1320 },
    { kind: 'blood-berry', x: 1570, y: 1050 },
    { kind: 'earth-fruit', x: 1900, y: 1320 },
  ],
  chests: [
    { tier: 'common', x: 420, y: 360 },
    { tier: 'common', x: 2040, y: 1470 },
    { tier: 'rare', x: 2040, y: 360 },
  ],
  // Training ground: only the two starter species, so nothing here outranges or
  // outlasts a fresh character.
  mobs: [
    { kind: 'toad', x: 780, y: 720 },
    { kind: 'toad', x: 1680, y: 780 },
    { kind: 'toad', x: 900, y: 1260 },
    { kind: 'crab', x: 1500, y: 1140 },
    { kind: 'crab', x: 540, y: 960 },
    { kind: 'crab', x: 1860, y: 540 },
    { kind: 'toad', x: 1200, y: 480 },
    { kind: 'toad', x: 1080, y: 1560 },
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
