// Shared helpers for cutting the hand-made Lâm Uyên sheet into clean frames.
// The source sheet has a soft grey-blue gradient background instead of alpha,
// so the background has to be modelled and subtracted.
import { decodePNG } from './png-decode.mjs';

export function loadSheet(path) {
  return decodePNG(path);
}

const at = (img, x, y) => (y * img.width + x) * 4;

/**
 * Low-frequency background estimate.
 * Block medians (robust to sprites) -> median filter on the coarse grid ->
 * bilinear upsample. Sprites are high-frequency, the gradient is not.
 */
export function estimateBackground(img, block = 16, medianRadius = 4) {
  const cw = Math.ceil(img.width / block);
  const chh = Math.ceil(img.height / block);
  const coarse = new Float32Array(cw * chh * 3);

  const bucket = [[], [], []];
  for (let by = 0; by < chh; by++) {
    for (let bx = 0; bx < cw; bx++) {
      bucket[0].length = 0;
      bucket[1].length = 0;
      bucket[2].length = 0;
      for (let y = by * block; y < Math.min(img.height, (by + 1) * block); y++) {
        for (let x = bx * block; x < Math.min(img.width, (bx + 1) * block); x++) {
          const i = at(img, x, y);
          bucket[0].push(img.data[i]);
          bucket[1].push(img.data[i + 1]);
          bucket[2].push(img.data[i + 2]);
        }
      }
      for (let c = 0; c < 3; c++) coarse[(by * cw + bx) * 3 + c] = median(bucket[c]);
    }
  }

  // Median filter the coarse grid: kills blocks fully covered by a sprite.
  const smooth = new Float32Array(coarse.length);
  const window = [];
  for (let by = 0; by < chh; by++) {
    for (let bx = 0; bx < cw; bx++) {
      for (let c = 0; c < 3; c++) {
        window.length = 0;
        for (let dy = -medianRadius; dy <= medianRadius; dy++) {
          for (let dx = -medianRadius; dx <= medianRadius; dx++) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx < 0 || ny < 0 || nx >= cw || ny >= chh) continue;
            window.push(coarse[(ny * cw + nx) * 3 + c]);
          }
        }
        smooth[(by * cw + bx) * 3 + c] = median(window);
      }
    }
  }

  return { cw, ch: chh, block, data: smooth };
}

export function backgroundAt(bg, x, y) {
  // bilinear sample of the coarse grid, block centres at (i+0.5)*block
  const fx = Math.min(bg.cw - 1, Math.max(0, x / bg.block - 0.5));
  const fy = Math.min(bg.ch - 1, Math.max(0, y / bg.block - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(bg.cw - 1, x0 + 1);
  const y1 = Math.min(bg.ch - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = bg.data[(y0 * bg.cw + x0) * 3 + c];
    const b = bg.data[(y0 * bg.cw + x1) * 3 + c];
    const d = bg.data[(y1 * bg.cw + x0) * 3 + c];
    const e = bg.data[(y1 * bg.cw + x1) * 3 + c];
    out[c] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + d * (1 - tx) * ty + e * tx * ty;
  }
  return out;
}

/** Per-pixel distance from the modelled background, 0..255-ish. */
export function differenceMap(img, bg) {
  const diff = new Float32Array(img.width * img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = at(img, x, y);
      const b = backgroundAt(bg, x, y);
      const dr = img.data[i] - b[0];
      const dg = img.data[i + 1] - b[1];
      const db = img.data[i + 2] - b[2];
      // luma difference plus chroma difference: catches both the dark hair and
      // the bright blue qi effects sitting on a mid-grey background.
      const luma = Math.abs(0.299 * dr + 0.587 * dg + 0.114 * db);
      const chroma = Math.max(Math.abs(dr - dg), Math.abs(db - dg), Math.abs(dr - db));
      diff[y * img.width + x] = Math.max(luma, chroma * 0.9);
    }
  }
  return diff;
}

/**
 * Solid-sprite mask that does not rely on the background model at all.
 *
 * The sprites are drawn with hard outlines and high internal contrast; the
 * background is a smooth gradient with near-zero local gradient. So: find
 * edges, close them, then flood the background in from the image border —
 * whatever the flood cannot reach is sprite, including a big flat mass of
 * black hair that background subtraction alone reads as "dark background".
 */
export function solidMask(img, { threshold = 20, grow = 2 } = {}) {
  const { width, height, data } = img;
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++)
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  const edge = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -luma[i - width - 1] - 2 * luma[i - 1] - luma[i + width - 1] +
        luma[i - width + 1] + 2 * luma[i + 1] + luma[i + width + 1];
      const gy =
        -luma[i - width - 1] - 2 * luma[i - width] - luma[i - width + 1] +
        luma[i + width - 1] + 2 * luma[i + width] + luma[i + width + 1];
      if (Math.hypot(gx, gy) / 4 > threshold) edge[i] = 1;
    }
  }

  let closed = edge;
  for (let pass = 0; pass < grow; pass++) closed = dilate(closed, width, height);

  // flood the background in from the border, blocked by the closed edges
  const outside = new Uint8Array(width * height);
  const stack = [];
  const push = (i) => {
    if (i < 0 || i >= outside.length || outside[i] || closed[i]) return;
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

  let solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i++) solid[i] = outside[i] ? 0 : 1;
  // undo the edge growing so the silhouette keeps its original size
  for (let pass = 0; pass < grow; pass++) solid = erode(solid, width, height);
  return solid;
}

function dilate(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i]) {
        out[i] = 1;
        continue;
      }
      if (
        (x > 0 && mask[i - 1]) ||
        (x < width - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - width]) ||
        (y < height - 1 && mask[i + width])
      )
        out[i] = 1;
    }
  }
  return out;
}

function erode(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const keep =
        (x === 0 || mask[i - 1]) &&
        (x === width - 1 || mask[i + 1]) &&
        (y === 0 || mask[i - width]) &&
        (y === height - 1 || mask[i + width]);
      if (keep) out[i] = 1;
    }
  }
  return out;
}

export function median(values) {
  if (values.length === 0) return 0;
  const copy = Array.prototype.slice.call(values).sort((a, b) => a - b);
  const mid = copy.length >> 1;
  return copy.length % 2 ? copy[mid] : (copy[mid - 1] + copy[mid]) / 2;
}

/** Column / row occupancy profiles of a boolean mask. */
export function profiles(mask, width, height) {
  const cols = new Int32Array(width);
  const rows = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      cols[x]++;
      rows[y]++;
    }
  }
  return { cols, rows };
}

/** Runs of consecutive indices whose profile value exceeds `threshold`. */
export function bands(profile, threshold, minLength = 1) {
  const out = [];
  let start = -1;
  for (let i = 0; i < profile.length; i++) {
    const on = profile[i] > threshold;
    if (on && start === -1) start = i;
    if ((!on || i === profile.length - 1) && start !== -1) {
      const end = on ? i : i - 1;
      if (end - start + 1 >= minLength) out.push([start, end]);
      start = -1;
    }
  }
  return out;
}
