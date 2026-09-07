// Stages Cute Fantasy Free farm props into public/assets/environment/farm/.
// Free version is non-commercial — keep out of git with other licensed sheets.
//
// Run: npm run env:farm
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { encodePNG } from './png.mjs';

const PACK = join('source-art', 'Cute_Fantasy_Free');
const OUT_DIR = join('public', 'assets', 'environment', 'farm');
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
  return crop(img, {
    x: col * TILE,
    y: row * TILE,
    width: cols * TILE,
    height: rows * TILE,
  });
}

function write(name, img) {
  const path = join(OUT_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(img));
  console.log(`${path}  ${img.width}x${img.height}`);
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
    console.error(
      `${rel} is ${img.width}x${img.height}, expected ${expectW}x${expectH}`,
    );
    failed = true;
    return null;
  }
  return img;
}

mkdirSync(OUT_DIR, { recursive: true });

// FarmLand is a 3×3 of 16px dirt variants — centre tile is the plot pad.
const farmLand = need(join('Tiles', 'FarmLand_Tile.png'), 48, 48);
if (farmLand) {
  write('soil.png', cutTile(farmLand, 1, 1));
  write('soil-corner.png', cutTile(farmLand, 0, 0));
  // Darker / edge tile reads as damp soil after watering.
  write('soil-wet.png', cutTile(farmLand, 2, 1));
}

// Path middle strip (top row of Path_Tile).
const path = need(join('Tiles', 'Path_Tile.png'), 48, 96);
if (path) {
  write('path.png', cutTile(path, 1, 0));
}

// Fence sheet is 4×4; take a horizontal rail and a post/vertical.
const fences = need(join('Outdoor decoration', 'Fences.png'), 64, 64);
if (fences) {
  write('fence-h.png', cutTile(fences, 1, 0));
  write('fence-v.png', cutTile(fences, 0, 1));
  write('fence-post.png', cutTile(fences, 0, 0));
}

const house = need(join('Outdoor decoration', 'House_1_Wood_Base_Blue.png'), 96, 128);
if (house) {
  write('house.png', house);
}

const chicken = need(join('Animals', 'Chicken', 'Chicken.png'), 64, 64);
if (chicken) {
  // Row 0 idle frames are sparse; row 1 reads clearly at world scale.
  write('chicken.png', cutTile(chicken, 0, 1));
}

if (failed) process.exitCode = 1;
