// Measures how smooth a locomotion clip is, and finds the smoothest cyclic
// order of its frames.
//
//   node tools/analyse-cycle.mjs <clip> [clip...]
//
// Hand-made walk/run rows are often not authored as a clean cycle: consecutive
// frames can throw the sword arm from full-back to full-forward, which reads as
// flailing once the clip plays at running speed. Two numbers per clip:
//
//   step   mean silhouette change between consecutive frames (loop included).
//          Lower is smoother.
//   reach  x of the furthest sprite pixel in the arm band, per frame. A clean
//          swing rises and falls once; a noisy one zig-zags.
import { readFileSync } from 'node:fs';
import { decodePNG } from './png-decode.mjs';

const ATLAS_DIR = 'public/assets/characters/nhuyen/atlas';
const atlas = JSON.parse(readFileSync(`${ATLAS_DIR}/nhuyen.json`, 'utf8'));

const images = new Map();
function imageFor(file) {
  if (!images.has(file)) images.set(file, decodePNG(`${ATLAS_DIR}/${file}`));
  return images.get(file);
}

/** Every frame of a clip, as its own alpha mask + colour buffer. */
function loadClip(clip) {
  const out = [];
  for (const texture of atlas.textures) {
    for (const frame of texture.frames) {
      const match = new RegExp(`^${clip}_(\\d+)$`).exec(frame.filename);
      if (!match) continue;
      const img = imageFor(texture.image);
      const { x, y, w, h } = frame.frame;
      const alpha = new Uint8Array(w * h);
      const rgb = new Uint8Array(w * h * 3);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const s = ((y + j) * img.width + (x + i)) * 4;
          const d = j * w + i;
          alpha[d] = img.data[s + 3];
          rgb[d * 3] = img.data[s];
          rgb[d * 3 + 1] = img.data[s + 1];
          rgb[d * 3 + 2] = img.data[s + 2];
        }
      }
      out[+match[1]] = { index: +match[1], w, h, alpha, rgb };
    }
  }
  return out.filter(Boolean);
}

/** Mean absolute silhouette difference, 0..1. */
function silhouetteDistance(a, b) {
  let diff = 0;
  let union = 0;
  for (let i = 0; i < a.alpha.length; i++) {
    const p = a.alpha[i] > 40 ? 1 : 0;
    const q = b.alpha[i] > 40 ? 1 : 0;
    if (p || q) union++;
    if (p !== q) diff++;
  }
  return union ? diff / union : 0;
}

/**
 * How far the sword arm reaches, per frame: the furthest opaque pixel in the
 * band where the blade is drawn (waist to knee), measured from the sprite's
 * horizontal centre. The art faces right, so a bigger number is a more
 * forward-extended arm.
 */
function armReach(frame) {
  const top = Math.round(frame.h * 0.52);
  const bottom = Math.round(frame.h * 0.82);
  let reach = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = frame.w - 1; x >= 0; x--) {
      if (frame.alpha[y * frame.w + x] > 40) {
        reach = Math.max(reach, x - frame.w / 2);
        break;
      }
    }
  }
  return Math.round(reach);
}

/** Total cost of a cyclic order. */
function cycleCost(order, distance) {
  let total = 0;
  for (let i = 0; i < order.length; i++)
    total += distance[order[i]][order[(i + 1) % order.length]];
  return total;
}

/** Brute force the cheapest cycle; frame 0 is pinned to kill the symmetry. */
function bestCycle(count, distance) {
  const rest = Array.from({ length: count - 1 }, (_, i) => i + 1);
  let best = null;
  const permute = (fixed, remaining) => {
    if (remaining.length === 0) {
      const order = [0, ...fixed];
      const cost = cycleCost(order, distance);
      if (!best || cost < best.cost) best = { order, cost };
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining.slice();
      const [pick] = next.splice(i, 1);
      permute([...fixed, pick], next);
    }
  };
  permute([], rest);
  return best;
}

for (const clip of process.argv.slice(2)) {
  const frames = loadClip(clip);
  if (frames.length === 0) {
    console.log(`${clip}: no frames`);
    continue;
  }

  const distance = frames.map((a) => frames.map((b) => silhouetteDistance(a, b)));
  const current = frames.map((_, i) => i);
  const best = bestCycle(frames.length, distance);

  const steps = current.map((i) => distance[i][current[(i + 1) % current.length]]);
  const bestSteps = best.order.map((f, i) => distance[f][best.order[(i + 1) % best.order.length]]);

  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(`\n${clip}  (${frames.length} frames)`);
  console.log(`  reach per frame : ${frames.map(armReach).join(', ')}`);
  console.log(`  order as drawn  : ${current.join(' ')}`);
  console.log(
    `    step mean ${pct(steps.reduce((s, v) => s + v, 0) / steps.length)}` +
      `  worst ${pct(Math.max(...steps))}  [${steps.map(pct).join(' ')}]`,
  );
  console.log(`  smoothest cycle : ${best.order.join(' ')}`);
  console.log(
    `    step mean ${pct(bestSteps.reduce((s, v) => s + v, 0) / bestSteps.length)}` +
      `  worst ${pct(Math.max(...bestSteps))}  [${bestSteps.map(pct).join(' ')}]`,
  );
  console.log(`  reach in that order: ${best.order.map((i) => armReach(frames[i])).join(', ')}`);

  // Fewer, better-matched poses can read calmer than every frame the sheet has.
  for (let size = frames.length - 1; size >= 4; size--) {
    let winner = null;
    for (const subset of combinations(frames.length, size)) {
      const sub = subset.map((i) => subset.map((j) => distance[i][j]));
      const local = bestCycle(size, sub);
      const mean = local.cost / size;
      if (!winner || mean < winner.mean)
        winner = { mean, order: local.order.map((i) => subset[i]) };
    }
    console.log(
      `  best ${size} of ${frames.length}: ${winner.order.join(' ')}` +
        `  step mean ${pct(winner.mean)}`,
    );
  }
}

/** All index subsets of `size` out of `count`. */
function combinations(count, size) {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length === size) {
      out.push(picked.slice());
      return;
    }
    for (let i = start; i < count; i++) walk(i + 1, [...picked, i]);
  };
  walk(0, []);
  return out;
}
