// Stages the Monster Pack 1 sprites the mob roster uses into public/. The art is
// licensed, so it stays out of git (see .gitignore) and is rebuilt on demand.
//
// Two transforms happen here rather than at runtime:
//
//   - De-magnify by 3. The pack draws every monster with 3x3 pixel blocks, while
//     the character sheets are 1:1. Sampling one pixel per block restores the
//     native grid so a mob does not look three times coarser than the player.
//   - Trim to the opaque bounds. The sources sit on canvases up to 396x348 with
//     the creature floating somewhere inside. WorldScene depth-sorts mobs by
//     sprite centre and hangs the health bar off the frame, so a frame that does
//     not hug the creature puts both in the wrong place.
//
// The expected output size is asserted per file: a pack revision that redraws a
// monster has to fail here rather than quietly shift every collision box.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { encodePNG } from './png.mjs';

const PACK = join('Monster Pack 1', 'Monster Pack 1', 'Monster Pack 1', 'enemies');
const OUT_DIR = join('public', 'assets', 'monsters');
const MAGNIFY = 3;

/** `expect` is the size after de-magnifying and trimming. */
const FILES = [
  { from: join('RUNE FROGS', 'Green_1.png'), to: 'toad.png', expect: { width: 50, height: 45 } },
  { from: join('CRABS', 'Blue.png'), to: 'crab.png', expect: { width: 50, height: 44 } },
  { from: join('SERPENTS', 'Green_2.png'), to: 'serpent.png', expect: { width: 60, height: 61 } },
  { from: join('DRAKES', 'Green.png'), to: 'drake.png', expect: { width: 71, height: 62 } },
  { from: join('GOLEMS', 'Golem_Nature.png'), to: 'golem.png', expect: { width: 64, height: 70 } },
  { from: join('TROLLINGS', 'Trolling_1.png'), to: 'troll.png', expect: { width: 78, height: 74 } },
  { from: join('SERPENTS', 'Red_3.png'), to: 'blood-serpent.png', expect: { width: 71, height: 67 } },
  { from: join('GOLEMS', 'Golem_Molten.png'), to: 'ember-golem.png', expect: { width: 64, height: 71 } },
  { from: join('DRAKES', 'Red.png'), to: 'fire-drake.png', expect: { width: 71, height: 62 } },
];

/** True when the image is built from MAGNIFY-sized blocks aligned to the origin. */
function blockAligned(img) {
  const n = MAGNIFY;
  if (img.width % n || img.height % n) return false;
  for (let by = 0; by < img.height; by += n) {
    for (let bx = 0; bx < img.width; bx += n) {
      const base = (by * img.width + bx) * 4;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = ((by + y) * img.width + bx + x) * 4;
          for (let c = 0; c < 4; c++) if (img.data[i + c] !== img.data[base + c]) return false;
        }
      }
    }
  }
  return true;
}

/** One pixel per MAGNIFY-sized block — lossless for block-aligned art. */
function demagnify(img) {
  const width = img.width / MAGNIFY;
  const height = img.height / MAGNIFY;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * MAGNIFY * img.width + x * MAGNIFY) * 4;
      data.set(img.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
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

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((minY + y) * img.width + minX) * 4;
    data.set(img.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

let failed = false;

for (const file of FILES) {
  const source = join(PACK, file.from);
  if (!existsSync(source)) {
    console.error(`missing source: ${source}`);
    failed = true;
    continue;
  }

  const raw = decodePNG(source);
  if (!blockAligned(raw)) {
    console.error(`${file.from} is not drawn in ${MAGNIFY}x${MAGNIFY} blocks — de-magnifying would lose pixels`);
    failed = true;
    continue;
  }

  const sprite = trim(demagnify(raw));
  if (!sprite) {
    console.error(`${file.from} is fully transparent`);
    failed = true;
    continue;
  }
  if (sprite.width !== file.expect.width || sprite.height !== file.expect.height) {
    console.error(
      `${file.to} came out ${sprite.width}x${sprite.height}, expected ` +
        `${file.expect.width}x${file.expect.height} — the bodies in src/game/entities/Mob.ts ` +
        'were measured against the old sprite',
    );
    failed = true;
    continue;
  }

  const out = join(OUT_DIR, file.to);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePNG(sprite));
  console.log(`${out}  ${raw.width}x${raw.height} -> ${sprite.width}x${sprite.height}`);
}

if (failed) process.exitCode = 1;
