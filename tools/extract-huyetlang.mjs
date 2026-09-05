// Huyết Lang's concept sheets: inventory, colour rules and CLI.
//
//   node tools/extract-huyetlang.mjs --report         # frame counts per row
//   node tools/extract-huyetlang.mjs --measure        # feet-to-shoulder ruler
//   node tools/extract-huyetlang.mjs --dump <dir>     # every frame + row strips
//
// The segmentation is the shared engine in `sheet-frames.mjs`, the same one
// Như Yên and the boss use. Two things are specific to this character:
//
//  * The art was generated on an opaque black canvas rather than on alpha, so
//    the backdrop has to be knocked out before anything can be segmented. A
//    threshold would punch holes in the gunmetal armour, whose shadows are just
//    as dark, so the backdrop is flood-filled from the border instead: only
//    black that the frame edge can reach is background.
//  * Each pose lives in its own file — one strip per action per facing — so the
//    inventory is one entry per file rather than one per multi-row sheet.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Surface } from './pixel.mjs';
import { decodePNG } from './png-decode.mjs';
import {
  analyseSheet as analyseSheetFrames,
  checker,
  cutFrame,
  frameExtent,
} from './sheet-frames.mjs';

export { cutFrame, frameExtent };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SHEET_DIR = join(ROOT, 'public', 'assets', 'characters', 'huyetlang', 'source');

/**
 * Inventory of the concept strips.
 *
 * `cols`  frame count of each row — the segmentation is told the answer and
 *         only has to find the cut lines.
 * `scale` how many source pixels this strip spends per game pixel, i.e. the
 *         downscale `cutFrame` applies. Every strip drew him at its own size:
 *         the idle portraits fill a 1024x1536 canvas while the walk cells are a
 *         third of that. Dividing each strip's measured feet-to-shoulder ruler
 *         (`--measure`) by the shared 96px target is what makes a walk frame
 *         the same height as an idle frame.
 */
export const SHEETS = {
  idleDown: { file: 'huyetlang-idle-down.png', cols: [1], scale: 8.74, note: 'front portrait' },
  idleUp: { file: 'huyetlang-idle-up.png', cols: [1], scale: 9.03, note: 'back portrait' },
  idleRight: { file: 'huyetlang-idle-right.png', cols: [1], scale: 7.39, note: 'side portrait' },
  walkDown: {
    file: 'huyetlang-walk-down.png',
    cols: [6],
    cut: 'even',
    claim: 'nearest',
    scale: 2.52,
    note: '6-frame front gait',
  },
  walkUp: {
    file: 'huyetlang-walk-up.png',
    cols: [6],
    cut: 'even',
    claim: 'nearest',
    scale: 3.01,
    note: '6-frame back gait',
  },
  walkRight: {
    file: 'huyetlang-walk-right.png',
    cols: [6],
    cut: 'even',
    claim: 'nearest',
    scale: 2.17,
    note: '6-frame side gait',
  },
  atkDown: {
    file: 'huyetlang-atk-down.png',
    cols: [4],
    cut: 'even',
    claim: 'nearest',
    scale: 3.31,
    note: 'front overhead chop',
  },
  atkRight: {
    file: 'huyetlang-atk-right.png',
    cols: [4],
    cut: 'even',
    claim: 'nearest',
    scale: 3.17,
    note: 'side sweep',
  },
  skillDown: {
    file: 'huyetlang-skill-down.png',
    cols: [6],
    cut: 'even',
    claim: 'nearest',
    scale: 2.81,
    note: 'charge into ground slam',
  },
  /** Scaled off r0 alone — r1 is on the floor, so its ruler means nothing. */
  hurt: {
    file: 'huyetlang-hurt-death.png',
    cols: [3, 3],
    cut: 'even',
    claim: 'nearest',
    scale: 3.01,
    note: 'r0 stagger, r1 collapse',
  },
  /**
   * The effect cells hold no body, so the shoulder ruler cannot scale them.
   * They are matched to Như Yên's instead: 2.5 puts the crescent at 179px wide
   * against her 161px, and the tall pillar at 252px against her 268px eruption.
   */
  fx: {
    file: 'huyetlang-fx-src.png',
    cols: [3],
    cut: 'even',
    claim: 'nearest',
    scale: 2.5,
    note: 'crescent, short pillar, tall pillar',
  },
};

