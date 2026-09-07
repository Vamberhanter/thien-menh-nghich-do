// Cuts the Kiếm Tiên sheet into a feet-pivot Phaser atlas.
//   node tools/build-kiemtien-atlas.mjs [--dump]
//
// The source is one 1536x1024 sheet: four rows of eight, each row a walk cycle
// in one facing. Movement only — there is no attack, cast, hurt or death art
// yet, so this builds what exists and nothing more.
//
// Two things about this sheet shape the cutting:
//
//  * **Columns are found, not assumed.** The nominal cell is 192 wide, but the
//    sword crosses that line — in the up row a tip sits at x=192-193, two
//    pixels into the next cell — so a cut on the grid would clip a blade and
//    then paste its tip onto the neighbouring pose. Each row is split on its
//    own empty columns instead, which land in the gaps between poses and never
//    inside one. Rows do stay inside their 256-tall bands, so those are taken
//    as given, and both counts are checked rather than trusted.
//
//  * **Left and right are both kept.** The other kits draw one profile and
//    flip it, which is why their clips are named `_side`. These two rows are
//    separate drawings (163x189 against 149x180, and 25/255 mean difference
//    against a mirror), and mirroring either one would move the sword to the
//    wrong hand. So this atlas carries four facings and the animation module
//    never sets `flip`.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { decodePNG } from './png-decode.mjs';
import { packFrames } from './atlas-pack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public', 'assets', 'characters', 'kiemtien', 'kiemtien.png');
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'kiemtien', 'atlas');
const DUMP = process.argv.includes('--dump') ? join(ROOT, '.tmp', 'kiemtien-frames') : null;

const ROWS = 4;
const COLS = 8;
const ROW_HEIGHT = 256;
/** Breathing room around the pivot box, in pixels. */
const PAD = 12;
/** Below this the pixel is canvas, not art. The source is cleanly cut already. */
const ALPHA_FLOOR = 8;

/** Sheet row → facing. Row 0 shows the back of the head, row 1 the face. */
const FACINGS = ['up', 'down', 'left', 'right'];

/**
 * Idle is derived, not drawn.
 *
 * A character that stands perfectly still reads as a stuck frame rather than a
 * person, so the neutral pose of each walk — the frame whose feet are closest
 * together — is given a slow two-pixel bob. It is the cheapest honest idle:
 * every pixel is the artist's, and when a real idle sheet arrives this whole
 * function goes away with the clip definition that calls it.
 */
const IDLE_FRAMES = 4;
const IDLE_BOB = [0, 1, 2, 1];

function alphaAt(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
  return img.data[(y * img.width + x) * 4 + 3];
}

/** Empty-column split of one row band. Returns the 8 pose extents. */
function poseRuns(img, band) {
  const filled = new Uint8Array(img.width);
  for (let x = 0; x < img.width; x++) {
    for (let y = band.top; y < band.top + band.height; y++) {
      if (alphaAt(img, x, y) >= ALPHA_FLOOR) {
        filled[x] = 1;
        break;
      }
    }
  }
  const runs = [];
  let start = -1;
  for (let x = 0; x <= img.width; x++) {
    const on = x < img.width && filled[x] === 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      runs.push({ x0: start, x1: x - 1 });
      start = -1;
    }
  }
  return runs;
}

function cut(img, x0, x1, top, height) {
  const out = new Surface(x1 - x0 + 1, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = ((top + y) * img.width + (x0 + x)) * 4;
      const a = img.data[i + 3];
      if (a < ALPHA_FLOOR) continue;
      out.set(x, y, [img.data[i], img.data[i + 1], img.data[i + 2], a]);
    }
  }
  return out;
}

function contentBounds(surface) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (!surface.alphaAt(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Where the character meets the floor.
 *
 * The lowest band of the silhouette, weighted towards dark pixels: boots are
 * the darkest thing down there, and the pale robe and any glow on the ground
 * would otherwise drag the point sideways. Averaging the outermost columns that
 * clear the threshold puts it between the two feet rather than on one of them.
 */
function measureFeet(surface) {
  const box = contentBounds(surface);
  if (!box) return { x: surface.width / 2, y: surface.height - 1 };
  const from = Math.max(box.y, box.y + box.h - Math.max(4, Math.round(box.h * 0.14)));
  const hist = new Int32Array(box.w);
  for (let y = from; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (!surface.alphaAt(x, y)) continue;
      const [r, g, b] = surface.get(x, y);
      hist[x - box.x] += r + g + b < 280 ? 2 : 1;
    }
  }
  const peak = Math.max(1, ...hist);
  const floor = peak * 0.22;
  let left = -1;
  let right = -1;
  for (let i = 0; i < hist.length; i++) {
    if (hist[i] < floor) continue;
    if (left < 0) left = i;
    right = i;
  }
  const feetX = left < 0 ? box.x + box.w / 2 : box.x + (left + right) / 2;
  return { x: feetX, y: box.y + box.h - 1 };
}

/** Horizontal span of the feet — narrowest means legs together. */
function feetSpan(surface) {
  const box = contentBounds(surface);
  if (!box) return Infinity;
  const from = Math.max(box.y, box.y + box.h - Math.max(4, Math.round(box.h * 0.12)));
  let left = Infinity;
  let right = -1;
  for (let y = from; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (!surface.alphaAt(x, y)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return right < 0 ? Infinity : right - left;
}

/** One box that fits every frame once they are stacked on their pivots. */
function boxFor(surfaces, anchors) {
  let maxLeft = 0;
  let maxRight = 0;
  let maxAbove = 0;
  let maxBelow = 0;
  surfaces.forEach((s, i) => {
    const b = contentBounds(s);
    if (!b) return;
    maxLeft = Math.max(maxLeft, anchors[i].x - b.x);
    maxRight = Math.max(maxRight, b.x + b.w - 1 - anchors[i].x);
    maxAbove = Math.max(maxAbove, anchors[i].y - b.y);
    maxBelow = Math.max(maxBelow, b.y + b.h - 1 - anchors[i].y);
  });
  const w = Math.ceil(maxLeft + maxRight) + PAD * 2 + 2;
  const h = Math.ceil(maxAbove + maxBelow) + PAD * 2 + 2;
  return { w: Math.max(16, w + (w % 2)), h: Math.max(16, h + (h % 2)) };
}

function placeOnPivot(surface, box, anchorPx, lift = 0) {
  const out = new Surface(box.w, box.h);
  const ox = Math.round(box.w / 2 - anchorPx.x);
  const oy = Math.round(box.h - PAD - 1 - anchorPx.y) - lift;
  let kept = 0;
  let total = 0;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const [r, g, b, a] = surface.get(x, y);
      if (!a) continue;
      total++;
      const dx = x + ox;
      const dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= box.w || dy >= box.h) continue;
      out.set(dx, dy, [r, g, b, a]);
      kept++;
    }
  }
  if (kept < total) {
    throw new Error(`frame clipped: kept ${kept}/${total} in ${box.w}x${box.h} (PAD=${PAD})`);
  }
  // The pivot stays on the floor even when the bob lifts the drawing, so a
  // breathing character does not slide up and down the ground plane.
  return {
    surface: out,
    anchor: { x: (anchorPx.x + ox) / box.w, y: (anchorPx.y + oy + lift) / box.h },
  };
}

