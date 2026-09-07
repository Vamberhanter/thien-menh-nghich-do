// Cuts the user-supplied concept sheets into runtime sprites. The sheets were
// converted to real PNGs under source-art/gameplay because the originals were
// JPEG files carrying a .png extension.
//
// The generated sprites stay out of git with the other staged game art. Run:
//   npm run env:resources
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { encodePNG } from './png.mjs';

const SOURCE_DIR = join('source-art', 'gameplay');
const OUT_DIR = join('public', 'assets', 'resources');

function crop(image, rect) {
  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}

/**
 * Turns a black/dark concept-sheet background transparent. `low` is fully
 * transparent and `high` fully opaque; the ramp keeps coloured glows soft.
 */
function keyDark(image, low, high) {
  const out = { ...image, data: image.data.slice() };
  for (let i = 0; i < out.data.length; i += 4) {
    const value = Math.max(out.data[i], out.data[i + 1], out.data[i + 2]);
    const keyed = Math.max(0, Math.min(1, (value - low) / (high - low)));
    out.data[i + 3] = Math.round(out.data[i + 3] * keyed);
  }
  return out;
}

function trim(image, padding = 2) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error('sprite became empty after background removal');
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(image.width - 1, maxX + padding);
  maxY = Math.min(image.height - 1, maxY + padding);
  return crop(image, {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  });
}

function write(name, image) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, encodePNG(image));
  console.log(`${path}  ${image.width}x${image.height}`);
}

mkdirSync(OUT_DIR, { recursive: true });

// Five raw elemental stones from the bottom row: wood, water, fire, earth and
// void. Boundaries are measured between the five evenly spaced columns.
const stones = decodePNG(join(SOURCE_DIR, 'spirit-stones.png'));
const STONE_NAMES = ['wood', 'water', 'fire', 'earth', 'void'];
for (let col = 0; col < STONE_NAMES.length; col++) {
  const x0 = Math.floor((col * stones.width) / 5);
  const x1 = Math.floor(((col + 1) * stones.width) / 5);
  const sprite = trim(keyDark(crop(stones, { x: x0, y: 420, width: x1 - x0, height: 262 }), 2, 28));
  write(`stone-${STONE_NAMES[col]}.png`, sprite);
}

// The third chest in each rarity row. Keeping the same upgrade step makes the
// colour/silhouette change communicate rarity rather than physical size.
const chests = decodePNG(join(SOURCE_DIR, 'treasure-chests.png'));
const CHEST_ROWS = [
  { name: 'common', y: 15 },
  { name: 'rare', y: 150 },
  { name: 'epic', y: 288 },
  { name: 'legendary', y: 425 },
  { name: 'mythic', y: 557 },
];
for (const row of CHEST_ROWS) {
  const sprite = trim(keyDark(crop(chests, { x: 440, y: row.y, width: 175, height: 115 }), 34, 72));
  write(`chest-${row.name}.png`, sprite);
}

// Large variants from the waypoint sheet. Runtime display heights normalize
// them beside the 110px characters, so source detail remains available.
const waypoints = decodePNG(join(SOURCE_DIR, 'waypoints.png'));
write(
  'respawn-shrine.png',
  trim(keyDark(crop(waypoints, { x: 0, y: 0, width: 330, height: 480 }), 2, 30)),
);
write(
  'warp-shrine.png',
  trim(keyDark(crop(waypoints, { x: 510, y: 0, width: 320, height: 480 }), 2, 30)),
);
