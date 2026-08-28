// Measures the ground a locomotion clip is drawn to cover, by tracking the feet.
//
//   node tools/measure-stride.mjs walk_side run_side ...
//
// A planted foot slides backwards across the sprite at exactly the ground speed,
// so the drawn stride is the total backward travel of the planted foot over one
// full row. Getting this wrong makes the clip play at the wrong rate: too small
// a stride and the cycle is sped up until the arms flail.
import { readFileSync } from 'node:fs';
import { decodePNG } from './png-decode.mjs';

const ATLAS_DIR = 'public/assets/characters/nhuyen/atlas';
const atlas = JSON.parse(readFileSync(`${ATLAS_DIR}/nhuyen.json`, 'utf8'));
const images = new Map();

function imageFor(file) {
  if (!images.has(file)) images.set(file, decodePNG(`${ATLAS_DIR}/${file}`));
  return images.get(file);
}

function loadClip(clip) {
  const out = [];
  for (const texture of atlas.textures) {
    for (const frame of texture.frames) {
      const match = new RegExp(`^${clip}_(\\d+)$`).exec(frame.filename);
      if (!match) continue;
      const img = imageFor(texture.image);
      const { x, y, w, h } = frame.frame;
      const px = (i, j) => {
        const s = ((y + j) * img.width + (x + i)) * 4;
        return [img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3]];
      };
      out[+match[1]] = { index: +match[1], w, h, px };
    }
  }
  return out.filter(Boolean);
}

/** Boots: the darkest pixels in the bottom fifth of the frame. */
function footClusters(frame) {
  let bottom = -1;
  for (let y = frame.h - 1; y >= 0 && bottom < 0; y--)
    for (let x = 0; x < frame.w; x++)
      if (frame.px(x, y)[3] > 60) {
        bottom = y;
        break;
      }
  if (bottom < 0) return [];

  const band = Math.max(0, bottom - 9);
  const columns = new Int32Array(frame.w);
  for (let y = band; y <= bottom; y++) {
    for (let x = 0; x < frame.w; x++) {
      const [r, g, b, a] = frame.px(x, y);
      if (a < 60) continue;
      // boots are the dark tone down there; the white hem is not
      if ((r + g + b) / 3 < 110) columns[x]++;
    }
  }

  const clusters = [];
  let start = -1;
  for (let x = 0; x <= frame.w; x++) {
    const on = x < frame.w && columns[x] > 0;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      const width = x - start;
      if (width >= 4) {
        let sum = 0;
        let weight = 0;
        for (let i = start; i < x; i++) {
          sum += i * columns[i];
          weight += columns[i];
        }
        clusters.push({ from: start, to: x - 1, centre: Math.round(sum / weight) });
      }
      start = -1;
    }
  }
  return clusters;
}

for (const clip of process.argv.slice(2)) {
  const frames = loadClip(clip);
  console.log(`\n${clip} (${frames.length} frames)`);
  const lead = [];
  for (const frame of frames) {
    const clusters = footClusters(frame);
    const centred = clusters.map((c) => c.centre - Math.round(frame.w / 2));
    lead.push(centred);
    console.log(
      `  f${frame.index}: ${clusters.length} foot cluster(s) at x ${centred.join(', ')}` +
        `   (span ${clusters.map((c) => `${c.from}-${c.to}`).join(' ')})`,
    );
  }
  // Backward travel of the rear foot from frame to frame: negative deltas are
  // the planted foot sliding back, which is the ground being covered.
  let travel = 0;
  for (let i = 1; i < lead.length; i++) {
    const prev = Math.min(...lead[i - 1]);
    const now = Math.min(...lead[i]);
    const delta = now - prev;
    if (delta < 0) travel += -delta;
  }
  console.log(`  rear-foot backward travel across the row: ${travel}px`);
}
