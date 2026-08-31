// Builds the game-ready Lâm Uyên atlas out of the hand-made sheet.
//   node tools/build-lamuyen-atlas.mjs
//
// Frame inventory of public/assets/characters/lamuyen/lamuyen.png, as measured
// by tools/extract-lamuyen.mjs and checked by eye (r<row>c<col>):
//   row 0  front (down):  c0-c7 stance/walk, c8-c12 sword attack
//   row 1  back  (up):    c0-c7 stance/walk, c8-c12 sword attack
//   row 2  side  (left):  c0-c7 walk, c8-c11 attack, c12 faces right
//   row 3  side  (left):  c0-c8 walk, c9-c12 attack facing RIGHT
//   row 4  side  (right): c2-c3 qi beam, c4-c6 hurt, c8-c9 knocked down
//   row 5  side  (right): c0-c3 charge + beam, c4-c6 hurt, c9-c10 dissolving
//   row 6  mixed:         c0-c3 stances, c4-c7 hurt/kneel, c8-c9 death
//   row 7  mixed:         same shape as row 6 (kept as spare art)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { packFrames } from './atlas-pack.mjs';
import { analyseSheet, cutFrame } from './extract-lamuyen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'lamuyen');

/** Output frame box and the standing point inside it. */
export const FRAME = { w: 160, h: 144 };
export const ANCHOR = { x: 80, y: 126 };

const range = (row, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `r${row}c${from + i}`);

/**
 * Each entry is a list of source frames. `mirror` flips the art horizontally,
 * used where the sheet only drew one side.
 */
const ANIMATIONS = [
  // --- idle: 4 frames per direction ------------------------------------
  { name: 'idle_down', frames: range(0, 0, 3) },
  { name: 'idle_up', frames: range(1, 0, 3) },
  { name: 'idle_left', frames: range(2, 0, 3) },
  { name: 'idle_right', frames: range(2, 0, 3), mirror: true },

  // --- walk: 6 frames per direction ------------------------------------
  { name: 'walk_down', frames: range(0, 2, 7) },
  { name: 'walk_up', frames: range(1, 2, 7) },
  { name: 'walk_left', frames: range(2, 2, 7) },
  { name: 'walk_right', frames: range(2, 2, 7), mirror: true },

  // --- attack: 4 frames per direction; left and right are both drawn ---
  { name: 'attack_down', frames: range(0, 8, 11) },
  { name: 'attack_up', frames: range(1, 8, 11) },
  { name: 'attack_left', frames: range(2, 8, 11) },
  { name: 'attack_right', frames: range(3, 9, 12) },

  // --- skill "Hư Vô Kiếm Khí": charge -> beam, only drawn facing right --
  { name: 'skill_right', frames: ['r5c0', 'r5c1', 'r5c2', 'r5c3', 'r4c2', 'r4c3'] },
  {
    name: 'skill_left',
    frames: ['r5c0', 'r5c1', 'r5c2', 'r5c3', 'r4c2', 'r4c3'],
    mirror: true,
  },
  // no front/back cast art exists on the sheet: the side cast is reused
  { name: 'skill_down', frames: ['r5c0', 'r5c1', 'r5c2', 'r5c3', 'r4c2', 'r4c3'] },
  { name: 'skill_up', frames: ['r5c0', 'r5c1', 'r5c2', 'r5c3', 'r4c2', 'r4c3'], mirror: true },

  // --- hurt / death: direction agnostic --------------------------------
  { name: 'hurt', frames: ['r6c4', 'r6c5', 'r6c6'] },
  { name: 'death', frames: ['r6c5', 'r6c6', 'r6c7', 'r6c8', 'r6c9', 'r7c9'] },
];

/**
 * Skill effect art for the projectile, cropped from the qi that reaches past
 * the character. Only the crescent of r0c12 comes out whole: the long beam of
 * rows 4-5 runs off its own frame and into the neighbouring sprite on the
 * sheet, so it can only be cropped to a slab and is not worth shipping.
 */
const EFFECTS = [{ name: 'fx_slash', frames: ['r0c12'] }];

const SHEETS = [
  { file: 'lamuyen-idle.png', match: /^idle_/ },
  { file: 'lamuyen-walk.png', match: /^walk_/ },
  { file: 'lamuyen-attack.png', match: /^attack_/ },
  { file: 'lamuyen-skill.png', match: /^skill_/ },
  { file: 'lamuyen-hurt.png', match: /^hurt$/ },
  { file: 'lamuyen-death.png', match: /^death$/ },
];

/* ---------------------------------------------------------------- build */

const sheet = analyseSheet();
const byId = new Map(sheet.frames.map((f) => [`r${f.row}c${f.col}`, f]));

const lookup = (id) => {
  const frame = byId.get(id);
  if (!frame) throw new Error(`source frame ${id} not found in the sheet`);
  return frame;
};