/**
 * Colour rules for this character.
 *
 * `isDark` is the gunmetal plate and the clawed feet — anything unlit that is
 * not magma. It finds the standing point, so the glow pooling under him must
 * not qualify or the anchor drifts into the light.
 *
 * `isBody` is the armour itself, magma excluded. The molten edges flare between
 * frames exactly the way Như Yên's hair and qi do, and aligning a walk cycle
 * against a flare drags the whole row sideways.
 */
export const isMagma = (r, g, b) => r > g + 26 && r > b + 20 && r > 70;

const RULES = {
  isDark: (r, g, b) => (r + g + b) / 3 < 96 && !isMagma(r, g, b),
  isBody: (r, g, b) => {
    if (isMagma(r, g, b)) return false;
    const lum = (r + g + b) / 3;
    return lum >= 10 && lum < 210;
  },
};

/** Luminance at or below which a pixel can be the canvas the art sits on. */
const BACKDROP_LUM = 16;
const BACKDROP_CHROMA = 14;

/**
 * Clears the black canvas, leaving the art on alpha.
 *
 * Flood-filled 4-connected from every border pixel, so black enclosed by the
 * silhouette — the gaps between the heads, the shadow under a pauldron — keeps
 * its alpha and the armour does not come out full of holes.
 */
function knockoutBackdrop(img) {
  const { width, height, data } = img;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isBackdrop = (i) => {
    const s = i * 4;
    if (data[s + 3] === 0) return true;
    const r = data[s];
    const g = data[s + 1];
    const b = data[s + 2];
    const lum = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return lum <= BACKDROP_LUM && chroma <= BACKDROP_CHROMA;
  };
  const push = (i) => {
    if (seen[i] || !isBackdrop(i)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  for (let i = 0; i < seen.length; i++) if (seen[i]) data[i * 4 + 3] = 0;
  return img;
}

/** Share of a frame's height that counts as "down among the paws". */
const STANCE_BAND = 0.12;

/**
 * Adds the `stance` anchor, and rebases `cycle` onto it.
 *
 * The shared engine's `feet` anchor is the centre of the *lowest* dark pixels,
 * which is right for a human who plants both boots together. Huyết Lang stands
 * on four splayed limbs, so only one claw is ever lowest and the anchor lands
 * under it — 180px right of his centre on the front portrait, which is a fifth
 * of his width.
 *
 * `stance` widens the window to the bottom eighth of the frame, so every paw is
 * in it, and takes the midpoint of the span the paws cover. The greatsword tip
 * reaches the floor too, so columns holding less than a quarter of the busiest
 * column's pixels are dropped first: a paw is a solid block of metal, the blade
 * tip is a line, and that difference is enough to tell them apart. Averaging
 * instead — or taking a median — lets the sword drag the anchor 120px off.
 *
 * `cycle` (the de-snapped anchor a loop needs) is built by the engine from
 * `feet`, but only through that row's *average* — the per-frame detail comes
 * from correlating body silhouettes. So shifting each row by the gap between
 * the two averages keeps all of that work and drops the sideways bias.
 */
function addStanceAnchors(sheet) {
  const { img, alpha, labels } = sheet;
  const { width, data } = img;

  for (const frame of sheet.frames) {
    let bottom = -1;
    for (let y = frame.y + frame.h - 1; y >= frame.y && bottom < 0; y--) {
      for (let x = frame.x; x < frame.x + frame.w; x++) {
        const i = y * width + x;
        if (!alpha[i] || !frame.own.has(labels[i])) continue;
        const s = i * 4;
        if (RULES.isDark(data[s], data[s + 1], data[s + 2])) {
          bottom = y;
          break;
        }
      }
    }
    if (bottom < 0) {
      frame.anchors.stance = { ...frame.anchors.ground };
      continue;
    }

    const top = Math.max(frame.y, bottom - Math.round(frame.h * STANCE_BAND));
    const histogram = new Int32Array(frame.w);
    for (let y = top; y <= bottom; y++) {
      for (let x = frame.x; x < frame.x + frame.w; x++) {
        const i = y * width + x;
        if (!alpha[i] || !frame.own.has(labels[i])) continue;
        const s = i * 4;
        if (RULES.isDark(data[s], data[s + 1], data[s + 2])) histogram[x - frame.x]++;
      }
    }

    const floor = Math.max(...histogram) * 0.25;
    let left = -1;
    let right = -1;
    for (let k = 0; k < histogram.length; k++) {
      if (histogram[k] < floor) continue;
      if (left < 0) left = k;
      right = k;
    }
    frame.anchors.stance = {
      x: left < 0 ? frame.anchors.feet.x : frame.x + ((left + right) >> 1),
      y: bottom,
    };
  }

  const byRow = new Map();
  for (const frame of sheet.frames) {
    if (!byRow.has(frame.row)) byRow.set(frame.row, []);
    byRow.get(frame.row).push(frame);
  }
  for (const row of byRow.values()) {
    const mean = (pick) => row.reduce((sum, f) => sum + pick(f), 0) / row.length;
    const dx = Math.round(mean((f) => f.anchors.stance.x) - mean((f) => f.anchors.feet.x));
    const dy = Math.round(mean((f) => f.anchors.stance.y) - mean((f) => f.anchors.feet.y));
    for (const frame of row) {
      frame.anchors.cycle = {
        x: frame.anchors.cycle.x + dx,
        y: frame.anchors.cycle.y + dy,
      };
    }
  }
}

const cache = new Map();

export function analyseSheet(key) {
  if (cache.has(key)) return cache.get(key);
  const spec = SHEETS[key];
  if (!spec) throw new Error(`unknown sheet "${key}"`);
  const img = knockoutBackdrop(decodePNG(join(SHEET_DIR, spec.file)));
  const sheet = analyseSheetFrames({ dir: SHEET_DIR, key, spec, rules: RULES, img });
  addStanceAnchors(sheet);
  cache.set(key, sheet);
  return sheet;
}

/* ------------------------------------------------------------------ ruler */

/**
 * Feet-to-shoulder height of one frame, in source pixels.
 *
 * The shoulder line is the topmost row whose armour is at least `share` of the
 * frame's widest armour row. The two pauldron heads make the shoulders by far
 * the broadest part of him, and the greatsword — the one piece that changes
 * height wildly between poses — is far too thin to reach the threshold, so this
 * measures the body and ignores what the body is holding.
 */
export function shoulderHeight(sheet, frame, share = 0.55) {
  const { img, alpha, labels } = sheet;
  const { width, data } = img;
  const feetY = frame.anchors.stance.y;

  const widths = new Int32Array(frame.h);
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    let n = 0;
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const i = y * width + x;
      if (!alpha[i] || !frame.own.has(labels[i])) continue;
      const s = i * 4;
      if (RULES.isBody(data[s], data[s + 1], data[s + 2])) n++;
    }
    widths[y - frame.y] = n;
  }

  const widest = Math.max(...widths);
  if (widest === 0) return 0;
  const floor = widest * share;
  for (let k = 0; k < widths.length; k++) {
    if (widths[k] >= floor) return feetY - (frame.y + k);
  }
  return 0;
}