function main() {
  if (!existsSync(SOURCE)) throw new Error(`missing source sheet: ${SOURCE}`);
  const img = decodePNG(SOURCE);
  if (img.height !== ROWS * ROW_HEIGHT) {
    throw new Error(`expected ${ROWS * ROW_HEIGHT}px tall sheet, got ${img.height}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  if (DUMP) mkdirSync(DUMP, { recursive: true });

  // facing -> the eight poses of its walk, in sheet order
  const walks = new Map();
  for (let row = 0; row < ROWS; row++) {
    const band = { top: row * ROW_HEIGHT, height: ROW_HEIGHT };
    const runs = poseRuns(img, band);
    if (runs.length !== COLS) {
      throw new Error(
        `row ${row} split into ${runs.length} poses, expected ${COLS} ` +
          `(${runs.map((r) => `${r.x0}-${r.x1}`).join(' ')})`,
      );
    }
    const facing = FACINGS[row];
    const poses = runs.map((run) => cut(img, run.x0, run.x1, band.top, band.height));
    walks.set(facing, poses);
    const spans = poses.map(feetSpan);
    console.log(
      `row ${row} -> ${facing.padEnd(5)} ${poses.length} poses` +
        `  x ${runs[0].x0}-${runs[runs.length - 1].x1}`,
    );
    if (DUMP) {
      poses.forEach((s, i) =>
        writeFileSync(join(DUMP, `${facing}_${i}.png`), encodePNG(s)),
      );
    }
    // remember which pose stands squarest, for the derived idle
    poses.neutral = spans.indexOf(Math.min(...spans));
  }

  const textures = [];
  const groups = [
    { file: 'kiemtien-walk.png', kind: 'walk' },
    { file: 'kiemtien-idle.png', kind: 'idle' },
  ];

  for (const group of groups) {
    const entries = [];
    const surfaces = [];
    const anchors = [];
    const plan = [];

    for (const facing of FACINGS) {
      const poses = walks.get(facing);
      if (group.kind === 'walk') {
        poses.forEach((surface, i) =>
          plan.push({ name: `walk_${facing}_${i}`, surface, lift: 0 }),
        );
      } else {
        const surface = poses[poses.neutral];
        for (let i = 0; i < IDLE_FRAMES; i++) {
          plan.push({ name: `idle_${facing}_${i}`, surface, lift: IDLE_BOB[i] });
        }
      }
    }
    for (const item of plan) {
      surfaces.push(item.surface);
      anchors.push(measureFeet(item.surface));
    }
    const box = boxFor(surfaces, anchors);

    plan.forEach((item, i) => {
      const placed = placeOnPivot(item.surface, box, anchors[i], item.lift);
      entries.push({ name: item.name, surface: placed.surface, anchor: placed.anchor });
    });

    const packed = packFrames(entries);
    writeFileSync(join(OUT_DIR, group.file), encodePNG(packed.surface));
    textures.push({
      image: group.file,
      format: 'RGBA8888',
      size: { w: packed.surface.width, h: packed.surface.height },
      scale: 1,
      frames: packed.frames,
    });
    console.log(
      `wrote ${group.file}  ${packed.surface.width}x${packed.surface.height}` +
        `  ${entries.length} frames  box ${box.w}x${box.h}`,
    );
  }

  writeFileSync(
    join(OUT_DIR, 'kiemtien.json'),
    JSON.stringify(
      {
        textures,
        meta: {
          app: 'thien-menh-nghich-do/build-kiemtien-atlas',
          version: '1.0',
          image: 'kiemtien',
          format: 'RGBA8888',
          scale: '1',
        },
      },
      null,
      2,
    ),
  );
  console.log(`atlas ${OUT_DIR}/kiemtien.json  (${textures.length} sheets)`);
}

main();