// sanity: every frame must fit the output box around the standing point
let worst = { id: '', over: 0 };
for (const animation of ANIMATIONS) {
  for (const id of animation.frames) {
    const f = lookup(id);
    const over = Math.max(
      f.anchor.x - f.x - ANCHOR.x,
      f.x + f.w - 1 - f.anchor.x - (FRAME.w - ANCHOR.x),
      f.anchor.y - f.y - ANCHOR.y,
      f.y + f.h - 1 - f.anchor.y - (FRAME.h - ANCHOR.y),
    );
    if (over > worst.over) worst = { id, over };
  }
}
if (worst.over > 0)
  console.warn(`WARNING: ${worst.id} exceeds the frame box by ${worst.over}px`);

const textures = [];

for (const spec of SHEETS) {
  const animations = ANIMATIONS.filter((a) => spec.match.test(a.name));
  const entries = [];

  animations.forEach((animation) => {
    animation.frames.forEach((id, col) => {
      entries.push({
        name: `${animation.name}_${col}`,
        surface: cutFrame(sheet, lookup(id), FRAME, ANCHOR, { mirror: animation.mirror }),
      });
    });
  });

  // No per-frame anchor here: LinYuan keeps a plain centred origin and reads
  // the standing point from STANDING_POINT, which is a position inside the
  // untrimmed box — and trimming leaves that box's size reported unchanged.
  const { surface, frames } = packFrames(entries);

  writeFileSync(join(OUT_DIR, spec.file), encodePNG(surface));
  textures.push({
    image: spec.file,
    format: 'RGBA8888',
    size: { w: surface.width, h: surface.height },
    scale: 1,
    frames,
  });
  console.log(
    `${spec.file.padEnd(20)} ${surface.width}x${surface.height}  ${frames.length} frames`,
  );
}

/* ------------------------------------------------------- skill effects */

const FX = { w: 96, h: 96 };
{
  const rows = EFFECTS.map((effect) =>
    effect.frames.map((id) => beamCrop(lookup(id))),
  );
  const entries = [];
  rows.forEach((cuts, row) => {
    cuts.forEach((cut, col) => {
      entries.push({ name: `${EFFECTS[row].name}_${col}`, surface: cut });
    });
  });
  const { surface, frames } = packFrames(entries);
  writeFileSync(join(OUT_DIR, 'lamuyen-fx.png'), encodePNG(surface));
  textures.push({
    image: 'lamuyen-fx.png',
    format: 'RGBA8888',
    size: { w: surface.width, h: surface.height },
    scale: 1,
    frames,
  });
  console.log(
    `lamuyen-fx.png       ${surface.width}x${surface.height}  ${frames.length} frames`,
  );
}

const atlas = {
  textures,
  meta: {
    app: 'thien-menh-nghich-do/tools/build-lamuyen-atlas.mjs',
    version: '1.0',
    source: 'lamuyen.png (hand-made sheet, background removed procedurally)',
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'lamuyen.json'), JSON.stringify(atlas, null, 2));
console.log(`lamuyen.json         ${textures.length} textures`);

/* -------------------------------------------------------------- helpers */

/**
 * Crops the qi effect that reaches past the character: everything to the right
 * of the body, centred in its own box.
 */
function beamCrop(frame) {
  const { img, alpha, labels } = sheet;
  const bodyRight = bodyEdge(frame);
  const surface = new Surface(FX.w, FX.h);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = bodyRight + 3; x < frame.x + frame.w; x++) {
      const i = y * img.width + x;
      if (!alpha[i] || !frame.labels.has(labels[i]) || !isQi(i)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return surface;
  const ox = Math.round(FX.w / 2 - (minX + maxX) / 2);
  const oy = Math.round(FX.h / 2 - (minY + maxY) / 2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * img.width + x;
      if (!alpha[i] || !frame.labels.has(labels[i]) || !isQi(i)) continue;
      const s = i * 4;
      surface.set(x + ox, y + oy, [img.data[s], img.data[s + 1], img.data[s + 2], alpha[i]]);
    }
  }
  return surface;
}

/**
 * Qi pixels: bright and blue-tinted. Filters out the hazy dark aura the sheet
 * paints behind the beam, which would otherwise crop as a grey box.
 */
function isQi(index) {
  const s = index * 4;
  const r = sheet.img.data[s];
  const g = sheet.img.data[s + 1];
  const b = sheet.img.data[s + 2];
  return b > 90 && b - r > 30 && (r + g + b) / 3 > 55;
}

/** Right edge of the character's dark pixels — hair, boots, robe outline. */
function bodyEdge(frame) {
  const { img } = sheet;
  const isDark = (r, g, b) => (r + g + b) / 3 < 85 && b - r < 60;
  let right = frame.anchor.x;
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = frame.x + frame.w - 1; x > right; x--) {
      const s = (y * img.width + x) * 4;
      if (isDark(img.data[s], img.data[s + 1], img.data[s + 2]) && img.data[s + 3] > 0) {
        right = Math.max(right, x);
        break;
      }
    }
  }
  return right;
}
