// Cuts the Ngũ Hành Sơn sheets into a seamless ground tileset and a prop atlas.
//
//   node tools/build-nguhanhson.mjs [--preview]
//
// Eight sheets arrived at 1536x1024. What they are is not what a first look
// suggests, and the numbers below are all measured rather than assumed:
//
//   * Four have a real alpha channel; four have a *painted* checkerboard
//     instead, in two near-white tones. `key-background.mjs` deals with that
//     and runs first — this tool reads its output.
//
//   * `terrain.png`'s top four rows are ground tiles on a 96px pitch, but the
//     drawn art in each cell is only 81-87px and every cell carries a lit
//     border. Butted edge to edge at 96 they show a bright grid across the
//     whole map; a 12px overlap does not hide it either. Cropping *into* the
//     art does: at 64px the field reads as continuous grass, at 72px the lines
//     come back. So the ground tile is 64px of original pixels with the
//     unusable border discarded — no resampling anywhere.
//
//   * The other sheets are not on a grid at all. Row heights differ (tree.png
//     measures 283/335/110/132/99) and column widths differ within a row, so
//     they are segmented by transparency the way the character sheets are.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = join('.tmp', 'keyed-nguhanhson');
const RAW = join('source-art', 'nguhanhson');
const OUT = join('public', 'assets', 'environment', 'nguhanhson', 'atlas');

/* ------------------------------------------------------------------ ground */

/**
 * The ground tileset's geometry, all measured off `terrain.png`.
 *
 * `PITCH` is the cell-to-cell step (94-98 across the sheet, so 96 nominal).
 * `ORIGIN` is where the first cell's art begins. `TILE` is how much of each
 * cell survives; the rest is the lit border that makes a grid appear.
 */
const PITCH = 96;
const ORIGIN = { x: 12, y: 12 };
const ART = 84;
export const GROUND_TILE = 64;
const INSET = Math.round((ART - GROUND_TILE) / 2);

/** Rows of ground tiles, before the sheet turns into cliff props. */
const GROUND_ROWS = 4;
const GROUND_COLS = 16;

async function buildGround() {
  const src = join(SRC, 'terrain.png');

  /*
   * Every block found rather than stepped to.
   *
   * The horizontal pitch measures 94-98 and the *vertical* one is worse: the
   * four ground bands begin at y = 12, 118, 219, 324, which is a step of 106,
   * 101, 105. Stepping by a nominal 96 put row three 24px above where its art
   * actually is, and the crop came back part empty — visible as transparent
   * bands straight across the packed tileset. Segmenting the sheet costs one
   * pass and cannot drift.
   */
  const { frames } = await segment('terrain.png', { minBand: 40, minCol: 40 });
  const bandTops = [...new Set(frames.map((f) => f.y))].sort((a, b) => a - b);
  const rows = [];
  for (const frame of frames) {
    let row = rows.find((r) => Math.abs(r.y - frame.y) < 40);
    if (!row) {
      row = { y: frame.y, cells: [] };
      rows.push(row);
    }
    row.cells.push(frame);
  }
  rows.sort((a, b) => a.y - b.y);
  const ground = rows.slice(0, GROUND_ROWS);
  for (const row of ground) row.cells.sort((a, b) => a.x - b.x);

  const shapes = ground.map((r) => `${r.cells.length}@y${r.y}`).join(' ');
  if (ground.some((r) => r.cells.length !== GROUND_COLS)) {
    console.warn(`ground: mong doi ${GROUND_COLS} o moi hang, do duoc ${shapes}`);
  }

  const tiles = [];
  for (const row of ground) {
    for (const cell of row.cells.slice(0, GROUND_COLS)) {
      // Centred in the block that was found, so the lit border falls away on
      // every side however wide the block happens to be.
      tiles.push(
        await sharp(src)
          .extract({
            left: cell.x + Math.max(0, Math.round((cell.w - GROUND_TILE) / 2)),
            top: cell.y + Math.max(0, Math.round((cell.h - GROUND_TILE) / 2)),
            width: GROUND_TILE,
            height: GROUND_TILE,
          })
          .png()
          .toBuffer(),
      );
    }
  }
  void bandTops;

  // Packed edge to edge with no margin or spacing, which is what a Phaser
  // tilemap wants: `tileWidth`/`tileHeight` and nothing else to configure.
  const width = GROUND_COLS * GROUND_TILE;
  const height = GROUND_ROWS * GROUND_TILE;
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(
      tiles.map((input, i) => ({
        input,
        left: (i % GROUND_COLS) * GROUND_TILE,
        top: Math.floor(i / GROUND_COLS) * GROUND_TILE,
      })),
    )
    .png()
    .toFile(join(OUT, 'ground.png'));

  console.log(
    `ground.png            ${width}x${height}  ${tiles.length} tile ${GROUND_TILE}px` +
      `  (cat tu o ${PITCH}px, art ${ART}px, bo vien ${INSET}px moi phia)`,
  );
  return { count: tiles.length, width, height };
}

