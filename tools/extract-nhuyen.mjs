// Như Yên's five hand-made sheets: inventory, colour rules and CLI.
//
//   node tools/extract-nhuyen.mjs --report            # frame counts per row
//   node tools/extract-nhuyen.mjs --measure           # feet-to-collar ruler
//   node tools/extract-nhuyen.mjs --dump <dir>        # every frame + row strips
//
// The segmentation itself lives in `sheet-frames.mjs` and is shared with the
// boss — see that file for how the cutting works. What is character-specific is
// this inventory and the two colour predicates below.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Surface } from './pixel.mjs';
import {
  analyseSheet as analyseSheetFrames,
  checker,
  cutFrame,
  frameExtent,
} from './sheet-frames.mjs';

export { cutFrame, frameExtent };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SHEET_DIR = join(ROOT, 'public', 'assets', 'characters', 'nhuyen');

/**
 * Inventory of the five sheets, checked by eye against a zoomed dump.
 *
 * `cols`  frame count of each row — the segmentation is told the answer and
 *         only has to find the cut lines.
 * `scale` downscale that lands this sheet's art on the shared body height.
 *         Every sheet drew Như Yên at its own size; measuring feet-to-collar on
 *         the upright poses (see `--measure`) puts them all at 112px, which is
 *         also roughly Lâm Uyên's height, so the two characters can share a
 *         world. The idle sheet at 2.0 is the reference; the hurt sheet was
 *         drawn 37% larger, the attack sheet 18% smaller.
 */
export const SHEETS = {
  idle: {
    file: 'nhuyen-idle.png',
    cols: [4, 4, 4, 4],
    scale: 2.0,
    note: 'r0 down, r1 up, r2 right, r3 left — 4 breathing frames each',
  },
  walk: {
    file: 'nhuyen-walk&run.png',
    cols: [7, 7, 7, 7],
    scale: 1.93,
    note: 'r0 walk down, r1 walk up, r2 walk right, r3 RUN right',
  },
  attack: {
    file: 'nhuyen_attack.png',
    cols: [6, 6, 6],
    scale: 1.65,
    note: 'r0 side slash c0-c5, r1 c0-c1 follow-through / c2-c4 overhead chop / c5 FX, r2 front poses + c5 FX shards',
  },
  skill: {
    file: 'nhuyen-skill.png',
    cols: [4, 4],
    scale: 1.59,
    note: 'r0 c0-c3 channel, r1 c0-c1 vortex peak, r1 c2-c3 ice eruption FX',
  },
  hurt: {
    file: 'nhuyen-hurt&death.png',
    cols: [3, 5, 6],
    scale: 2.74,
    note: 'r0 hurt, r1 knocked down, r2 lying + dissolve',
  },
};

/**
 * Colour rules for this character.
 *
 * `isBody` is the solid body: blue robe, skin, or near-black (boots, headband,
 * sword grip). It deliberately matches neither the hair nor the qi effects —
 * the pale lavender hair is too bright and too grey for the robe test, too blue
 * for the skin test and too light for the dark test, and the crescents are
 * brighter still. Both of those flutter freely, so including them would drag
 * the frame alignment around exactly as much as the foot-snapping it fixes.
 */
const RULES = {
  isDark: (r, g, b) => (r + g + b) / 3 < 85 && b - r < 70,
  isBody: (r, g, b) => {
    if ((r + g + b) / 3 < 85 && b - r < 70) return true;
    if (b > 100 && b < 235 && b - r > 60 && b - g > 40 && r < 130) return true; // robe
    return r > 190 && r - b > 40 && g > 145 && g < r; // skin
  },
};

export function analyseSheet(key) {
  return analyseSheetFrames({ dir: SHEET_DIR, key, spec: SHEETS[key], rules: RULES });
}

/* ------------------------------------------------------------------ report */

function report() {
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    console.log(`\n=== ${key}  ${SHEETS[key].file}  scale ${sheet.spec.scale}`);
    console.log(`    ${SHEETS[key].note}`);
    for (const info of sheet.rows) {
      const boxes = sheet.frames
        .filter((f) => f.row === info.row)
        .map((f) => {
          const e = frameExtent(sheet, f);
          return `c${f.col} ${e.left}<>${e.right} ^${e.up}v${e.down}`;
        })
        .join('  ');
      console.log(`  r${info.row} cut=${info.method.padEnd(4)} ${boxes}`);
    }
  }
  console.log('\n(extents are post-scale pixels around the feet anchor: left<>right ^up vdown)');
}

/** Prints feet-to-collar per frame — the ruler behind each sheet's `scale`. */
function measure() {
  const isRobe = (p) =>
    p[3] > 140 && p[2] > 100 && p[2] < 235 && p[2] - p[0] > 60 && p[2] - p[1] > 40 && p[0] < 130;
  const BOX = { w: 220, h: 240 };
  const AT = { x: 110, y: 230 };
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const out = [];
    for (const frame of sheet.frames) {
      const cut = cutFrame(sheet, frame, BOX, AT, { scale: sheet.spec.scale });
      let top = -1;
      for (let y = 0; y < cut.height && top < 0; y++) {
        let n = 0;
        for (let x = 0; x < cut.width; x++) if (isRobe(cut.get(x, y))) n++;
        if (n >= 5) top = y;
      }
      out.push(`${frame.id}:${top < 0 ? '--' : AT.y - top}`);
    }
    console.log(`${key.padEnd(7)} collar ${out.join(' ')}`);
  }
  console.log('\nupright poses should all read ~112; lower values are genuine crouches');
}

/** Writes every frame and a per-row strip, for checking poses by eye. */
async function dump(dir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { encodePNG } = await import('./png.mjs');
  mkdirSync(dir, { recursive: true });

  const BOX = { w: 260, h: 260 };
  const AT = { x: 130, y: 236 };

  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const rows = sheet.spec.cols.length;
    const cols = Math.max(...sheet.spec.cols);
    const strip = new Surface(cols * BOX.w, rows * BOX.h);
    for (const frame of sheet.frames) {
      const cut = cutFrame(sheet, frame, BOX, AT, { scale: sheet.spec.scale });
      strip.blit(cut, frame.col * BOX.w, frame.row * BOX.h);
    }
    writeFileSync(join(dir, `${key}.png`), encodePNG(checker(strip, BOX)));
    console.log(`${key}.png  ${strip.width}x${strip.height}`);
  }
}

// CLI only — the atlas builder imports this module and must stay quiet.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--report')) report();
  if (process.argv.includes('--measure')) measure();
  const dumpIndex = process.argv.indexOf('--dump');
  if (dumpIndex >= 0) await dump(process.argv[dumpIndex + 1] ?? '.tmp/nhuyen-frames');
  if (process.argv.length <= 2) {
    console.log(`sheets in ${SHEET_DIR}:`);
    for (const f of readdirSync(SHEET_DIR)) console.log(`  ${f}`);
    console.log('\nrun with --report, --measure or --dump <dir>');
  }
}