/* ------------------------------------------------------------------ report */

function report() {
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    console.log(`\n=== ${key}  ${SHEETS[key].file}  scale ${sheet.spec.scale}`);
    console.log(`    ${SHEETS[key].note}`);
    for (const info of sheet.rows) {
      const boxes = sheet.frames
        .filter((f) => f.row === info.row)
        .map((f) => {
          const e = frameExtent(sheet, f);
          return `c${f.col} ${e.left}<>${e.right} ^${e.up}v${e.down}`;
        })
        .join('  ');
      console.log(`  r${info.row} cut=${info.method.padEnd(4)} ${boxes}`);
    }
  }
  console.log('\n(extents are post-scale pixels around the feet anchor: left<>right ^up vdown)');
}

/** Prints feet-to-shoulder per frame — the ruler behind each strip's `scale`. */
function measure(target) {
  console.log(`target shoulder height ${target}px\n`);
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const heights = sheet.frames.map((f) => shoulderHeight(sheet, f));
    const upright = heights.filter((h) => h > 0).sort((a, b) => a - b);
    const median = upright[upright.length >> 1] ?? 0;
    const list = sheet.frames.map((f, i) => `${f.id}:${heights[i]}`).join(' ');
    console.log(
      `${key.padEnd(10)} median ${String(median).padStart(4)}  want scale ${(
        median / target
      ).toFixed(2)}  have ${sheet.spec.scale}  ${list}`,
    );
  }
  console.log('\nfx rows have no body, so their ruler is meaningless — scale those by eye');
}

