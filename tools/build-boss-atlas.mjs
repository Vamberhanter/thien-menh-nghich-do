// Builds the game-ready Boss 1 atlas out of its five hand-made sheets.
//   node tools/build-boss-atlas.mjs
//
// Source inventory, measured by tools/extract-boss.mjs and checked against a
// zoomed dump (`npm run dump:boss`). Facings were not guessed: they come from
// comparing the red eyes' centroid against the white hair's centroid per frame
// (see `npm run facing:boss`).
//
//   idle2       r0 c0-c3 front idle, r1 c0-c3 front poses (orb, sword planted)
//   walk2       r0 walk down, r1 walk RIGHT, r2 walk LEFT, r3 walk up (8 each)
//   attack2     r0-r2 side slashes and lunges (cut lines unreliable where the
//               crescents merge cells), r3 c0-c3 overhead swing facing RIGHT,
//               r4 effect-only: c0-c2 bolt, c3-c5 ground bursts
//   skill2      r0 c0 ground rune + tendrils (front), c1-c3 orb cast facing
//               RIGHT, c4-c6 bolt/burst FX; r2 c0-c3 winged form (front);
//               r3-r4 effect-only
//   hurt&death  r0 hurt (5), r1 death (5)
//
// Same two rules as the Như Yên builder: only unique frame sets are baked, and
// every output file gets its own frame box with a normalised per-frame anchor,
// so a 200px idle frame and a 540px winged nova still stand on the same spot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { packFrames } from './atlas-pack.mjs';
import { SHEET_DIR, SHEETS, analyseSheet, cutFrame, frameExtent } from './extract-boss.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'boss', 'boss1', 'atlas');

const SOURCE_FILES = new Set(Object.values(SHEETS).map((s) => join(SHEET_DIR, s.file)));

function assertNotSource(path) {
  if (SOURCE_FILES.has(resolve(path))) {
    throw new Error(`refusing to overwrite the source sheet ${path}`);
  }
  return path;
}

/** Breathing room around the art inside each frame box. */
const PAD = 3;

const range = (row, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `r${row}c${from + i}`);

/**
 * Baked clips. `anchor` picks which anchor the extractor measured (feet /
 * cycle / ground / centre / cell) this clip stands on; `feet` by default.
 *
 * Looping in-place animations use `cycle`, which cancels the sideways snap of
 * the feet anchor latching onto alternating boots.
 */
const CLIPS = [
  // --- idle: front only; the sheet has no side or back idle --------------
  { name: 'idle_front', sheet: 'idle', frames: range(0, 0, 3), anchor: 'cycle' },

  // --- walk: all four facings are drawn, so nothing is mirrored ---------
  { name: 'walk_down', sheet: 'walk', frames: range(0, 0, 7), anchor: 'cycle' },
  { name: 'walk_right', sheet: 'walk', frames: range(1, 0, 7), anchor: 'cycle' },
  { name: 'walk_left', sheet: 'walk', frames: range(2, 0, 7), anchor: 'cycle' },
  { name: 'walk_up', sheet: 'walk', frames: range(3, 0, 7), anchor: 'cycle' },

  // --- melee: overhead swing into a crescent, drawn facing RIGHT --------
  { name: 'atk_side', sheet: 'attack', frames: range(3, 0, 3) },

  // --- Huyết Nhận (ranged bolt): gather an orb, then thrust it out ------
  { name: 'cast_side', sheet: 'skill', frames: ['r0c1', 'r0c2', 'r0c3'] },

  // --- Ma Dực Trận (nova): the rune opens, the wings unfold -------------
  {
    name: 'nova_front',
    sheet: 'skill',
    frames: ['r0c0', 'r2c0', 'r2c1', 'r2c2', 'r2c3'],
  },

  // --- hurt / death: no facing, the sheet only drew one side ------------
  { name: 'hurt', sheet: 'hurt', frames: range(0, 0, 4) },
  { name: 'death', sheet: 'hurt', frames: range(1, 0, 4) },

  // --- effects ---------------------------------------------------------
  // the bolt flies, so it hangs off its own centre
  { name: 'fx_bolt', sheet: 'attack', frames: range(4, 0, 2), anchor: 'centre' },
  { name: 'fx_crescent', sheet: 'skill', frames: ['r3c1'], anchor: 'centre' },
  // these erupt out of the ground, so they hang off their base
  { name: 'fx_burst', sheet: 'attack', frames: ['r4c3', 'r4c5'], anchor: 'ground' },
  { name: 'fx_ring', sheet: 'skill', frames: ['r4c0', 'r4c1'], anchor: 'ground' },
];

