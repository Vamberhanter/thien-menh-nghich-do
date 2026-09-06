import type { ZoneDef } from './types';

const W = 2800;
const H = 2200;
const ARENA = { x: 2000, y: 1100, radius: 420 };

export const THANH_PHONG_COC: ZoneDef = {
  id: 'thanh-phong-coc',
  name: 'Thanh Phong Cốc',
  width: W,
  height: H,
  ground: 'forest',
  shrine: { x: 320, y: 1100 },
  waypoint: { x: 480, y: 1100 },
  arena: { ...ARENA, label: 'Sàn Phong Ma' },
  trees: [
    [200, 280], [420, 360], [680, 240], [920, 400], [1180, 300],
    [240, 700], [560, 780], [860, 640], [1120, 820],
    [200, 1500], [480, 1620], [820, 1480], [1160, 1700], [1480, 1560],
    [1800, 280], [2100, 360], [2400, 260], [2600, 480],
    [1760, 1800], [2080, 1900], [2420, 1760], [2680, 1960],
    [1400, 500], [1600, 900], [1320, 1300],
  ],
  rocks: [
    [ARENA.x - ARENA.radius - 60, ARENA.y - 120],
    [ARENA.x - ARENA.radius - 60, ARENA.y + 120],
    [ARENA.x + ARENA.radius + 40, ARENA.y],
    [700, 1000], [980, 1200], [1500, 700], [1680, 1400],
  ],
  stones: [],
  plants: [
    { kind: 'spirit-herb', x: 520, y: 480 },
    { kind: 'spirit-herb', x: 900, y: 1500 },
    { kind: 'earth-fruit', x: 1240, y: 560 },
    { kind: 'essence-root', x: 1560, y: 1680 },
  ],
  chests: [
    { tier: 'epic', x: 760, y: 1680 },
    { tier: 'legendary', x: 2400, y: 1600 },
  ],
  mobs: [
    { kind: 'serpent', x: 700, y: 600 },
    { kind: 'serpent', x: 980, y: 900 },
    { kind: 'drake', x: 1200, y: 700 },
    { kind: 'drake', x: 1100, y: 1400 },
    { kind: 'golem', x: 1500, y: 1000 },
    { kind: 'troll', x: 1600, y: 1500 },
    { kind: 'fire-drake', x: 1800, y: 600 },
    { kind: 'ember-golem', x: 1900, y: 1500 },
  ],
  boss: { x: ARENA.x, y: ARENA.y },
  portals: [
    {
      x: 120,
      y: 1100,
      to: 'rung-ngoai-mon',
      spawn: { x: 2100, y: 900 },
      label: 'Rừng ngoại môn',
    },
    {
      x: 120,
      y: 1400,
      to: 'huyet-ma-coc',
      spawn: { x: 600, y: 1600 },
      label: 'Huyết Ma Cốc',
    },
  ],
};
