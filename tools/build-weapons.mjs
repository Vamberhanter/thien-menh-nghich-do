// Stages the weapon icons into public/. Licensed, so it stays out of git (see
// .gitignore) and is rebuilt on demand.
//
// The sheet is a 6x5 grid of 32x32 cells, one sword per cell, drawn on the
// diagonal with the grip in the bottom-left corner. Ten of the thirty are taken,
// picked to read apart at a glance and to climb from plain steel to demonic.
//
// Cells are cut at their full 32x32 rather than trimmed: several swords carry a
// spray of elemental particles that reaches the cell edge, and trimming would
// leave those blades smaller than the bare ones beside them in the bag.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { encodePNG } from './png.mjs';

const SHEET = 'File.png';
/** The sheet this cell table was measured against. */
const SHEET_SIZE = { width: 192, height: 160 };
const OUT_DIR = join('public', 'assets', 'weapons');
const TILE = 32;

/** Cell of each kept sword, in the order they are meant to be earned. */
const WEAPONS = [
  { col: 0, row: 3, to: 'iron-sword.png' },
  { col: 5, row: 2, to: 'bronze-sword.png' },
  { col: 4, row: 1, to: 'jade-sword.png' },
  { col: 5, row: 1, to: 'gale-sword.png' },
  { col: 1, row: 0, to: 'frost-sword.png' },
  { col: 0, row: 2, to: 'thunder-sword.png' },
  { col: 3, row: 2, to: 'venom-sword.png' },
  { col: 4, row: 2, to: 'flame-sword.png' },
  { col: 2, row: 4, to: 'blood-sword.png' },
  { col: 5, row: 3, to: 'demon-sword.png' },
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

if (!existsSync(SHEET)) {
  console.error(`missing source: ${SHEET}`);
  process.exit(1);
}

const sheet = decodePNG(SHEET);
if (sheet.width !== SHEET_SIZE.width || sheet.height !== SHEET_SIZE.height) {
  console.error(
    `${SHEET} is ${sheet.width}x${sheet.height}, expected ` +
      `${SHEET_SIZE.width}x${SHEET_SIZE.height} - the cell table here was measured against the old sheet`,
  );
  process.exit(1);
}

let failed = false;
mkdirSync(OUT_DIR, { recursive: true });
for (const weapon of WEAPONS) {
  const icon = cut(sheet, weapon.col, weapon.row);
  if (opaqueCount(icon) === 0) {
    console.error(`cell ${weapon.col},${weapon.row} is empty - the sheet layout moved`);
    failed = true;
    continue;
  }
  const path = join(OUT_DIR, weapon.to);
  writeFileSync(path, encodePNG(icon));
  console.log(`${path}  ${icon.width}x${icon.height}`);
}

if (failed) process.exitCode = 1;
