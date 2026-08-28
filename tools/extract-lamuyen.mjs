// Cuts public/assets/characters/lamuyen/lamuyen.png into clean, alpha-cut frames.
//
//   node tools/extract-lamuyen.mjs --report        # segmentation report
//   node tools/extract-lamuyen.mjs --dump <dir>    # every frame + row strips
//
// The source sheet is hand made: a grey-blue gradient instead of alpha, columns
// that drift by up to 20px and rows that are not exactly 128px apart, so
// nothing here assumes a fixed grid.
//
// Pipeline
//   1. alpha:   solid mask (edge detect + flood fill) for the character, plus a
//               soft ramp from background subtraction for the qi glow. Neither
//               alone works — subtraction loses flat black hair, edge filling
//               loses soft glow.
//   2. columns: cluster the DARK pixels (hair, boots, outlines) per row slice.
//               The robe is blue and so are the effects, so colour cannot tell
//               them apart, but near-black pixels are always the character and
//               stay separated between frames even when a flare bridges two.
//   3. pixels:  connected components decide what belongs to a frame. A sprite
//               from the neighbouring row pokes into the slice, but its
//               component crosses the slice edge, so it is dropped; detached
//               glow fully inside the frame window is kept.
//   4. anchor:  each frame is aligned on its standing point — the centre of the
//               lowest dark slice (the boots) — so swords and flares never
//               shift the baseline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import {
  bands,
  differenceMap,
  estimateBackground,
  loadSheet,
  solidMask,
} from './sheet-lib.mjs';

export const SOURCE = 'public/assets/characters/lamuyen/lamuyen.png';

/** Alpha ramp: below LOW is background, above HIGH is fully opaque. */
const ALPHA_LOW = 26;
const ALPHA_HIGH = 58;
/** Difference above which a pixel counts as sprite. */
const CORE = 46;
const ROW_HEIGHT = 128;
const ROWS = 8;
/** Column gaps this narrow are bridged inside one cluster. */
const CLUSTER_GAP = 10;
/** Minimum dark-pixel weight for a character cluster. */
const MIN_DARK = 200;
/** Minimum core-pixel weight for an effect-only frame. */
const MIN_EFFECT = 900;
const MIN_COMPONENT = 24;
/** How far around a character its own glow may reach. */
const GLOW_MARGIN = 58;

const isDark = (r, g, b) => (r + g + b) / 3 < 85 && b - r < 60;

export function analyseSheet(path = SOURCE) {
  const img = loadSheet(path);
  const { width, height } = img;
  const bg = estimateBackground(img, 16, 4);
  const diff = differenceMap(img, bg);
  const solid = solidMask(img, { threshold: 20, grow: 2 });

  const alpha = new Uint8Array(width * height);
  const core = new Uint8Array(width * height);
  for (let i = 0; i < diff.length; i++) {
    const d = diff[i];
    if (solid[i] || d > ALPHA_HIGH) alpha[i] = 255;
    else if (d > ALPHA_LOW)
      alpha[i] = Math.round(((d - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW)) * 255);
    if (solid[i] || d > CORE) core[i] = 1;
  }

  despeckle(core, width, height, MIN_COMPONENT);
  fillHoles(core, width, height);

  const dark = new Uint8Array(core.length);
  for (let i = 0; i < core.length; i++) {
    if (diff[i] <= CORE) continue;
    const s = i * 4;
    if (isDark(img.data[s], img.data[s + 1], img.data[s + 2])) dark[i] = 1;
  }

  const { labels, boxes, sizes } = label(core, width, height);

  const slices = rowSlices(dark, width, height);
  const frames = [];
  for (let row = 0; row < slices.length; row++) {
    const [top, bottom] = slices[row];

    // how much of each component lives in this slice: a sprite from the row
    // below pokes in with only a sliver of its pixels
    const inSlice = new Map();
    for (let y = top; y < bottom; y++)
      for (let x = 0; x < width; x++) {
        const l = labels[y * width + x];
        if (l) inSlice.set(l, (inSlice.get(l) ?? 0) + 1);
      }
    const belongsHere = (l) => (inSlice.get(l) ?? 0) / (sizes.get(l) ?? 1) > 0.5;

    const bodies = clusters(dark, width, top, bottom, MIN_DARK);
    const effects = clusters(core, width, top, bottom, MIN_EFFECT).filter(
      (c) => !bodies.some((b) => c[0] <= b[1] + GLOW_MARGIN && c[1] >= b[0] - GLOW_MARGIN),
    );

    const spans = [
      ...bodies.map((span) => ({ span, kind: 'body' })),
      ...effects.map((span) => ({ span, kind: 'effect' })),
    ].sort((a, b) => a.span[0] - b.span[0]);

    spans.forEach((item, i) => {
      const [x0, x1] = item.span;
      const prev = spans[i - 1]?.span;
      const next = spans[i + 1]?.span;
      const left = Math.max(prev ? Math.floor((prev[1] + x0) / 2) : 0, x0 - GLOW_MARGIN);
      const right = Math.min(
        next ? Math.ceil((x1 + next[0]) / 2) : width - 1,
        x1 + GLOW_MARGIN,
      );

      // components under this frame's own cluster
      const accepted = new Set();
      const seed = item.kind === 'body' ? dark : core;
      for (let y = top; y < bottom; y++)
        for (let x = x0; x <= x1; x++) {
          const l = labels[y * width + x];
          if (l && seed[y * width + x] && belongsHere(l)) accepted.add(l);
        }
      // plus detached glow that lives entirely inside the frame window
      for (const [l, b] of boxes) {
        if (accepted.has(l)) continue;
        if (b.x >= left && b.x + b.w - 1 <= right && b.y >= top && b.y + b.h - 1 < bottom)
          accepted.add(l);
      }
      if (accepted.size === 0) return;

      const box = tighten(core, labels, accepted, width, left, right, top, bottom);
      if (!box) return;
      const ref =
        tighten(dark, labels, accepted, width, x0, x1, top, bottom) ?? box;
      frames.push({
        row,
        col: 0,
        kind: item.kind,
        ...box,
        labels: accepted,
        clip: { left, right, top, bottom: bottom - 1 },
        anchor: standingPoint(dark, labels, accepted, width, ref),
      });
    });
  }

  const perRow = new Map();
  for (const f of frames) {
    const n = perRow.get(f.row) ?? 0;
    f.col = n;
    perRow.set(f.row, n + 1);
  }

  return { img, alpha, labels, frames };
}