/* ------------------------------------------------------------------- props */

/**
 * Segments a sheet into its drawn shapes.
 *
 * Bands first, then columns inside each band — the same two-pass shape the
 * character pipeline uses, and for the same reason: these sheets are laid out
 * by a person in rows of whatever size the subject wanted, so nothing about a
 * uniform grid holds. A row of six great trees and a row of nine bushes are
 * both just "a band with gaps in it".
 */
async function segment(file, { minBand = 24, minCol = 12, alphaFloor = 16 } = {}) {
  const { data, info } = await sharp(join(SRC, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];

  const runs = (length, has) => {
    const out = [];
    let start = -1;
    for (let i = 0; i < length; i++) {
      if (has(i) && start < 0) start = i;
      else if (!has(i) && start >= 0) {
        out.push([start, i - 1]);
        start = -1;
      }
    }
    if (start >= 0) out.push([start, length - 1]);
    return out;
  };

  const bands = runs(info.height, (y) => {
    for (let x = 0; x < info.width; x++) if (alpha(x, y) > alphaFloor) return true;
    return false;
  }).filter(([a, b]) => b - a + 1 >= minBand);

  const frames = [];
  for (const [y0, y1] of bands) {
    const cols = runs(info.width, (x) => {
      for (let y = y0; y <= y1; y++) if (alpha(x, y) > alphaFloor) return true;
      return false;
    }).filter(([a, b]) => b - a + 1 >= minCol);

    /*
     * Not split further, and that is a decision rather than an omission.
     *
     * Connectivity merges neighbours that touch, and on these sheets a few do:
     * six of `kientruc.png`'s fourteen frames are two or three buildings in a
     * row. An internal-minimum split was tried and did not fire — measured,
     * the columns between two gateway arches still carry a quarter of the
     * band's paint in shadow and plinth, so there is no thin line to cut on.
     *
     * Rather than tune a heuristic against eight sheets for frames this map
     * does not need, the map curates: `nguHanhSon.ts` names the frames that
     * came out clean and leaves the merged ones unused. A contact sheet of
     * every frame is how one tells which is which.
     */
    for (const [x0, x1] of cols) {
      // Tighten vertically inside the column: a band's height is the tallest
      // thing in it, and a short bush in a row of trees should not carry the
      // trees' empty space around with it.
      let top = y1;
      let bottom = y0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (alpha(x, y) > alphaFloor) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            break;
          }
        }
      }
      frames.push({ x: x0, y: top, w: x1 - x0 + 1, h: bottom - top + 1 });
    }
  }
  return { frames, width: info.width, height: info.height };
}

/**
 * Sheets to segment, and what each holds.
 *
 * `minCol` is per sheet because the subjects are different sizes: a 12px gap
 * splits two bushes correctly and splits one waterfall into three pieces.
 */
const PROP_SHEETS = [
  { file: 'terrain.png', prefix: 'cliff', skipBands: GROUND_ROWS, note: 'vach & dai da' },
  { file: 'tree.png', prefix: 'tree', note: 'cay, bui, hoa, cau, cong, dinh' },
  { file: 'nui.png', prefix: 'mountain', note: 'nui xa & khoi nui' },
  { file: 'cliff.png', prefix: 'rockface', note: 'vach da, bac thang, khe' },
  { file: 'kientruc.png', prefix: 'build', note: 'kien truc: cong, den, nha' },
  { file: 'water.png', prefix: 'water', note: 'nuoc, bo, thac' },
  { file: 'dao.png', prefix: 'isle', note: 'dao & nen da' },
  { file: 'chest_phaptran_bia.png', prefix: 'relic', note: 'ruong, bia, phap tran' },
];

/* ------------------------------------------------------------------- build */

mkdirSync(OUT, { recursive: true });
mkdirSync(SRC, { recursive: true });

