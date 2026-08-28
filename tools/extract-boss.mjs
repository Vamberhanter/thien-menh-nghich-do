// Boss 1 ("Huyết Ma") — sheet inventory, colour rules and CLI.
//
//   node tools/extract-boss.mjs --report          # frame counts + extents
//   node tools/extract-boss.mjs --measure         # feet-to-shoulder ruler
//   node tools/extract-boss.mjs --dump <dir>      # every frame + row strips
//
// The segmentation engine is shared with Như Yên — see `sheet-frames.mjs`.
// These sheets already carry a real alpha channel (the red haze visible in an
// image viewer sits under alpha 0), so there is no background to model.
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
export const SHEET_DIR = join(ROOT, 'public', 'assets', 'boss', 'boss1');

/**
 * Inventory of the five sheets.
 *
 * `cols`  frame count of each row; the segmentation is told the answer and only
 *         has to find the cut lines. On the attack and skill sheets the effects
 *         close the gaps between rows too, so the row count comes from here as
 *         well (the engine falls back to an emptiest-line search).
 * `scale` downscale onto the shared world size. The boss is drawn far larger
 *         than the players; `--measure` prints feet-to-shoulder per frame.
 */
export const SHEETS = {
  idle: {
    file: 'idle2.png',
    cols: [4, 4],
    scale: 2.0,
    note: 'r0 front idle, sword lowered; r1 front poses — charging an orb, sword planted',
  },
  walk: {
    file: 'walk2.png',
    cols: [8, 8, 8, 8],
    scale: 0.93,
    note: 'r0 walk down, r1 walk side, r2 walk side (looser hair), r3 walk up',
  },
  attack: {
    file: 'attack2.png',
    cols: [6, 6, 6, 6, 6],
    scale: 0.68,
    note: 'r0-r1 side slash into a crescent, r2 lunge/thrust, r3 overhead, r4 effect-only',
  },
  skill: {
    file: 'skill2.png',
    cols: [7, 6, 6, 7, 7],
    scale: 0.66,
    note: 'r0 orb cast + bolt, r1 wide crescent, r2 winged form, r3-r4 effect-only',
  },
  hurt: {
    file: 'hurt & death2.png',
    cols: [5, 5],
    scale: 0.52,
    note: 'r0 hurt, r1 death — kneel, collapse, lying',
  },
};

/**
 * Colour rules for the boss.
 *
 * The armour is near-black with red glow lines, the hair white, the effects
 * saturated red. `isDark` therefore has to reject dark red as well as bright
 * red, or the glow on the blade drags the feet anchor sideways.
 *
 * `isBody` is armour plus the pale face and hair roots — but NOT the red
 * effects, which sweep far outside the pose and would wreck frame alignment.
 * The hair is included: unlike Như Yên's, this boss's silhouette is mostly hair
 * and excluding it leaves too little mass to correlate.
 */
const RULES = {
  isDark: (r, g, b) => (r + g + b) / 3 < 78 && r - g < 55 && r - b < 55,
  isBody: (r, g, b) => {
    const mean = (r + g + b) / 3;
    if (mean < 78 && r - g < 55 && r - b < 55) return true; // armour, boots
    // white hair / pale skin: bright and near-neutral. Red glow fails r - b.
    return mean > 120 && r - b < 60 && r - g < 45;
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
      console.log(
        `  r${info.row} rows=${info.rowMethod} cut=${info.method.padEnd(4)} ${boxes}`,
      );
    }
  }
  console.log('\n(extents are post-scale pixels around the feet anchor: left<>right ^up vdown)');
}

/**
 * Feet-to-shoulder per frame — the ruler behind each sheet's `scale`.
 * Shoulder is the first scanline holding a run of armour-dark pixels below the
 * head, which is stable across poses in a way the hair is not.
 */
function measure() {
  const BOX = { w: 320, h: 320 };
  const AT = { x: 160, y: 300 };
  const isArmour = (p) =>
    p[3] > 140 && (p[0] + p[1] + p[2]) / 3 < 78 && p[0] - p[1] < 55 && p[0] - p[2] < 55;
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const out = [];
    for (const frame of sheet.frames) {
      const cut = cutFrame(sheet, frame, BOX, AT, { scale: sheet.spec.scale });
      let top = -1;
      for (let y = 0; y < cut.height && top < 0; y++) {
        let n = 0;
        for (let x = 0; x < cut.width; x++) if (isArmour(cut.get(x, y))) n++;
        if (n >= 8) top = y;
      }
      out.push(`${frame.id}:${top < 0 ? '--' : AT.y - top}`);
    }
    console.log(`${key.padEnd(7)} shoulder ${out.join(' ')}`);
  }
  console.log('\nupright poses on every sheet should agree; that is what `scale` is for');
}

/** Writes a per-sheet strip, for checking poses by eye. */
async function dump(dir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { encodePNG } = await import('./png.mjs');
  mkdirSync(dir, { recursive: true });

  const BOX = { w: 300, h: 300 };
  const AT = { x: 150, y: 272 };

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
  if (dumpIndex >= 0) await dump(process.argv[dumpIndex + 1] ?? '.tmp/boss-frames');
  if (process.argv.length <= 2) {
    console.log(`sheets in ${SHEET_DIR}:`);
    for (const f of readdirSync(SHEET_DIR)) console.log(`  ${f}`);
    console.log('\nrun with --report, --measure or --dump <dir>');
  }
}
