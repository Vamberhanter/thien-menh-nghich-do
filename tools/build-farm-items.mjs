// Stages the Farm RPG item art into public/. Licensed, so it stays out of git
// (see .gitignore) and is rebuilt on demand.
//
// `Spring Crops.png` lays each crop out on one row: growth stages, then the seed
// packet, then the harvest at five quality grades, then a sign post. Only the
// plain harvest is wanted — the starred grades are the same sprite with a badge
// stuck on, and the packets are lettered paper bags that read as a farming game
// rather than a cultivation one.
//
// Cells are cut at their full 16x16 rather than trimmed, so every icon keeps the
// same apparent scale in the bag grid.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { encodePNG } from './png.mjs';

const PACK = join(
  'Farm RPG FREE 16x16 - Tiny Asset Pack',
  'Farm RPG FREE 16x16 - Tiny Asset Pack',
  'Farm RPG FREE 16x16 - Tiny Asset Pack',
);
const OUT_DIR = join('public', 'assets', 'items');
const TILE = 16;

const CROPS_SHEET = join(PACK, 'Objects', 'Spring Crops.png');
/** The sheet this cell table was measured against. */
const CROPS_SIZE = { width: 224, height: 128 };
/** Column of the plain, ungraded harvest. */
const HARVEST_COL = 8;

/** Crop rows carrying art; the even rows of the sheet are empty. */
const CROPS = [
  { row: 1, to: 'blood-berry.png' },
  { row: 3, to: 'spirit-herb.png' },
  { row: 5, to: 'essence-root.png' },
  { row: 7, to: 'earth-fruit.png' },
];

/** Last planted stage before the seed packet and harvested produce. */
const MATURE_COL = 5;
const PLANTS = [
  { row: 1, to: 'plant-blood-berry.png' },
  { row: 3, to: 'plant-spirit-herb.png' },
  { row: 5, to: 'plant-essence-root.png' },
  { row: 7, to: 'plant-earth-fruit.png' },
];

/**
 * Sub-rects lifted out of a larger sprite and trimmed to their opaque bounds.
 * `chest.png` stacks a closed chest over an open one; the world only ever shows
 * an unlooted pile, and the frame has to hug the chest because WorldScene
 * centres the loot sprite on the drop point.
 */
const FRAMES = [
  {
    from: join('Objects', 'chest.png'),
    to: 'chest.png',
    source: { width: 32, height: 32 },
    rect: { x: 0, y: 0, width: 32, height: 16 },
    expect: { width: 15, height: 13 },
  },
];

function cut(img, col, row) {
  const data = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    const from = ((row * TILE + y) * img.width + col * TILE) * 4;
    data.set(img.data.subarray(from, from + TILE * 4), y * TILE * 4);
  }
  return { width: TILE, height: TILE, data };
}

function opaqueCount(img) {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 8) n++;
  return n;
}

function crop(img, rect) {
  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * img.width + rect.x) * 4;
    data.set(img.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}

function trim(img) {
  let minX = img.width;
  let maxX = -1;
  let minY = img.height;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return crop(img, { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
}

function write(path, img) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(img));
  console.log(`${path}  ${img.width}x${img.height}`);
}

let failed = false;

if (!existsSync(CROPS_SHEET)) {
  console.error(`missing source: ${CROPS_SHEET}`);
  failed = true;
} else {
  const sheet = decodePNG(CROPS_SHEET);
  if (sheet.width !== CROPS_SIZE.width || sheet.height !== CROPS_SIZE.height) {
    console.error(
      `Spring Crops.png is ${sheet.width}x${sheet.height}, expected ` +
        `${CROPS_SIZE.width}x${CROPS_SIZE.height} — the cell table here was measured against the old sheet`,
    );
    failed = true;
  } else {
    for (const crop of CROPS) {
      const icon = cut(sheet, HARVEST_COL, crop.row);
      if (opaqueCount(icon) === 0) {
        console.error(`cell ${HARVEST_COL},${crop.row} is empty — the sheet layout moved`);
        failed = true;
        continue;
      }
      write(join(OUT_DIR, crop.to), icon);
    }
    for (const plant of PLANTS) {
      const sprite = cut(sheet, MATURE_COL, plant.row);
      if (opaqueCount(sprite) === 0) {
        console.error(`cell ${MATURE_COL},${plant.row} is empty — the sheet layout moved`);
        failed = true;
        continue;
      }
      write(join(OUT_DIR, plant.to), sprite);
    }
  }
}

for (const frame of FRAMES) {
  const source = join(PACK, frame.from);
  if (!existsSync(source)) {
    console.error(`missing source: ${source}`);
    failed = true;
    continue;
  }

  const img = decodePNG(source);
  if (img.width !== frame.source.width || img.height !== frame.source.height) {
    console.error(
      `${frame.from} is ${img.width}x${img.height}, expected ` +
        `${frame.source.width}x${frame.source.height} — the frame rect here was measured against the old sprite`,
    );
    failed = true;
    continue;
  }

  const sprite = trim(crop(img, frame.rect));
  if (!sprite) {
    console.error(`${frame.from} frame is fully transparent`);
    failed = true;
    continue;
  }
  if (sprite.width !== frame.expect.width || sprite.height !== frame.expect.height) {
    console.error(
      `${frame.to} came out ${sprite.width}x${sprite.height}, expected ` +
        `${frame.expect.width}x${frame.expect.height}`,
    );
    failed = true;
    continue;
  }
  write(join(OUT_DIR, frame.to), sprite);
}

if (failed) process.exitCode = 1;