/* ------------------------------------------------------------------ helpers */

/**
 * The sheet's rows are neither 128px tall nor evenly spaced (they start at
 * y = 5, 134, 250, 374, 494 ...), so the row windows are measured from the
 * image. Rows whose sprites almost touch vertically come back as one band and
 * are split at the thinnest scanlines.
 */
function rowSlices(dark, width, height) {
  const counts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) if (dark[y * width + x]) count++;
    counts[y] = count;
  }

  const merged = [];
  for (const band of bands(counts, 2, 3)) {
    const last = merged[merged.length - 1];
    if (last && band[0] - last[1] - 1 <= 6) last[1] = band[1];
    else merged.push([band[0], band[1]]);
  }

  const heights = merged.map(([a, b]) => b - a + 1).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] || ROW_HEIGHT;

  const out = [];
  for (const [top, bottom] of merged) {
    const span = bottom - top + 1;
    const parts = Math.max(1, Math.round(span / typical));
    if (parts === 1) {
      out.push([top, bottom]);
      continue;
    }
    let start = top;
    for (let p = 1; p < parts; p++) {
      const target = top + Math.round((span * p) / parts);
      let cut = target;
      let best = Infinity;
      for (let y = Math.max(start + 20, target - 24); y <= Math.min(bottom - 20, target + 24); y++) {
        if (counts[y] < best) {
          best = counts[y];
          cut = y;
        }
      }
      out.push([start, cut]);
      start = cut + 1;
    }
    out.push([start, bottom]);
  }

  // pad upward for glow above the heads, without crossing into the row above
  return out.map(([top, bottom], i) => {
    const prevBottom = i > 0 ? out[i - 1][1] : -Infinity;
    return [Math.max(0, Math.max(prevBottom + 1, top - 16)), Math.min(height, bottom + 5)];
  });
}

/** 4-connected labelling of a boolean mask, with per-label bounding boxes. */
function label(mask, width, height) {
  const labels = new Int32Array(mask.length);
  const boxes = new Map();
  const sizes = new Map();
  let next = 0;
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    next += 1;
    stack.length = 0;
    stack.push(start);
    labels[start] = next;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let count = 0;
    while (stack.length) {
      const i = stack.pop();
      count++;
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || labels[n] || !mask[n]) continue;
        labels[n] = next;
        stack.push(n);
      }
    }
    boxes.set(next, { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    sizes.set(next, count);
  }
  return { labels, boxes, sizes };
}

function clusters(mask, width, y0, y1, minWeight) {
  const cols = new Int32Array(width);
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < width; x++) if (mask[y * width + x]) cols[x]++;

  const merged = [];
  for (const band of bands(cols, 0, 2)) {
    const last = merged[merged.length - 1];
    if (last && band[0] - last[1] - 1 <= CLUSTER_GAP) last[1] = band[1];
    else merged.push([band[0], band[1]]);
  }

  return merged.filter(([a, b]) => {
    let weight = 0;
    for (let x = a; x <= b; x++) weight += cols[x];
    return weight >= minWeight;
  });
}

