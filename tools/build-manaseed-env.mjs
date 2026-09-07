// Stages the Mana Seed summer sample into public/ for the environment kit.
//
// The sheet is licensed art, so it stays out of git (see .gitignore) and is
// copied from the pack folder on demand. The slice table in
// src/game/env/manaSeedArt.ts is measured against a 256x256 sheet, so a
// different pack revision has to fail here rather than render garbage.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';

const PACK = 'mana seed seasonal forest sample (summer)';
const OUT_DIR = join('public', 'assets', 'environment', 'manaseed');

const FILES = [
  {
    from: join(PACK, 'seasonal sample (summer).png'),
    to: join(OUT_DIR, 'seasonal-sample-summer.png'),
    expect: { width: 256, height: 256 },
  },
  {
    from: join(PACK, 'seasonal water animations', 'summer waterfall B 16x16.png'),
    to: join(OUT_DIR, 'summer-waterfall.png'),
    expect: { width: 128, height: 160 },
  },
  {
    from: join(PACK, 'seasonal water animations', 'summer water sparkles B 16x16.png'),
    to: join(OUT_DIR, 'summer-water-sparkles.png'),
    expect: { width: 64, height: 48 },
  },
];

let failed = false;

for (const file of FILES) {
  if (!existsSync(file.from)) {
    console.error(`missing source: ${file.from}`);
    failed = true;
    continue;
  }

  const { width, height } = decodePNG(file.from);
  if (width !== file.expect.width || height !== file.expect.height) {
    console.error(
      `${basename(file.from)} is ${width}x${height}, expected ${file.expect.width}x${file.expect.height} — ` +
        'the slice table in src/game/env/manaSeedArt.ts was measured against the old sheet',
    );
    failed = true;
    continue;
  }

  mkdirSync(dirname(file.to), { recursive: true });
  copyFileSync(file.from, file.to);
  console.log(`${file.to}  ${width}x${height}`);
}

if (failed) process.exitCode = 1;
