// Cuts the Brave-Frontier-style Miku sheet into a feet-pivot Phaser atlas.
//   node tools/build-miku-atlas.mjs
//
// Source is one 4x6 grid on a white canvas. Sprites bleed across cell lines
// (twin-tails, sword trails). Each cell seeds a flood that may enter a
// neighbour's margin but never its core, so a pose stays whole.
import { mkdirSync, writeFileSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { decodePNG } from './png-decode.mjs';
import { packFrames } from './atlas-pack.mjs';

function safeWrite(path, data) {
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  const CHUNK = 60000;
  const fd = openSync(path, 'w');
  try {
    for (let i = 0; i < buf.length; i += CHUNK) {
      writeSync(fd, buf.subarray(i, i + CHUNK));
    }
  } finally {
    closeSync(fd);
  }
}

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
  { name: 'idle_down', cells: [CELL.idle], anchor: 'feet', breathe: 8 },
  { name: 'idle_up', cells: [CELL.idle], anchor: 'feet', breathe: 8 },
  { name: 'idle_right', cells: [CELL.idle], anchor: 'feet', breathe: 8 },

  {
    name: 'walk_down',
    cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.ready1, CELL.ready0, CELL.lunge1, CELL.ready0],
    anchor: 'cycle',
    inbetween: 1,
    bob: true,
  },
  {
    name: 'walk_up',
    cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.ready1, CELL.ready0, CELL.lunge1, CELL.ready0],
    anchor: 'cycle',
    inbetween: 1,
    bob: true,
  },
  {
    name: 'walk_side',
    cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.lunge0, CELL.lunge1, CELL.ready2, CELL.ready1],
    anchor: 'cycle',
    inbetween: 1,
    bob: true,
  },

  { name: 'atk1_side', cells: [CELL.ready0, CELL.ready1, CELL.ready2, CELL.lunge0, CELL.slashBig], anchor: 'feet', inbetween: 1 },
  { name: 'atk2_side', cells: [CELL.slashDown, CELL.slashUp, CELL.slashSpin, CELL.slashLeap], anchor: 'feet', inbetween: 1 },
  { name: 'atk3_side', cells: [CELL.slashLeap, CELL.slashLow, CELL.slashBig, CELL.ready2], anchor: 'feet', inbetween: 1 },

  {
    name: 'cast_side',
    cells: [CELL.castCircle, CELL.thrust, CELL.castVortex, CELL.cheer, CELL.castVortex],
    anchor: 'feet',
    inbetween: 1,
  },

  { name: 'hurt', cells: [CELL.crawl, CELL.sit, CELL.crawl], anchor: 'feet', inbetween: 1 },
  { name: 'death', cells: [CELL.sit, CELL.ko], anchor: 'feet', dissolve: 5 },

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
 * Seed each cell from the opaque pixels inside its grid rectangle, then flood
 * outward so twin-tails / sword trails that cross a grid line stay attached.
 *
 * Expansion may enter a neighbour's margin, but never its *core* (the inset
 * centre of that neighbour). That keeps a pose whole without swallowing the
 * next character on the sheet.
 */
