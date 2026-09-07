// Cuts the Brave-Frontier-style Miku sheet into a feet-pivot Phaser atlas.
//   node tools/build-miku-atlas.mjs
//
// Source is one 4x6 grid on a white canvas. Sprites bleed across cell lines
// (twin-tails, sword trails). Each connected opaque blob is kept whole and
// handed to the grid cell that already owns most of its pixels, so a pose is
// never sliced in half at the border.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { decodePNG } from './png-decode.mjs';
import { packFrames } from './atlas-pack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public', 'assets', 'characters', 'miku', 'source', 'miku-sheet.png');
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'miku', 'atlas');
const DUMP = process.argv.includes('--dump')
  ? join(ROOT, '.tmp', 'miku-frames')
  : null;

const COLS = 6;
const ROWS = 4;
const PAD = 16;
/** Near-white canvas → transparent. JPEG fringe sits below pure white. */
const WHITE_LUMA = 232;
const WHITE_CHROMA = 28;
/** Drop jpeg crumbs / sparkle dust that bridges neighbouring poses. */
const MIN_BLOB = 80;

const CELL = {
  ready0: 0,
  ready1: 1,
  ready2: 2,
  lunge0: 3,
  lunge1: 4,
  slashBig: 5,
  slashDown: 6,
  slashUp: 7,
  slashSpin: 8,
  slashLeap: 9,
  slashLow: 10,
  fxStar: 11,
  thrust: 12,
  castCircle: 13,
  castVortex: 14,
  fxErupt0: 15,
  fxErupt1: 16,
  fxErupt2: 17,
  sit: 18,
  victory: 19,
  ko: 20,
  crawl: 21,
  idle: 22,
  cheer: 23,
};

const CLIPS = [
  { name: 'idle_down', cells: [CELL.idle], anchor: 'feet', breathe: 4 },
  { name: 'idle_up', cells: [CELL.idle], anchor: 'feet', breathe: 4 },
  { name: 'idle_right', cells: [CELL.idle], anchor: 'feet', breathe: 4 },

  {
    name: 'walk_down',
    cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.ready1],
    anchor: 'cycle',
  },
  {
    name: 'walk_up',
    cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.ready1],
    anchor: 'cycle',
  },
  {
    name: 'walk_side',
    cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.lunge0, CELL.ready2, CELL.ready1],
    anchor: 'cycle',
  },

  { name: 'atk1_side', cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.slashBig], anchor: 'feet' },
  { name: 'atk2_side', cells: [CELL.slashDown, CELL.slashUp, CELL.slashSpin], anchor: 'feet' },
  { name: 'atk3_side', cells: [CELL.slashLeap, CELL.slashLow, CELL.slashBig], anchor: 'feet' },

  {
    name: 'cast_side',
    cells: [CELL.castCircle, CELL.thrust, CELL.castVortex, CELL.cheer],
    anchor: 'feet',
  },

  { name: 'hurt', cells: [CELL.crawl, CELL.sit], anchor: 'feet' },
  { name: 'death', cells: [CELL.sit, CELL.ko], anchor: 'feet', dissolve: 3 },

  // slashBig keeps the body — callers tint/fade it as an afterimage trail
  { name: 'fx_crescent', cells: [CELL.slashBig], anchor: 'centre', trail: true },
  { name: 'fx_star', cells: [CELL.fxStar], anchor: 'centre' },
  { name: 'fx_eruption', cells: [CELL.fxErupt0, CELL.fxErupt1, CELL.fxErupt2], anchor: 'ground' },
];

const FILES = [
  { file: 'miku-idle.png', match: /^idle_/ },
  { file: 'miku-walk.png', match: /^walk_/ },
  { file: 'miku-attack.png', match: /^atk/ },
  { file: 'miku-skill.png', match: /^cast_/ },
  { file: 'miku-hurt.png', match: /^(hurt|death)$/ },
  { file: 'miku-fx.png', match: /^fx_/ },
];

/* -------------------------------------------------------------- decode */

/** Knock out the white canvas, then erase tiny dust so poses don't bridge. */
function knockoutWhite(img) {
  const { width, height, data: src } = img;
  const data = new Uint8Array(src);
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    const r = data[s];
    const g = data[s + 1];
    const b = data[s + 2];
    const luma = (r * 3 + g * 6 + b) / 10;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma >= WHITE_LUMA && chroma <= WHITE_CHROMA) data[s + 3] = 0;
  }

  // Flood near-white from the border so a smoky backdrop never sticks to art.
  const stack = [];
  const seen = new Uint8Array(width * height);
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    const s = i * 4;
    if (data[s + 3] === 0) {
      seen[i] = 1;
      stack.push(x, y);
      return;
    }
    const r = data[s];
    const g = data[s + 1];
    const b = data[s + 2];
    const luma = (r * 3 + g * 6 + b) / 10;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma < 210 || chroma > 40) return;
    data[s + 3] = 0;
    seen[i] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return despeckle({ width, height, data });
}

