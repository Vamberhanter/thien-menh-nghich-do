// Builds the game-ready Huyết Lang atlas out of his eleven concept strips.
//   node tools/build-huyetlang-atlas.mjs
//
// This replaces an earlier builder that stamped every pose into one fixed
// 160x192 box. That box has to be big enough for the widest thing on the
// sheets — a magma crescent reaching 200px off his shoulder — and no box that
// small ever was, so the crescents, the greatsword and the roar pillars were
// all sliced off at the frame edge.
//
// So this follows the Như Yên builder instead: every output file gets its own
// frame box, measured from the art it actually holds, and each frame carries a
// normalised `anchor` on the point he stands on. Phaser re-applies that pivot
// on every animation frame (AnimationState.updateFrame -> setOrigin), so a
// 150x150 idle frame and a 430x260 attack frame still stand on the same spot,
// and nothing needs clipping to fit. See tools/extract-huyetlang.mjs for the
// inventory, the backdrop knockout and the anchor rules.
//
// Facing left is `flipX` on the right-facing art at runtime, so only the unique
// frame sets are baked — see src/game/animations/huyetLangAnimations.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { packFrames } from './atlas-pack.mjs';
import { SHEET_DIR, SHEETS, analyseSheet, cutFrame, frameExtent, isMagma } from './extract-huyetlang.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Output goes in its own folder; the strips it is built from stay untouched. */
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'huyetlang', 'atlas');

const SOURCE_FILES = new Set(Object.values(SHEETS).map((s) => join(SHEET_DIR, s.file)));

function assertNotSource(path) {
  if (SOURCE_FILES.has(resolve(path))) {
    throw new Error(`refusing to overwrite the source strip ${path}`);
  }
  return path;
}

/** Breathing room around the art inside each frame box. */
const PAD = 3;

const range = (row, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `r${row}c${from + i}`);

/**
 * Baked clips.
 *
 * `anchor` picks which of the anchors the extractor measured this clip stands
 * on. `stance` is the paw-span midpoint at floor level, right for a one-shot
 * pose that plants its weight; `cycle` is that same point with the sideways
 * snapping taken out by aligning the frames of a row to each other, which is
 * what a looping gait needs; `ground` and `centre` are for art with no paws
 * under it.
 *
 * `breathe` turns a single drawn portrait into an N-frame idle, and `dissolve`
 * appends fade-out frames to a death. Both are noted where they are used.
 */
const CLIPS = [
  // --- idle: one portrait per facing, so the loop is synthesised -----------
  { name: 'idle_down', sheet: 'idleDown', frames: ['r0c0'], anchor: 'stance', breathe: 4 },
  { name: 'idle_up', sheet: 'idleUp', frames: ['r0c0'], anchor: 'stance', breathe: 4 },
  { name: 'idle_right', sheet: 'idleRight', frames: ['r0c0'], anchor: 'stance', breathe: 4 },

  // --- walk 6 frames per facing; `side` is drawn facing right --------------
  { name: 'walk_down', sheet: 'walkDown', frames: range(0, 0, 5), anchor: 'cycle' },
  { name: 'walk_up', sheet: 'walkUp', frames: range(0, 0, 5), anchor: 'cycle' },
  { name: 'walk_side', sheet: 'walkRight', frames: range(0, 0, 5), anchor: 'cycle' },

  // --- Tam Thủ Liệt Trảm, the three-hit chain ------------------------------
  // Only two swings were drawn: an overhead chop from the front and a sweep
  // from the side. All three chain steps replay them; facing up borrows the
  // side art, the way Như Yên's later combo steps do.
  { name: 'atk_front', sheet: 'atkDown', frames: range(0, 0, 3), anchor: 'stance' },
  { name: 'atk_side', sheet: 'atkRight', frames: range(0, 0, 3), anchor: 'stance' },

  // --- Tam Thủ Hống: four frames of charge, two of the ground slam ---------
  { name: 'cast_front', sheet: 'skillDown', frames: range(0, 0, 5), anchor: 'stance' },

  // --- hurt / death: one facing only, as drawn ----------------------------
  { name: 'hurt', sheet: 'hurt', frames: range(0, 0, 2), anchor: 'stance' },
  {
    name: 'death',
    sheet: 'hurt',
    frames: ['r1c0', 'r1c1', 'r1c2'],
    anchor: 'stance',
    dissolve: 2,
  },

  // --- effects. The crescent spins, so it hangs off its centre; the pillars
  //     grow out of the ground, so they hang off their base ---------------
  { name: 'fx_crescent', sheet: 'fx', frames: ['r0c0'], anchor: 'centre' },
  { name: 'fx_pillar', sheet: 'fx', frames: ['r0c1', 'r0c2'], anchor: 'ground' },
];

/** One output PNG per group; every clip inside a group shares its frame box. */
const FILES = [
  { file: 'huyetlang-idle.png', match: /^idle_/ },
  { file: 'huyetlang-walk.png', match: /^walk_/ },
  { file: 'huyetlang-attack.png', match: /^atk_/ },
  { file: 'huyetlang-skill.png', match: /^cast_/ },
  { file: 'huyetlang-hurt.png', match: /^(hurt|death)$/ },
  { file: 'huyetlang-fx.png', match: /^fx_crescent$/ },
  { file: 'huyetlang-fx-magma.png', match: /^fx_pillar$/ },
];

/* ------------------------------------------------------------ frame recipes */