function cutAllCells(img) {
  const { width, height, data } = img;
  const rects = cellRects(width, height);
  const CORE_INSET = 0.18;
  const MARGIN = 0.55;

  const cores = rects.map((r) => {
    const bw = r.x1 - r.x0;
    const bh = r.y1 - r.y0;
    const ix = Math.round(bw * CORE_INSET);
    const iy = Math.round(bh * CORE_INSET);
    return { x0: r.x0 + ix, y0: r.y0 + iy, x1: r.x1 - ix, y1: r.y1 - iy };
  });

  const expands = rects.map((r) => {
    const bw = r.x1 - r.x0;
    const bh = r.y1 - r.y0;
    const mx = Math.round(bw * MARGIN);
    const my = Math.round(bh * MARGIN);
    return {
      x0: Math.max(0, r.x0 - mx),
      y0: Math.max(0, r.y0 - my),
      x1: Math.min(width, r.x1 + mx),
      y1: Math.min(height, r.y1 + my),
    };
  });

  const inRect = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
  const cells = [];

  for (let cell = 0; cell < rects.length; cell++) {
    const owned = new Uint8Array(width * height);
    const stack = [];
    const r = rects[cell];
    const expand = expands[cell];

    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const i = y * width + x;
        if (data[i * 4 + 3] === 0) continue;
        owned[i] = 1;
        stack.push(x, y);
      }
    }

    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (!inRect(expand, nx, ny)) continue;
        const i = ny * width + nx;
        if (owned[i] || data[i * 4 + 3] === 0) continue;
        let inForeignCore = false;
        for (let other = 0; other < cores.length; other++) {
          if (other === cell) continue;
          if (inRect(cores[other], nx, ny)) {
            inForeignCore = true;
            break;
          }
        }
        if (inForeignCore) continue;
        owned[i] = 1;
        stack.push(nx, ny);
      }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    for (let y = expand.y0; y < expand.y1; y++) {
      for (let x = expand.x0; x < expand.x1; x++) {
        const i = y * width + x;
        if (!owned[i]) continue;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (count < MIN_BLOB) {
      cells[cell] = new Surface(1, 1);
      continue;
    }

    const surface = new Surface(maxX - minX + 1, maxY - minY + 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const i = y * width + x;
        if (!owned[i]) continue;
        const s = i * 4;
        surface.set(x - minX, y - minY, [data[s], data[s + 1], data[s + 2], data[s + 3]]);
      }
    }
    cells[cell] = surface;
  }
  return cells;
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
  let w = box.w;
  let h = box.h;
  while (true) {
    const out = new Surface(w, h);
    const targetX = w / 2;
    const targetY = kind === 'centre' ? h / 2 : h - PAD - 1;
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
        if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
        out.set(dx, dy, [r, g, b, a]);
        kept++;
      }
    }
    if (kept >= total) {
      return {
        surface: out,
        anchor: { x: (anchorPx.x + ox) / w, y: (anchorPx.y + oy) / h },
      };
    }
    w += PAD * 2;
    h += PAD * 2;
  }
}

function breathe(base, step) {
  const out = new Surface(base.width + 2, base.height + 3);
  const ox = 1;
  const oy = 1;
  const phase = (step / 8) * Math.PI * 2;
  const lift = Math.round((1 + Math.sin(phase)) * 1);
  const glow = Math.sin(phase);
  const sway = Math.sin(phase) >= 0 ? 1 : -1;

  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      const [r, g, b, a] = base.get(x, y);
      if (!a) continue;
      let nr = r;
      let ng = g;
      let nb = b;
      if (g > r && b > r) {
        const boost = Math.round(glow * 6 + 6);
        ng = Math.min(255, g + boost);
        nb = Math.min(255, b + Math.round(boost * 0.75));
      }
      let dx = x + ox;
      let dy = y + oy - lift;
      if (y < base.height * 0.45) dx += sway;
      if (out.inside(dx, dy)) out.set(dx, dy, [nr, ng, nb, a]);
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

/** Stamp a frame onto a canvas so its feet land on (feetX, feetY). */
function stampAtFeet(dest, frame, feetX, feetY) {
  const ox = Math.round(feetX - frame.anchorPx.x);
  const oy = Math.round(feetY - frame.anchorPx.y);
  for (let y = 0; y < frame.surface.height; y++) {
    for (let x = 0; x < frame.surface.width; x++) {
      const [r, g, b, a] = frame.surface.get(x, y);
      if (!a) continue;
      const dx = x + ox;
      const dy = y + oy;
      if (!dest.inside(dx, dy)) continue;
      const prev = dest.get(dx, dy);
      if (a >= prev[3]) dest.set(dx, dy, [r, g, b, a]);
    }
  }
}

/**
 * Crossfade two feet-aligned frames. t in (0,1).
 * Soft blend reads as motion on chibi art; hard nearest looks like a flicker.
 */
function lerpFrames(a, b, t) {
  const pad = 4;
  const left = Math.max(a.anchorPx.x, b.anchorPx.x) + pad;
  const right = Math.max(a.surface.width - a.anchorPx.x, b.surface.width - b.anchorPx.x) + pad;
  const above = Math.max(a.anchorPx.y, b.anchorPx.y) + pad;
  const below = Math.max(a.surface.height - a.anchorPx.y, b.surface.height - b.anchorPx.y) + pad;
  const w = Math.ceil(left + right);
  const h = Math.ceil(above + below);
  const feetX = left;
  const feetY = above;
  const ca = new Surface(w, h);
  const cb = new Surface(w, h);
  stampAtFeet(ca, a, feetX, feetY);
  stampAtFeet(cb, b, feetX, feetY);
  const out = new Surface(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const A = ca.get(x, y);
      const B = cb.get(x, y);
      if (!A[3] && !B[3]) continue;
      const r = Math.round(A[0] * (1 - t) + B[0] * t);
      const g = Math.round(A[1] * (1 - t) + B[1] * t);
      const b = Math.round(A[2] * (1 - t) + B[2] * t);
      const alpha = Math.round(A[3] * (1 - t) + B[3] * t);
      if (alpha < 8) continue;
      out.set(x, y, [r, g, b, alpha]);
    }
  }
  return { surface: out, anchorPx: { x: feetX, y: feetY } };
}

