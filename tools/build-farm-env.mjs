// Stages farm props into public/assets/environment/farm/ and the crop growth
// stages into public/assets/items/farm/.
//
// Run: npm run env:farm
//
// This was written against Cute Fantasy Free, which is not in the repo and by
// the look of the cell tables never was — every one of its outputs 404'd. It
// now cuts Farm RPG FREE 16x16 by Kronovi, the pack that *is* staged here and
// the one `farmArt.ts` already names for the growth stages.
//
// Licensed art either way: the cuts stay out of git with the rest.
//
// Two props are deliberately not cut. Farm RPG's dirt measures 238,157,81 and
// its grass 121,191,86, against this map's `#243c2c` grass and `#3e3424` soil —
// a different palette, not a darker one. `farmArt.ts` bakes soil, wet soil and
// the path lane in code for exactly that reason (its own note says the staged
// path "reads as a pasted strip"), and staged art overrides the baked kind, so
// cutting them here would replace tuned tiles with clashing ones. Wood, house
// and chicken are close enough in family to be worth staging.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { encodePNG } from './png.mjs';

const PACK = join(
  'Farm RPG FREE 16x16 - Tiny Asset Pack',
  'Farm RPG FREE 16x16 - Tiny Asset Pack',
  'Farm RPG FREE 16x16 - Tiny Asset Pack',
);
const OUT_DIR = join('public', 'assets', 'environment', 'farm');
const CROP_DIR = join('public', 'assets', 'items', 'farm');
const TILE = 16;

function crop(img, rect) {
  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * img.width + rect.x) * 4;
    data.set(img.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}

function cutTile(img, col, row, cols = 1, rows = 1) {
  return crop(img, { x: col * TILE, y: row * TILE, width: cols * TILE, height: rows * TILE });
}

function opaqueCount(img) {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 16) n++;
  return n;
}

function write(dir, name, img) {
  const path = join(dir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(img));
  console.log(`${path}  ${img.width}x${img.height}  ${opaqueCount(img)} px`);
}

let failed = false;

function need(rel, expectW, expectH) {
  const path = join(PACK, rel);
  if (!existsSync(path)) {
    console.error(`missing source: ${path}`);
    failed = true;
    return null;
  }
  const img = decodePNG(path);
  if (img.width !== expectW || img.height !== expectH) {
    // The cell tables below are measured against these exact sheets, so a
    // different size means the numbers are wrong rather than the art missing.
    console.error(`${rel} is ${img.width}x${img.height}, expected ${expectW}x${expectH}`);
    failed = true;
    return null;
  }
  return img;
}

/**
 * Cells picked by which edges carry paint, not by eye: a horizontal rail has to
 * be opaque on both side edges to tile along a run, a vertical one on the top
 * and bottom, and a standalone post on neither.
 */
const fence = need(join('Objects', "Fence's copiar.png"), 48, 80);
if (fence) {
  write(OUT_DIR, 'fence-h.png', cutTile(fence, 1, 2)); // rails through, both sides
  write(OUT_DIR, 'fence-v.png', cutTile(fence, 0, 1)); // post through, top+bottom
  write(OUT_DIR, 'fence-post.png', cutTile(fence, 1, 4)); // cap, joins nothing
}

// The complete house is the right-hand one: chimney, two windows and a door
// against a bare left-hand shell that has none of them.
const house = need(join('Objects', 'House.png'), 224, 112);
if (house) {
  write(OUT_DIR, 'house.png', crop(house, { x: 140, y: 3, width: 80, height: 95 }));
}

// Four walk frames on two rows; the first is the one standing still enough to
// read as an idle bird at world scale.
const chicken = need(join('Farm Animals', 'Chicken Red.png'), 64, 32);
if (chicken) {
  write(OUT_DIR, 'chicken.png', cutTile(chicken, 0, 0));
}

/**
 * Growth stages, which `farmArt.ts` has always credited to this pack.
 *
 * Columns 1–5 of each crop row are the five stages the game asks for, 0 being
 * a sprout and 4 the ready plant — column 0 is loose seed and 6+ are the seed
 * packet and the graded harvest, which `build-farm-items.mjs` owns.
 */
const CROP_ROWS = [
  { row: 1, kind: 'blood-berry' },
  { row: 3, kind: 'spirit-herb' },
  { row: 5, kind: 'essence-root' },
  { row: 7, kind: 'earth-fruit' },
];
const STAGE_COLS = [1, 2, 3, 4, 5];

const crops = need(join('Objects', 'Spring Crops.png'), 224, 128);
if (crops) {
  for (const { row, kind } of CROP_ROWS) {
    STAGE_COLS.forEach((col, stage) => {
      const sprite = cutTile(crops, col, row);
      if (opaqueCount(sprite) === 0) {
        console.error(`cell ${col},${row} is empty — the sheet layout moved`);
        failed = true;
        return;
      }
      write(CROP_DIR, `grow-${kind}-${stage}.png`, sprite);
    });
  }
}

if (failed) process.exitCode = 1;
