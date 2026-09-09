// Builds the shared gameplay-effect atlas out of the hand-made sheets under
// source-art/gameplay that are *animations* rather than props.
//
//   node tools/build-fx-atlas.mjs
//
// `build-world-resources.mjs` already covers that folder, but it cuts single
// stills to individual PNGs with hand-written crop rectangles — right for a
// chest or a waypoint, wrong for a twenty-frame impact. An animation wants one
// packed texture and a frame table, which is what the character kits already
// have machinery for; this reuses it rather than growing a second kind.
//
// The output stays out of git with the rest of the staged art (see .gitignore)
// and reaches the game through Storage like every other atlas.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWebP } from './image-io.mjs';
import { packFrames } from './atlas-pack.mjs';
import { analyseSheet as analyseSheetFrames, cutFrame, frameExtent } from './sheet-frames.mjs';
import { decodePNG } from './png-decode.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'source-art', 'gameplay');
const OUT_DIR = join(ROOT, 'public', 'assets', 'fx', 'atlas');

/** Breathing room around the art inside each frame box. */
const PAD = 3;

/**
 * Inventory of the sheets, measured off the alpha profile rather than assumed.
 *
 * `phahoai` looks like a tidy 5x4 grid and is not one: the second row's art is
 * 286px tall against the first row's 252 because the debris throws higher than
 * its cell, and the last row is only 95. So the row bands are stated outright,
 * the way every character sheet here does it, and only the column count is left
 * to the cutter — which finds five clean gaps in each row.
 */
const SHEETS = {
  phahoai: {
    file: 'phahoai.png',
    rows: [
      [40, 291],
      [293, 578],
      [603, 817],
      [880, 974],
    ],
    cols: [5, 5, 5, 5],
    /**
     * Sized to the convention `GroundScars` already set — "1 is about 240px
     * across" — so a caller that asks for the same scale from either gets the
     * same size of hole. The drawn cells run 264-281px wide.
     */
    scale: 1.14,
    note: 'ground destruction: cracks -> debris -> dust -> settling',
  },
};

/**
 * Colour rules, and they are inverted from every other sheet in this project.
 *
 * The character art is near-black with a bright rim, so `isDark` there finds
 * boots. This sheet is the opposite — pale dust and rubble on nothing — and it
 * has no feet at all. Neither rule is used for an anchor here (the clips hang
 * off `ground`, the bottom of the art), but the segmentation engine wants them,
 * so they are honest about what this art is: everything visible is "body", and
 * only the darkest rock counts as dark.
 */
const RULES = {
  isDark: (r, g, b) => (r + g + b) / 3 < 70,
  isBody: (r, g, b) => (r + g + b) / 3 >= 20,
};

/**
 * Baked clips.
 *
 * One clip, twenty frames, read left to right and then top to bottom — the
 * sheet is a single escalation and cutting it into stages would only invent a
 * seam the art does not have.
 */
const range = (row, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `r${row}c${from + i}`);

const CLIPS = [
  {
    name: 'ground_break',
    sheet: 'phahoai',
    frames: [...range(0, 0, 4), ...range(1, 0, 4), ...range(2, 0, 4), ...range(3, 0, 4)],
    // The bottom of the art is the floor it opens out of, and none of these
    // frames has a body to stand on.
    anchor: 'ground',
  },
];

const FILES = [{ file: 'fx-ground.webp', match: /^ground_/ }];

/* ------------------------------------------------------------------- build */

const sheets = {};
for (const [key, spec] of Object.entries(SHEETS)) {
  const img = decodePNG(join(SOURCE_DIR, spec.file));
  sheets[key] = analyseSheetFrames({ dir: SOURCE_DIR, key, spec, rules: RULES, img });
}

const lookup = (clip, id) => {
  const frame = sheets[clip.sheet].frames.find((f) => f.id === id);
  if (!frame) throw new Error(`${clip.name}: khong thay frame ${clip.sheet}/${id}`);
  return frame;
};

/** Smallest box that holds every frame of every clip in the group. */
function boxFor(clips) {
  let half = 0;
  let up = 0;
  let down = 0;
  for (const clip of clips) {
    for (const id of clip.frames) {
      const e = frameExtent(sheets[clip.sheet], lookup(clip, id), clip.anchor ?? 'ground');
      half = Math.max(half, e.left, e.right);
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
  if (clips.length === 0) throw new Error(`${spec.file} khong khop clip nao`);

  const { frame: FRAME, at: AT } = boxFor(clips);
  const entries = [];

  for (const clip of clips) {
    clip.frames.forEach((id, index) => {
      const sheet = sheets[clip.sheet];
      entries.push({
        name: `${clip.name}_${index}`,
        surface: cutFrame(sheet, lookup(clip, id), FRAME, AT, {
          anchor: clip.anchor ?? 'ground',
          scale: sheet.spec.scale,
        }),
        anchor: { x: AT.x / FRAME.w, y: AT.y / FRAME.h },
      });
    });
    manifest.push({ clip: clip.name, count: clip.frames.length, file: spec.file });
  }

  const { surface, frames } = packFrames(entries);
  writeFileSync(join(OUT_DIR, spec.file), await encodeWebP(surface));
  textures.push({
    image: spec.file,
    format: 'RGBA8888',
    size: { w: surface.width, h: surface.height },
    scale: 1,
    frames,
  });
  console.log(
    `${spec.file.padEnd(20)} ${String(surface.width).padStart(5)}x${String(surface.height).padEnd(5)}` +
      ` box ${FRAME.w}x${FRAME.h} anchor ${AT.x},${AT.y}  ${frames.length} frames` +
      `  [${clips.map((c) => c.name).join(', ')}]`,
  );
}

writeFileSync(
  join(OUT_DIR, 'fx.json'),
  JSON.stringify(
    {
      textures,
      meta: {
        app: 'thien-menh-nghich-do/tools/build-fx-atlas.mjs',
        version: '1.0',
        source: 'source-art/gameplay/phahoai.png',
        note: 'shared gameplay effects; every frame carries a normalised ground anchor',
      },
    },
    null,
    2,
  ),
);

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0);
console.log(`\nfx.json               ${textures.length} textures, ${manifest.length} clips`);
console.log(
  `texture budget        ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`,
);