/** Writes every frame and a per-row strip, for checking poses by eye. */
async function dump(dir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { encodePNG } = await import('./png.mjs');
  mkdirSync(dir, { recursive: true });

  const BOX = { w: 260, h: 300 };
  const AT = { x: 130, y: 250 };

  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const rows = sheet.spec.cols.length;
    const cols = Math.max(...sheet.spec.cols);
    const strip = new Surface(cols * BOX.w, rows * BOX.h);
    for (const frame of sheet.frames) {
      const cut = cutFrame(sheet, frame, BOX, AT, { scale: sheet.spec.scale });
      strip.blit(cut, frame.col * BOX.w, frame.row * BOX.h);
    }
    writeFileSync(join(dir, `${key}.png`), encodePNG(checker(strip, BOX)));
    console.log(`${key}.png  ${strip.width}x${strip.height}`);
  }
}

/**
 * Writes each whole sheet after the knockout, shrunk to fit a viewer, with the
 * detected cut lines and feet anchors drawn on. This is how you tell a bad
 * knockout from a bad cut: leftover backdrop shows up as a grey field, and a
 * misplaced anchor shows up as a cross that is not under his feet.
 */
async function preview(dir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { encodePNG } = await import('./png.mjs');
  mkdirSync(dir, { recursive: true });

  const WIDTH = 760;
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const { img, alpha, labels } = sheet;
    const step = img.width / WIDTH;
    const height = Math.round(img.height / step);
    const out = new Surface(WIDTH, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const sx = Math.min(img.width - 1, Math.round(x * step));
        const sy = Math.min(img.height - 1, Math.round(y * step));
        const i = sy * img.width + sx;
        const base = ((x >> 3) + (y >> 3)) % 2 ? 64 : 104;
        if (!alpha[i] || !labels[i]) {
          out.set(x, y, [base, base, base, 255]);
          continue;
        }
        const s = i * 4;
        const a = img.data[s + 3] / 255;
        out.set(x, y, [
          Math.round(img.data[s] * a + base * (1 - a)),
          Math.round(img.data[s + 1] * a + base * (1 - a)),
          Math.round(img.data[s + 2] * a + base * (1 - a)),
          255,
        ]);
      }
    }

    const mark = (x, y, colour) => {
      if (x < 0 || x >= WIDTH || y < 0 || y >= height) return;
      out.set(x, y, colour);
    };
    for (const info of sheet.rows) {
      for (const cut of info.cuts) {
        const x = Math.round(cut / step);
        for (let y = Math.round(info.y0 / step); y <= Math.round(info.y1 / step); y++) {
          mark(Math.min(WIDTH - 1, x), y, [80, 200, 255, 255]);
        }
      }
    }
    for (const frame of sheet.frames) {
      const draw = (anchor, colour) => {
        const ax = Math.round(anchor.x / step);
        const ay = Math.round(anchor.y / step);
        for (let d = -7; d <= 7; d++) {
          mark(ax + d, ay, colour);
          mark(ax, ay + d, colour);
        }
      };
      draw(frame.anchors.feet, [255, 220, 60, 255]);
      draw(frame.anchors.stance, [255, 40, 40, 255]);
    }

    writeFileSync(join(dir, `${key}.png`), encodePNG(out));
    console.log(`${key}.png  ${out.width}x${out.height}`);
  }
}

// CLI only — the atlas builder imports this module and must stay quiet.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--report')) report();
  const measureIndex = process.argv.indexOf('--measure');
  if (measureIndex >= 0) measure(Number(process.argv[measureIndex + 1]) || 96);
  const dumpIndex = process.argv.indexOf('--dump');
  if (dumpIndex >= 0) await dump(process.argv[dumpIndex + 1] ?? '.tmp/huyetlang-frames');
  const previewIndex = process.argv.indexOf('--preview');
  if (previewIndex >= 0) await preview(process.argv[previewIndex + 1] ?? '.tmp/huyetlang-preview');
  if (process.argv.length <= 2) {
    console.log(`sheets in ${SHEET_DIR}:`);
    for (const f of readdirSync(SHEET_DIR)) console.log(`  ${f}`);
    console.log('\nrun with --report, --measure [px], --dump <dir> or --preview <dir>');
  }
}