function bobFrame(frame, step) {
  const lift = step % 2 === 0 ? 0 : -1;
  const out = new Surface(frame.surface.width, frame.surface.height + 2);
  for (let y = 0; y < frame.surface.height; y++) {
    for (let x = 0; x < frame.surface.width; x++) {
      const px = frame.surface.get(x, y);
      if (!px[3]) continue;
      const yy = y + 1 + lift;
      if (yy >= 0 && yy < out.height) out.set(x, yy, px);
    }
  }
  return {
    surface: out,
    anchorPx: { x: frame.anchorPx.x, y: frame.anchorPx.y + 1 + lift },
  };
}

function buildClipFrames(cells, clip) {
  const raw = clip.cells.map((index) => {
    let surface = cells[index];
    if (clip.trail) surface = trailOnly(surface);
    const kind = clip.anchor === 'cycle' ? 'feet' : clip.anchor;
    return { surface, anchorPx: anchorOf(surface, kind) };
  });

  let expanded = [];
  if (clip.breathe) {
    const frame = raw[0];
    for (let i = 0; i < clip.breathe; i++) {
      const s = breathe(frame.surface, i);
      expanded.push({ surface: s, anchorPx: anchorOf(s, 'feet') });
    }
  } else {
    expanded = [...raw];
  }

  if (clip.inbetween > 0) {
    const n = clip.inbetween;
    const interleaved = [];
    for (let i = 0; i < expanded.length; i++) {
      interleaved.push(expanded[i]);
      if (i < expanded.length - 1) {
        const a = expanded[i];
        const b = expanded[i + 1];
        for (let k = 0; k < n; k++) {
          const t = (k + 1) / (n + 1);
          interleaved.push(lerpFrames(a, b, t));
        }
      }
    }
    expanded = interleaved;
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

  if (clip.bob) {
    expanded = expanded.map((frame, i) => bobFrame(frame, i));
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
    safeWrite(join(OUT_DIR, group.file), encodePNG(packed.surface));
    textures.push({
      image: group.file,
      format: 'RGBA8888',
      size: { w: packed.surface.width, h: packed.surface.height },
      scale: 1,
      frames: packed.frames,
    });
    console.log(`wrote ${group.file}  ${packed.surface.width}x${packed.surface.height}`);
  }

  safeWrite(
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