/** One output PNG per group; every clip inside a group shares its frame box. */
const FILES = [
  { file: 'boss1-idle.png', match: /^idle_/ },
  { file: 'boss1-walk.png', match: /^walk_/ },
  { file: 'boss1-attack.png', match: /^atk_/ },
  { file: 'boss1-cast.png', match: /^cast_/ },
  { file: 'boss1-nova.png', match: /^nova_/ },
  { file: 'boss1-hurt.png', match: /^(hurt|death)$/ },
  { file: 'boss1-fx.png', match: /^fx_(bolt|crescent)$/ },
  { file: 'boss1-fx-ground.png', match: /^fx_(burst|ring)$/ },
];

/* ------------------------------------------------------------------- build */

const sheets = {};
for (const key of Object.keys(SHEETS)) sheets[key] = analyseSheet(key);

const lookup = (clip, id) => {
  const frame = sheets[clip.sheet].frames.find((f) => f.id === id);
  if (!frame) throw new Error(`${clip.name}: source frame ${clip.sheet}/${id} not found`);
  return frame;
};

/** Smallest box that holds every frame of every clip in the group. */
function boxFor(clips) {
  let half = 0;
  let up = 0;
  let down = 0;
  for (const clip of clips) {
    for (const id of clip.frames) {
      const e = frameExtent(sheets[clip.sheet], lookup(clip, id), clip.anchor ?? 'feet');
      half = Math.max(half, e.left, e.right); // mirroring needs both sides
      up = Math.max(up, e.up);
      down = Math.max(down, e.down);
    }
  }
  const even = (n) => n + (n % 2);
  const frame = { w: even(2 * (half + PAD)), h: even(up + down + 2 * PAD) };
  return { frame, at: { x: frame.w / 2, y: up + PAD } };
}

mkdirSync(OUT_DIR, { recursive: true });

const textures = [];
const manifest = [];

for (const spec of FILES) {
  const clips = CLIPS.filter((c) => spec.match.test(c.name));
  if (clips.length === 0) throw new Error(`${spec.file} matched no clips`);

  const { frame: FRAME, at: AT } = boxFor(clips);
  const entries = [];

  clips.forEach((clip) => {
    clip.frames.forEach((id, col) => {
      const sheet = sheets[clip.sheet];
      entries.push({
        name: `${clip.name}_${col}`,
        surface: cutFrame(sheet, lookup(clip, id), FRAME, AT, {
          anchor: clip.anchor ?? 'feet',
          scale: sheet.spec.scale,
        }),
        // normalised pivot inside the untrimmed box — Phaser turns this into
        // the sprite's origin, and trimming does not move it
        anchor: { x: AT.x / FRAME.w, y: AT.y / FRAME.h },
      });
    });
    manifest.push({ clip: clip.name, count: clip.frames.length, file: spec.file });
  });

  const { surface, frames } = packFrames(entries);

  writeFileSync(assertNotSource(join(OUT_DIR, spec.file)), encodePNG(surface));
  textures.push({
    image: spec.file,
    format: 'RGBA8888',
    size: { w: surface.width, h: surface.height },
    scale: 1,
    frames,
  });
  console.log(
    `${spec.file.padEnd(20)} ${String(surface.width).padStart(5)}x${String(surface.height).padEnd(5)}` +
      ` box ${FRAME.w}x${FRAME.h} anchor ${AT.x},${AT.y}  ${frames.length} frames trimmed` +
      `  [${clips.map((c) => c.name).join(', ')}]`,
  );
}

const atlas = {
  textures,
  meta: {
    app: 'thien-menh-nghich-do/tools/build-boss-atlas.mjs',
    version: '1.0',
    source: 'boss1/{idle2,walk2,attack2,skill2,hurt & death2}.png',
    note: 'trimmed + shelf-packed; sourceSize/spriteSourceSize restore the original box, anchor is the feet pivot inside it',
  },
};
writeFileSync(assertNotSource(join(OUT_DIR, 'boss1.json')), JSON.stringify(atlas, null, 2));

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0);
console.log(`\nboss1.json           ${textures.length} textures, ${manifest.length} clips`);
console.log(`texture budget       ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`);