// Key the four painted-checkerboard sheets, and copy the four that already
// have alpha, so the segmenter reads one folder.
const { execFileSync } = await import('node:child_process');
const NEEDS_KEYING = ['terrain.png', 'water.png', 'dao.png', 'chest_phaptran_bia.png'];
execFileSync(
  process.execPath,
  ['tools/key-background.mjs', ...NEEDS_KEYING.map((f) => join(RAW, f)), '--out', SRC],
  { stdio: 'inherit' },
);
for (const file of PROP_SHEETS.map((s) => s.file)) {
  if (NEEDS_KEYING.includes(file)) continue;
  await sharp(join(RAW, file)).png().toFile(join(SRC, file));
}
console.log('');

const ground = await buildGround();

/** Shelf-packs the frames into one atlas per sheet, biggest first. */
async function packSheet(sheet) {
  const { frames } = await segment(sheet.file, { minCol: sheet.minCol });
  const kept = sheet.skipBands ? frames.filter((f) => f.y >= ORIGIN.y + sheet.skipBands * PITCH - 4) : frames;
  if (kept.length === 0) return null;

  const PAD = 2;
  const order = [...kept].sort((a, b) => b.h - a.h || b.w - a.w);
  // Width chosen from the total area so the sheet comes out roughly square,
  // rounded up to a multiple of 4 — a long thin atlas wastes more than it saves.
  const area = order.reduce((sum, f) => sum + (f.w + PAD) * (f.h + PAD), 0);
  const limit = Math.max(...order.map((f) => f.w + PAD), Math.ceil(Math.sqrt(area) / 4) * 4);

  let x = 0;
  let y = 0;
  let shelf = 0;
  const placed = [];
  for (const frame of order) {
    if (x + frame.w + PAD > limit) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    placed.push({ ...frame, dx: x, dy: y });
    x += frame.w + PAD;
    shelf = Math.max(shelf, frame.h + PAD);
  }
  const width = limit;
  const height = y + shelf;

  const src = join(SRC, sheet.file);
  const parts = await Promise.all(
    placed.map(async (f) => ({
      input: await sharp(src).extract({ left: f.x, top: f.y, width: f.w, height: f.h }).png().toBuffer(),
      left: f.dx,
      top: f.dy,
    })),
  );
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts)
    .png()
    .toFile(join(OUT, `${sheet.prefix}.png`));

  const table = placed.map((f, i) => ({
    name: `${sheet.prefix}_${i}`,
    frame: { x: f.dx, y: f.dy, w: f.w, h: f.h },
    /**
     * Where the thing stands, as a fraction of its own box.
     *
     * Bottom-centre for everything: the whole map sorts by foot Y, so a prop's
     * anchor has to be the point it touches the ground. A tree anchored at its
     * centre would sort as though it stood halfway up its own trunk.
     */
    anchor: { x: 0.5, y: 1 },
  }));

  const sizes = placed.map((f) => `${f.w}x${f.h}`);
  console.log(
    `${(sheet.prefix + '.png').padEnd(22)}${width}x${height}` +
      `  ${placed.length} vat  (${sheet.note})`,
  );
  console.log(`${''.padEnd(22)}kich thuoc: ${[...new Set(sizes)].slice(0, 6).join(' ')}${sizes.length > 6 ? ' …' : ''}`);
  return { image: `${sheet.prefix}.png`, size: { w: width, h: height }, frames: table };
}

const textures = [];
for (const sheet of PROP_SHEETS) {
  const packed = await packSheet(sheet);
  if (packed) textures.push(packed);
}

writeFileSync(
  join(OUT, 'nguhanhson.json'),
  `${JSON.stringify(
    {
      tileset: {
        image: 'ground.png',
        tile: GROUND_TILE,
        columns: GROUND_COLS,
        count: ground.count,
      },
      textures,
      meta: {
        app: 'thien-menh-nghich-do/tools/build-nguhanhson.mjs',
        source: 'source-art/nguhanhson',
        note:
          `ground: ${GROUND_TILE}px cat tu o ${PITCH}px (bo vien ${INSET}px); ` +
          'props: phan doan theo alpha, anchor day-giua',
      },
    },
    null,
    2,
  )}\n`,
);

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0) + ground.width * ground.height;
console.log(
  `\nnguhanhson.json       ${textures.length} atlas, ` +
    `${textures.reduce((n, t) => n + t.frames.length, 0)} vat + ${ground.count} tile`,
);
console.log(`texture budget        ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`);