/** Remove connected opaque crumbs smaller than MIN_BLOB. */
function despeckle(img) {
  const { width, height, data } = img;
  const labels = new Int32Array(width * height);
  labels.fill(-1);
  const sizes = [];
  const stack = [];
  let next = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (labels[start] >= 0 || data[start * 4 + 3] === 0) continue;
      const label = next++;
      let n = 0;
      stack.push(x, y);
      labels[start] = label;
      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        n++;
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const i = ny * width + nx;
          if (labels[i] >= 0 || data[i * 4 + 3] === 0) continue;
          labels[i] = label;
          stack.push(nx, ny);
        }
      }
      sizes[label] = n;
    }
  }

  for (let i = 0; i < width * height; i++) {
    const label = labels[i];
    if (label < 0) continue;
    if (sizes[label] < MIN_BLOB) data[i * 4 + 3] = 0;
  }
  return { width, height, data };
}

function cellRects(width, height) {
  const rects = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = Math.round((col * width) / COLS);
      const x1 = Math.round(((col + 1) * width) / COLS);
      const y0 = Math.round((row * height) / ROWS);
      const y1 = Math.round(((row + 1) * height) / ROWS);
      rects.push({
        x0,
        y0,
        x1,
        y1,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
      });
    }
  }
  return rects;
}

/**
 * Keep each pose whole: label connected opaque blobs, then hand every blob to
 * the grid cell that already owns most of its pixels. Twin-tails and sword
 * trails that cross a grid line stay with the body instead of being sliced in
 * half at the cell border.
 */
