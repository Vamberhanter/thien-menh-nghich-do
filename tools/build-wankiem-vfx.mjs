// Cuts kiemtien-skill3.3.png into the eight Vạn Kiếm Quy Tông effect frames.
//   node tools/build-wankiem-vfx.mjs
//
// One 1536x1024 sheet, four columns by two rows, one effect per cell. Unlike
// her pose sheets these are not characters and have no feet, so they do not go
// through the atlas builder — they come out as eight loose PNGs the scene loads
// as plain images and stacks on top of each other.
//
// Nothing here redesigns or repaints anything: it copies pixels out of the
// sheet and writes them, alpha untouched.
//
// Two things about where the cuts land:
//
//  * **The columns divide cleanly, the rows do not.** Every vertical seam
//    (x=384, 768, 1152) is empty — max alpha 3 down the whole column — so the
//    four columns are exactly a quarter of the width each. The horizontal seam
//    at y=512 is *not*: 410 of its 1536 pixels are lit, up to alpha 246,
//    because the blades' glow tails run past the middle of the sheet and the
//    two rows overlap slightly. Cutting at 512 would take a slice off the top
//    row's tail and give it to the bottom row.
//  * **So each column is cut at its own quietest row.** Scanning y=480..570 for
//    the row with the least alpha in it finds 520, 536, 526 and 542 — the point
//    in each column where the two glows have both faded furthest. That is where
//    the least is lost and the least is borrowed.
//
// Nothing is trimmed sideways. The content sits between x=25 and x=320 inside a
// 384-wide cell depending on the effect, and that margin is the padding the
// artist drew around it — cropping to the pixels would move every effect's
// centre and make eight frames that no longer line up with each other.
//
// One thing the sheet does that cannot be fixed here: the art runs into the top
// and bottom edges of the file (alpha 144 on row 0), so the outermost glow was
// already clipped when the sheet was drawn.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodeWebP } from './image-io.mjs';
import { decodePNG } from './png-decode.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public/assets/characters/kiemtien/kiemtien-skill3.3.png');
const OUT_DIR = join(ROOT, 'public/assets/vfx/wan-kiem-quy-tong');

const COLS = 4;
const ROWS = 2;

/** Reading order, top row then bottom, as the technique plays. */
const NAMES = [
  '01_summon',
  '02_convergence',
  '03_charge',
  '04_explosion',
  '05_sword_rain',
  '06_giant_sword',
  '07_giant_impact',
  '08_final_burst',
];

/** Where to look for the row seam, and how wide a window around the nominal one. */
const SEAM_FROM = 480;
const SEAM_TO = 570;

/**
 * The quietest scanline in the seam window for one column.
 *
 * Total alpha rather than peak: a single bright particle should not push the
 * cut away from a row that is otherwise clear.
 */
function seamRow(img, x0, width) {
  let best = { y: Math.floor(img.height / ROWS), sum: Infinity };
  for (let y = SEAM_FROM; y <= SEAM_TO; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) sum += img.data[(y * img.width + x0 + x) * 4 + 3];
    if (sum < best.sum) best = { y, sum };
  }
  return best;
}

function copyCell(img, x0, y0, width, height) {
  const out = new Surface(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((y0 + y) * img.width + (x0 + x)) * 4;
      out.set(x, y, [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]);
    }
  }
  return out;
}

/**
 * The blade's point, and the line it hangs on — the sprite's origin.
 *
 * The eight effects are not centred the same way: the blade sits anywhere from
 * 38% to 60% across its cell, and its point from 94% to 97% down. Drawn on a
 * fixed (0.5, 0.95) origin they slide sideways by up to 40px as the technique
 * moves from one stage to the next, which reads as the sword jumping between
 * beats. Measured per frame they all stand on the same spot.
 *
 * The point is the lowest scanline holding two or more bright core pixels — the
 * white heart of the blade, not the glow around it, which fades out well past
 * where the steel ends. The line is the horizontal centre of that core taken
 * over the whole frame.
 */
function originOf(surface) {
  const CORE_ALPHA = 200;
  const CORE_LUMA = 200;
  let tip = surface.height - 1;
  for (let y = surface.height - 1; y >= 0; y--) {
    let n = 0;
    for (let x = 0; x < surface.width; x++) {
      const [r, g, b, a] = surface.get(x, y);
      if (a >= CORE_ALPHA && (r + g + b) / 3 >= CORE_LUMA) n++;
    }
    if (n >= 2) {
      tip = y;
      break;
    }
  }
  let sum = 0;
  let count = 0;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const [r, g, b, a] = surface.get(x, y);
      if (a >= 220 && (r + g + b) / 3 >= 230) {
        sum += x;
        count++;
      }
    }
  }
  const axis = count ? sum / count : surface.width / 2;
  return { x: axis / surface.width, y: (tip + 1) / surface.height };
}

/** Where the paint actually is, so the cut can be checked rather than trusted. */
function bounds(surface, floor = 24) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (surface.alphaAt(x, y) < floor) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function main() {
  const img = decodePNG(SRC);
  const cw = img.width / COLS;
  if (!Number.isInteger(cw)) throw new Error(`${img.width}px does not divide into ${COLS} columns`);
  mkdirSync(OUT_DIR, { recursive: true });
  const origins = new Map();

  console.log(`sheet ${img.width}x${img.height}, ${COLS}x${ROWS} cells of ${cw}px wide`);

  for (let col = 0; col < COLS; col++) {
    const x0 = col * cw;
    const seam = seamRow(img, x0, cw);
    console.log(`column ${col}: row seam at y=${seam.y} (nominal 512)`);

    const slices = [
      { row: 0, y0: 0, h: seam.y },
      { row: 1, y0: seam.y, h: img.height - seam.y },
    ];
    for (const slice of slices) {
      const name = NAMES[slice.row * COLS + col];
      const cell = copyCell(img, x0, slice.y0, cw, slice.h);
      const b = bounds(cell);
      writeFileSync(join(OUT_DIR, `${name}.webp`), await encodeWebP(cell));
      const edge = b && (b.x === 0 || b.y === 0 || b.x + b.w === cw || b.y + b.h === slice.h);
      const origin = originOf(cell);
      origins.set(name, origin);
      console.log(
        `  ${name.padEnd(16)} ${cw}x${slice.h}  paint ${b.w}x${b.h} at ${b.x},${b.y}` +
          `  origin ${origin.x.toFixed(3)},${origin.y.toFixed(3)}` +
          (edge ? '  (runs into the sheet edge — see the note above)' : ''),
      );
    }
  }
  console.log(`wrote ${NAMES.length} frames to ${OUT_DIR}`);

  // The table WanKiemQuyTongEffect.ts carries, printed so that re-running this
  // after the artist redraws a cell says exactly what has to change over there.
  console.log('\norigins for WanKiemQuyTongEffect.ts:');
  for (const name of NAMES) {
    const o = origins.get(name);
    console.log(`  ${name}: { x: ${o.x.toFixed(3)}, y: ${o.y.toFixed(3)} },`);
  }
}

await main();