/** Bounding box of `mask` pixels belonging to `accepted` components. */
function tighten(mask, labels, accepted, width, x0, x1, y0, y1) {
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      if (!mask[i] || !accepted.has(labels[i])) continue;
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
 * Where the character stands: horizontal centre of the lowest slice of dark
 * pixels (the boots) plus the baseline itself.
 */
function standingPoint(dark, labels, accepted, width, box) {
  const baseline = box.y + box.h - 1;
  const bandTop = Math.max(box.y, baseline - 11);
  let sum = 0;
  let count = 0;
  for (let y = bandTop; y <= baseline; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = y * width + x;
      if (!dark[i] || !accepted.has(labels[i])) continue;
      sum += x;
      count++;
    }
  }
  return { x: count ? sum / count : box.x + box.w / 2, y: baseline };
}

function despeckle(mask, width, height, minSize) {
  const { labels, sizes } = label(mask, width, height);
  const drop = new Set();
  for (const [l, size] of sizes) if (size < minSize) drop.add(l);
  for (let i = 0; i < mask.length; i++) if (drop.has(labels[i])) mask[i] = 0;
}

/** Flood fill from the border: anything unreachable is sprite interior. */
function fillHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const stack = [];
  const push = (i) => {
    if (i < 0 || i >= mask.length || outside[i] || mask[i]) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !outside[i]) mask[i] = 1;
}

/**
 * Copies one segmented frame onto a transparent surface of `target` size,
 * putting its standing point at `anchor`. Optionally mirrored horizontally.
 */
export function cutFrame(sheet, frame, target, anchor, { mirror = false } = {}) {
  const { img, alpha, labels } = sheet;
  const surface = new Surface(target.w, target.h);
  const ox = Math.round(anchor.x - frame.anchor.x);
  const oy = Math.round(anchor.y - frame.anchor.y);
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const i = y * img.width + x;
      let a = alpha[i];
      if (a === 0) continue;
      // only pixels of this frame's own components — keeps the neighbouring
      // row's hair out of the cut
      if (!frame.labels.has(labels[i])) continue;
      // Glow cut off by the frame window would leave a hard rectangular edge,
      // so soften it. Opaque character pixels are never touched.
      if (a < 255) a = Math.round(a * clipFade(frame, x, y));
      if (a === 0) continue;
      const s = i * 4;
      const dx = mirror ? Math.round(2 * anchor.x - (x + ox)) : x + ox;
      surface.set(dx, y + oy, [img.data[s], img.data[s + 1], img.data[s + 2], a]);
    }
  }
  return surface;
}

/** 1 inside the window, ramping to 0 at a boundary that actually clipped. */
const FADE = 9;

function clipFade(frame, x, y) {
  const clip = frame.clip;
  if (!clip) return 1;
  let factor = 1;
  const ramp = (distance) => Math.max(0, Math.min(1, distance / FADE));
  if (frame.x <= clip.left) factor = Math.min(factor, ramp(x - clip.left));
  if (frame.x + frame.w - 1 >= clip.right) factor = Math.min(factor, ramp(clip.right - x));
  if (frame.y <= clip.top) factor = Math.min(factor, ramp(y - clip.top));
  if (frame.y + frame.h - 1 >= clip.bottom) factor = Math.min(factor, ramp(clip.bottom - y));
  return factor;
}

/* -------------------------------------------------------------------- CLI */

const argv = process.argv.slice(2);
if (argv.includes('--report') || argv.includes('--dump')) {
  const sheet = analyseSheet();
  const { frames } = sheet;
  const byRow = new Map();
  for (const f of frames) {
    if (!byRow.has(f.row)) byRow.set(f.row, []);
    byRow.get(f.row).push(f);
  }
  for (const [row, list] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(
      `row ${row}: ${list.length} frames  ` +
        list
          .map((f) => `${f.col}${f.kind === 'effect' ? '*' : ''}:${f.w}x${f.h}`)
          .join(' '),
    );
  }

  const dumpIdx = argv.indexOf('--dump');
  if (dumpIdx !== -1 && argv[dumpIdx + 1]) {
    const dir = argv[dumpIdx + 1];
    mkdirSync(dir, { recursive: true });
    const CELL = { w: 144, h: 144 };
    for (const [row, list] of byRow.entries()) {
      const strip = new Surface(list.length * CELL.w, CELL.h);
      for (let y = 0; y < strip.height; y++)
        for (let x = 0; x < strip.width; x++)
          strip.set(x, y, ((x >> 3) + (y >> 3)) % 2 ? [58, 62, 74, 255] : [40, 44, 54, 255]);
      list.forEach((f, i) => {
        const cut = cutFrame(sheet, f, CELL, { x: CELL.w / 2, y: CELL.h - 16 });
        strip.blit(cut, i * CELL.w, 0);
        writeFileSync(join(dir, `r${row}c${f.col}.png`), encodePNG(cut));
      });
      writeFileSync(join(dir, `row${row}.png`), encodePNG(strip));
    }
    console.log(`dumped ${frames.length} frames -> ${dir}`);
  }
}
