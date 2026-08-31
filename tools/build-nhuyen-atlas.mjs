// Builds the game-ready Như Yên atlas out of her five hand-made sheets.
//   node tools/build-nhuyen-atlas.mjs
//
// Source inventory, measured by tools/extract-nhuyen.mjs and checked against a
// zoomed dump (`npm run dump:nhuyen`):
//
//   idle          r0 down          r1 up            r2 right        r3 left
//   walk&run      r0 walk down     r1 walk up       r2 walk right   r3 RUN right
//   attack        r0 side slash c0-c5
//                 r1 c0-c1 follow-through, c2 overhead raise, c3 chop, c4 spin,
//                    c5 crescent FX only
//                 r2 c0-c4 front-facing thrust, c5 ice-shard FX only
//   skill         r0 c0-c3 channel, r1 c0-c1 vortex peak,
//                 r1 c2-c3 ice eruption FX only
//   hurt&death    r0 hurt (3), r1 knocked down (5), r2 lying + dissolve (6)
//
// Two things differ from the Lâm Uyên builder:
//
//  * Only the *unique* frame sets are baked. Facing left reuses the right-hand
//    art through `flipX` at runtime (see src/game/animations/nhuYenAnimations.ts),
//    which halves the biggest sheets. The idle rows are the exception — the
//    artist drew both sides, so both are kept.
//  * Every output file gets its own frame box, sized to the art it holds, and
//    each frame carries a normalised `anchor`. Phaser re-applies that pivot on
//    every animation frame (AnimationState.updateFrame -> setOrigin), so a
//    104x128 idle frame and a 366x282 channel frame still stand on the same
//    spot. A single box big enough for the ice vortex would have quadrupled the
//    texture memory and the fill cost of every idle frame.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { packFrames } from './atlas-pack.mjs';
import { SHEET_DIR, SHEETS, analyseSheet, cutFrame, frameExtent } from './extract-nhuyen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Output lives in its own directory, NOT next to the sheets.
 *
 * The source sheets are already named `nhuyen-idle.png`, `nhuyen-skill.png`, …
 * so writing per-action sheets beside them (the way the Lâm Uyên builder does,
 * where the single source is `lamuyen.png`) silently overwrites the hand-made
 * art. `assertNotSource` below is the belt to this braces.
 */
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'nhuyen', 'atlas');

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
 * Baked clips. `anchor` picks which of the anchors the extractor measured
 * (feet / cycle / ground / centre) this clip should stand on; `feet` by default.
 *
 * Every looping in-place animation uses `cycle`: anchoring a walk on the lowest
 * foot makes the sprite snap sideways as the planted foot alternates, which on
 * the side rows is a 40px skid per step.
 */
const CLIPS = [
  // --- idle: the sheet drew all four facings, so none is mirrored ---------
  { name: 'idle_down', sheet: 'idle', frames: range(0, 0, 3), anchor: 'cycle' },
  { name: 'idle_up', sheet: 'idle', frames: range(1, 0, 3), anchor: 'cycle' },
  { name: 'idle_right', sheet: 'idle', frames: range(2, 0, 3), anchor: 'cycle' },
  { name: 'idle_left', sheet: 'idle', frames: range(3, 0, 3), anchor: 'cycle' },

  // --- walk 7 frames per facing; `side` is drawn facing right -------------
  { name: 'walk_down', sheet: 'walk', frames: range(0, 0, 6), anchor: 'cycle' },
  { name: 'walk_up', sheet: 'walk', frames: range(1, 0, 6), anchor: 'cycle' },
  { name: 'walk_side', sheet: 'walk', frames: range(2, 0, 6), anchor: 'cycle' },
  // the sprint row: longer stride, forward lean. Only drawn from the side.
  { name: 'run_side', sheet: 'walk', frames: range(3, 0, 6), anchor: 'cycle' },

  // --- Hàn Băng Tam Thức, the three-hit sword combo ----------------------
  // hit 1 has real front-facing art; hits 2 and 3 only exist from the side
  { name: 'atk1_front', sheet: 'attack', frames: range(2, 0, 3) },
  { name: 'atk1_side', sheet: 'attack', frames: range(0, 1, 4) },
  { name: 'atk2_side', sheet: 'attack', frames: ['r0c5', 'r1c0', 'r1c1'] },
  { name: 'atk3_side', sheet: 'attack', frames: ['r1c2', 'r1c3', 'r1c4'] },

  // --- Băng Tinh Trận: stance -> gather -> sweep -> vortex -> peak --------
  {
    name: 'cast_side',
    sheet: 'skill',
    frames: ['r0c0', 'r0c1', 'r0c2', 'r0c3', 'r1c0', 'r1c1'],
  },

  // --- hurt / death: no facing, the sheet only drew one side --------------
  { name: 'hurt', sheet: 'hurt', frames: range(0, 0, 2) },
  {
    name: 'death',
    sheet: 'hurt',
    frames: [...range(1, 0, 4), ...range(2, 0, 5)],
  },

  // --- effects. Projectiles spin, so they hang off their centre; the ice
  //     eruption grows out of the ground, so it hangs off its base ---------
  { name: 'fx_crescent', sheet: 'attack', frames: ['r1c5'], anchor: 'centre' },
  { name: 'fx_shards', sheet: 'attack', frames: ['r2c5'], anchor: 'centre' },
  { name: 'fx_eruption', sheet: 'skill', frames: ['r1c2', 'r1c3'], anchor: 'ground' },
];

/** One output PNG per group; every clip inside a group shares its frame box. */
const FILES = [
  { file: 'nhuyen-idle.png', match: /^idle_/ },
  { file: 'nhuyen-walk.png', match: /^(walk|run)_/ },
  { file: 'nhuyen-attack.png', match: /^atk\d_/ },
  { file: 'nhuyen-skill.png', match: /^cast_/ },
  { file: 'nhuyen-hurt.png', match: /^(hurt|death)$/ },
  { file: 'nhuyen-fx.png', match: /^fx_(crescent|shards)$/ },
  { file: 'nhuyen-fx-ice.png', match: /^fx_eruption$/ },
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
      ` box ${FRAME.w}x${FRAME.h} anchor ${AT.x},${AT.y}  ${frames.length} frames` +
      `  [${clips.map((c) => c.name).join(', ')}]`,
  );
}

const atlas = {
  textures,
  meta: {
    app: 'thien-menh-nghich-do/tools/build-nhuyen-atlas.mjs',
    version: '1.0',
    source: 'nhuyen-{idle,walk&run,attack,skill,hurt&death}.png',
    note: 'per-file frame boxes; each frame carries a normalised anchor (feet, or centre/base for effects)',
  },
};
writeFileSync(assertNotSource(join(OUT_DIR, 'nhuyen.json')), JSON.stringify(atlas, null, 2));

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0);
console.log(`\nnhuyen.json          ${textures.length} textures, ${manifest.length} clips`);
console.log(`texture budget       ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`);
