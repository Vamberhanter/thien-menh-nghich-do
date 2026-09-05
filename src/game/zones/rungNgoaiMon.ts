import type { ZoneDef } from './types';

const W = 2400;
const H = 1800;

export const RUNG_NGOAI_MON: ZoneDef = {
  id: 'rung-ngoai-mon',
  name: 'Rừng ngoại môn',
  width: W,
  height: H,
  ground: 'forest',
  shrine: { x: 240, y: 900 },
  waypoint: { x: 420, y: 900 },
  trees: [
    [360, 360], [520, 480], [700, 300], [880, 420], [1100, 360],
    [400, 720], [640, 840], [860, 780], [1080, 900], [1300, 720],
    [480, 1200], [720, 1320], [960, 1180], [1220, 1380], [1480, 1200],
    [1600, 480], [1780, 600], [1960, 420], [1740, 960], [1980, 1080],
    [1560, 1500], [1800, 1380], [2100, 1500], [320, 1560], [2040, 720],
  ],
  rocks: [
    [600, 600], [1400, 540], [900, 1500], [1700, 1260], [420, 1020],
  ],
  stones: [],
  plants: [
    { kind: 'spirit-herb', x: 560, y: 340 },
    { kind: 'spirit-herb', x: 920, y: 620 },
    { kind: 'blood-berry', x: 460, y: 1380 },
    { kind: 'blood-berry', x: 1180, y: 1040 },
    { kind: 'earth-fruit', x: 1460, y: 420 },
    { kind: 'earth-fruit', x: 1840, y: 1160 },
    { kind: 'essence-root', x: 1320, y: 1500 },
    { kind: 'essence-root', x: 2080, y: 1320 },
  ],
  chests: [
    { tier: 'rare', x: 760, y: 1560 },
    { tier: 'epic', x: 1460, y: 920 },
    { tier: 'legendary', x: 2080, y: 300 },
  ],
  // Forest species, getting heavier towards the Huyết Ma Cốc gate in the east.
  mobs: [
    { kind: 'toad', x: 620, y: 540 },
    { kind: 'toad', x: 840, y: 660 },
    { kind: 'serpent', x: 1100, y: 520 },
    { kind: 'serpent', x: 700, y: 1100 },
    { kind: 'serpent', x: 980, y: 1320 },
    { kind: 'drake', x: 1500, y: 600 },
    { kind: 'drake', x: 1680, y: 840 },
    { kind: 'drake', x: 1320, y: 1200 },
    { kind: 'troll', x: 1860, y: 1260 },
    { kind: 'golem', x: 1740, y: 480 },
    { kind: 'troll', x: 1560, y: 1500 },
    { kind: 'golem', x: 2040, y: 900 },
  ],
  portals: [
    {
      x: 120,
      y: 900,
      to: 'ngoai-mon',
      spawn: { x: 2100, y: 900 },
      label: 'Ngoại môn luyện địa',
    },
    {
      x: 2220,
      y: 900,
      to: 'huyet-ma-coc',
      spawn: { x: 260, y: 1600 },
      label: 'Huyết Ma Cốc',
    },
  ],
};