/**
 * Turns one drawn portrait into an idle loop.
 *
 * He is a slab of armour, so there is no cloth or hair to move: the loop is a
 * 1px lift of the whole frame and a pulse on the magma running through the
 * plate, which reads as a furnace idling rather than as a character breathing.
 * Lifting the whole frame rather than the torso alone avoids a seam, and 1px
 * against a 96px body is a shimmer, not a hop.
 */
const BREATHE = [
  { lift: 0, glow: 1 },
  { lift: 1, glow: 1.1 },
  { lift: 1, glow: 1.16 },
  { lift: 0, glow: 1.06 },
];

function breathe(base, step) {
  const { lift, glow } = BREATHE[step % BREATHE.length];
  const out = new Surface(base.width, base.height);
  for (let y = 0; y < base.height; y++) {
    const src = Math.min(base.height - 1, y + lift);
    for (let x = 0; x < base.width; x++) {
      const p = base.get(x, src);
      if (p[3] === 0) continue;
      out.set(
        x,
        y,
        glow === 1 || !isMagma(p[0], p[1], p[2])
          ? p
          : [
              Math.min(255, Math.round(p[0] * glow)),
              Math.min(255, Math.round(p[1] * glow)),
              Math.min(255, Math.round(p[2] * glow)),
              p[3],
            ],
      );
    }
  }
  return out;
}

/**
 * Fade-out frames for the death clip.
 *
 * The strip ends on him already breaking apart, so the tail is carried on:
 * pixels are dropped by a hash of their position — stable between frames, so
 * what has gone stays gone — and what is left drifts upward as ash.
 */
function dissolve(base, step, of) {
  const keep = 1 - (step + 1) / (of + 1);
  const rise = (step + 1) * 3;
  const out = new Surface(base.width, base.height);
  for (let y = 0; y < base.height; y++) {
    const src = Math.min(base.height - 1, y + rise);
    for (let x = 0; x < base.width; x++) {
      const p = base.get(x, src);
      if (p[3] === 0) continue;
      // cheap position hash in [0,1): deterministic, and fine-grained enough
      // that the holes read as embers rather than as a pattern
      const noise = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
      if (noise > keep) continue;
      out.set(x, y, [p[0], p[1], p[2], Math.round(p[3] * keep)]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------- build */

const sheets = {};
for (const key of Object.keys(SHEETS)) sheets[key] = analyseSheet(key);

const lookup = (clip, id) => {
  const frame = sheets[clip.sheet].frames.find((f) => f.id === id);
  if (!frame) throw new Error(`${clip.name}: source frame ${clip.sheet}/${id} not found`);
  return frame;
};

/**
 * Smallest box that holds every frame of every clip in the group.
 *
 * `half` takes the larger of the two sides because the side-facing clips are
 * mirrored at runtime, so a box that only fits the sword on the right would
 * clip it once flipped. `dissolve` frames drift upward, so the group has to
 * leave room for that too.
 */
function boxFor(clips) {
  let half = 0;
  let up = 0;
  let down = 0;
  for (const clip of clips) {
    const rise = clip.dissolve ? clip.dissolve * 3 : 0;
    for (const id of clip.frames) {
      const e = frameExtent(sheets[clip.sheet], lookup(clip, id), clip.anchor ?? 'stance');
      half = Math.max(half, e.left, e.right);
      up = Math.max(up, e.up + rise);
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
  // normalised pivot inside the untrimmed box — Phaser turns this into the
  // sprite's origin, and trimming does not move it
  const anchor = { x: AT.x / FRAME.w, y: AT.y / FRAME.h };

  for (const clip of clips) {
    const cut = clip.frames.map((id) =>
      cutFrame(sheets[clip.sheet], lookup(clip, id), FRAME, AT, {
        anchor: clip.anchor ?? 'stance',
        scale: sheets[clip.sheet].spec.scale,
      }),
    );

    const surfaces = clip.breathe
      ? Array.from({ length: clip.breathe }, (_, i) => breathe(cut[0], i))
      : [...cut];
    for (let i = 0; i < (clip.dissolve ?? 0); i++) {
      surfaces.push(dissolve(cut[cut.length - 1], i, clip.dissolve));
    }

    surfaces.forEach((surface, col) => {
      entries.push({ name: `${clip.name}_${col}`, surface, anchor });
    });
    manifest.push({ clip: clip.name, count: surfaces.length, file: spec.file });
  }

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
    `${spec.file.padEnd(24)} ${String(surface.width).padStart(5)}x${String(surface.height).padEnd(5)}` +
      ` box ${FRAME.w}x${FRAME.h} anchor ${AT.x},${AT.y}  ${frames.length} frames` +
      `  [${clips.map((c) => c.name).join(', ')}]`,
  );
}

const atlas = {
  textures,
  meta: {
    app: 'thien-menh-nghich-do/tools/build-huyetlang-atlas.mjs',
    version: '1.0',
    source: 'huyetlang/source/huyetlang-{idle,walk,atk,skill,hurt-death,fx}-*.png',
    note: 'per-file frame boxes; each frame carries a normalised anchor (paw-span stance, or ground/centre for effects)',
  },
};
writeFileSync(assertNotSource(join(OUT_DIR, 'huyetlang.json')), JSON.stringify(atlas, null, 2));

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0);
console.log(`\nhuyetlang.json       ${textures.length} textures, ${manifest.length} clips`);
console.log(`clips                ${manifest.map((m) => `${m.clip}(${m.count})`).join(' ')}`);
console.log(
  `texture budget       ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`,
);