function cutAllCells(img) {
  const { width, height, data } = img;
  const rects = cellRects(width, height);
  const labels = new Int32Array(width * height);
  labels.fill(-1);
  const sizes = [];
  const counts = []; // per-blob tallies inside each cell rect
  const centroids = [];
  const stack = [];
  let next = 0;

  const cellAt = (x, y) => {
    for (let c = 0; c < rects.length; c++) {
      const r = rects[c];
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return c;
    }
    return -1;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (labels[start] >= 0 || data[start * 4 + 3] === 0) continue;
      const label = next++;
      let n = 0;
      let sx = 0;
      let sy = 0;
      const tally = new Int32Array(rects.length);
      stack.push(x, y);
      labels[start] = label;
      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        n++;
        sx += cx;
        sy += cy;
        const cell = cellAt(cx, cy);
        if (cell >= 0) tally[cell]++;
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const i = ny * width + nx;
          if (labels[i] >= 0 || data[i * 4 + 3] === 0) continue;
          labels[i] = label;
          stack.push(nx, ny);
        }
      }
      sizes[label] = n;
      counts[label] = tally;
      centroids[label] = { x: sx / n, y: sy / n };
    }
  }

  const owner = new Int32Array(next);
  owner.fill(-1);
  for (let label = 0; label < next; label++) {
    if (sizes[label] < MIN_BLOB) continue;
    const tally = counts[label];
    let best = -1;
    let bestCount = -1;
    for (let c = 0; c < tally.length; c++) {
      if (tally[c] > bestCount) {
        bestCount = tally[c];
        best = c;
      }
    }
    // Pure overflow (no pixels inside any rect — shouldn't happen): nearest centre
    if (bestCount <= 0) {
      const c = centroids[label];
      let bestDist = Infinity;
      for (let i = 0; i < rects.length; i++) {
        const d = (c.x - rects[i].cx) ** 2 + (c.y - rects[i].cy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
    } else {
      // Tie-break: among cells with the same count, pick nearest centroid
      const tied = [];
      for (let c = 0; c < tally.length; c++) if (tally[c] === bestCount) tied.push(c);
      if (tied.length > 1) {
        const c = centroids[label];
        let bestDist = Infinity;
        for (const i of tied) {
          const d = (c.x - rects[i].cx) ** 2 + (c.y - rects[i].cy) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
      }
    }
    owner[label] = best;
  }

  const buckets = Array.from({ length: rects.length }, () => ({
    minX: Infinity,
    minY: Infinity,
    maxX: -1,
    maxY: -1,
    pixels: /** @type {number[]} */ ([]),
  }));

  for (let i = 0; i < width * height; i++) {
    const label = labels[i];
    if (label < 0) continue;
    const cell = owner[label];
    if (cell < 0) continue;
    const x = i % width;
    const y = (i / width) | 0;
    const b = buckets[cell];
    b.pixels.push(i);
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
  }

  return buckets.map((b, cell) => {
    if (b.pixels.length < MIN_BLOB) {
      // Fall back to a hard crop of the grid rect so empty cells stay empty
      // rather than borrowing a neighbour's leftover crumb.
      const r = rects[cell];
      const surface = new Surface(Math.max(1, r.x1 - r.x0), Math.max(1, r.y1 - r.y0));
      return surface;
    }
    const surface = new Surface(b.maxX - b.minX + 1, b.maxY - b.minY + 1);
    for (const i of b.pixels) {
      const x = i % width;
      const y = (i / width) | 0;
      const s = i * 4;
      surface.set(x - b.minX, y - b.minY, [data[s], data[s + 1], data[s + 2], data[s + 3]]);
    }
    return surface;
  });
}

function cellSize(img) {
  return {
    cw: Math.round(img.width / COLS),
    ch: Math.round(img.height / ROWS),
  };
}

/** Keep cosmic trail pixels; drop teal hair / grey cloth / skin. */
function trailOnly(surface) {
  const out = new Surface(surface.width, surface.height);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const [r, g, b, a] = surface.get(x, y);
      if (!a) continue;
      const purple = b >= 130 && r >= 70 && r >= g - 10 && b >= g;
      const white = r > 210 && g > 210 && b > 210;
      const magenta = r > 150 && b > 150 && g < 140;
      if (purple || white || magenta) out.set(x, y, [r, g, b, a]);
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

function measureFeet(surface) {
  const box = contentBounds(surface);
  if (!box) return { x: surface.width / 2, y: surface.height - 1 };
  const top = Math.max(box.y, box.y + box.h - Math.max(4, Math.round(box.h * 0.14)));
  const hist = new Int32Array(box.w);
  for (let y = top; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (!surface.alphaAt(x, y)) continue;
      const [r, g, b] = surface.get(x, y);
      // Prefer boots / dark cloth over glowing trails on the floor
      const dark = r + g + b < 280;
      if (dark) hist[x - box.x] += 2;
      else hist[x - box.x] += 1;
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

function measureCentre(surface) {
  const box = contentBounds(surface);
  if (!box) return { x: surface.width / 2, y: surface.height / 2 };
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function measureGround(surface) {
  const box = contentBounds(surface);
  if (!box) return { x: surface.width / 2, y: surface.height - 1 };
  return { x: box.x + box.w / 2, y: box.y + box.h - 1 };
}

function anchorOf(surface, kind) {
  if (kind === 'centre') return measureCentre(surface);
  if (kind === 'ground') return measureGround(surface);
  return measureFeet(surface);
}

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

function placeOnPivot(surface, box, anchorPx, kind) {
  const out = new Surface(box.w, box.h);
  const targetX = box.w / 2;
  const targetY = kind === 'centre' ? box.h / 2 : box.h - PAD - 1;
  const ox = Math.round(targetX - anchorPx.x);
  const oy = Math.round(targetY - anchorPx.y);
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
    throw new Error(
      `frame clipped while packing: kept ${kept}/${total} in ${box.w}x${box.h} (pad=${PAD})`,
    );
  }
  return {
    surface: out,
    anchor: { x: (anchorPx.x + ox) / box.w, y: (anchorPx.y + oy) / box.h },
  };
}

function breathe(base, step) {
  // Grow 1px vertically so the lift never drops hair off the top of the canvas.
  const out = new Surface(base.width, base.height + 2);
  const lift = step % 2 === 0 ? 1 : 0;
  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      const [r, g, b, a] = base.get(x, y);
      if (!a) continue;
      let nr = r;
      let ng = g;
      let nb = b;
      if (step % 2 === 1 && g > r && b > r) {
        ng = Math.min(255, g + 8);
        nb = Math.min(255, b + 6);
      }
      out.set(x, y + lift, [nr, ng, nb, a]);
    }
  }
  return out;
}

function dissolve(base, step, of) {
  const out = new Surface(base.width, base.height);
  const t = (step + 1) / (of + 1);
  const rise = Math.round(step * 2);
  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      const [r, g, b, a] = base.get(x, y);
      if (!a) continue;
      if (((x * 17 + y * 31 + step * 13) & 255) / 255 < t * 0.55) continue;
      const yy = y - rise;
      if (yy < 0) continue;
      const fade = Math.max(0, Math.round(a * (1 - t * 0.7)));
      if (!fade) continue;
      out.set(x, yy, [
        Math.min(255, r + Math.round(40 * t)),
        Math.max(0, g - Math.round(20 * t)),
        Math.min(255, b + Math.round(60 * t)),
        fade,
      ]);
    }
  }
  return out;
}

function buildClipFrames(cells, clip) {
  const raw = clip.cells.map((index) => {
    let surface = cells[index];
    if (clip.trail) surface = trailOnly(surface);
    const kind = clip.anchor === 'cycle' ? 'feet' : clip.anchor;
    return { surface, anchorPx: anchorOf(surface, kind) };
  });

  let expanded = [];
  for (const frame of raw) {
    if (clip.breathe) {
      for (let i = 0; i < clip.breathe; i++) {
        const s = breathe(frame.surface, i);
        expanded.push({ surface: s, anchorPx: anchorOf(s, 'feet') });
      }
    } else {
      expanded.push(frame);
    }
  }
  if (clip.dissolve) {
    const last = expanded[expanded.length - 1];
    for (let i = 0; i < clip.dissolve; i++) {
      expanded.push({
        surface: dissolve(last.surface, i, clip.dissolve),
        anchorPx: { ...last.anchorPx },
      });
    }
  }

  if (clip.anchor === 'cycle') {
    const meanX = expanded.reduce((s, f) => s + f.anchorPx.x, 0) / expanded.length;
    for (const f of expanded) f.anchorPx = { x: meanX, y: f.anchorPx.y };
  }
  return expanded;
}

function main() {
  if (!existsSync(SOURCE)) throw new Error(`missing source sheet: ${SOURCE}`);
  mkdirSync(OUT_DIR, { recursive: true });
  if (DUMP) mkdirSync(DUMP, { recursive: true });

  const img = knockoutWhite(decodePNG(SOURCE));
  const { cw, ch } = cellSize(img);
  console.log(`sheet ${img.width}x${img.height}  grid ${COLS}x${ROWS} (~${cw}x${ch})`);

  const cells = cutAllCells(img);
  if (DUMP) {
    cells.forEach((s, i) => {
      writeFileSync(join(DUMP, `cell_${String(i).padStart(2, '0')}.png`), encodePNG(s));
    });
    console.log(`dumped ${cells.length} cells -> ${DUMP}`);
  }

  const textures = [];
  for (const group of FILES) {
    const clips = CLIPS.filter((c) => group.match.test(c.name));
    if (!clips.length) continue;

    const allExpanded = clips.map((clip) => ({
      clip,
      frames: buildClipFrames(cells, clip),
    }));

    const box = boxFor(
      allExpanded.flatMap((c) => c.frames.map((f) => f.surface)),
      allExpanded.flatMap((c) => c.frames.map((f) => f.anchorPx)),
    );

    const entries = [];
    for (const { clip, frames } of allExpanded) {
      frames.forEach((frame, i) => {
        const kind = clip.anchor === 'cycle' ? 'feet' : clip.anchor;
        const placed = placeOnPivot(frame.surface, box, frame.anchorPx, kind);
        entries.push({
          name: `${clip.name}_${i}`,
          surface: placed.surface,
          anchor: placed.anchor,
        });
      });
      console.log(`  ${clip.name.padEnd(14)} ${frames.length} frames  box ${box.w}x${box.h}`);
    }

    const packed = packFrames(entries);
    writeFileSync(join(OUT_DIR, group.file), encodePNG(packed.surface));
    textures.push({
      image: group.file,
      format: 'RGBA8888',
      size: { w: packed.surface.width, h: packed.surface.height },
      scale: 1,
      frames: packed.frames,
    });
    console.log(`wrote ${group.file}  ${packed.surface.width}x${packed.surface.height}`);
  }

  writeFileSync(
    join(OUT_DIR, 'miku.json'),
    JSON.stringify(
      {
        textures,
        meta: {
          app: 'thien-menh-nghich-do/build-miku-atlas',
          version: '1.0',
          image: 'miku',
          format: 'RGBA8888',
          scale: '1',
        },
      },
      null,
      2,
    ),
  );
  console.log(`atlas ${OUT_DIR}/miku.json  (${textures.length} sheets)`);
}

main();
