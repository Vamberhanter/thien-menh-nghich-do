// Cuts the second Ngũ Hành Sơn drop — 8 sheets in dist/assets/environment/nguhanh_son
// — into a prop atlas, by real 2D connected-component segmentation.
//
//   node tools/build-nguhanhson2.mjs
//
// Why a new segmenter rather than the row/column one `build-nguhanhson.mjs`
// already has: that one assumes every sprite can be found by first slicing
// full-width horizontal bands and then full-height columns inside each band,
// which only holds when nothing overlaps in both axes at once. These sheets
// scatter floating islands and cliff blocks across the whole canvas, so a
// bandful of one row's content shares Y-range with the next row's — measured,
// not guessed: the row/column pass returned two 900px "frames" for the cliff
// sheet and one single 1500px blob for the waterfall-island sheet. A real
// flood fill, 4-connected, correctly finds 88 and 29 objects on those same two
// sheets because it doesn't care what the bounding boxes overlap.
//
// This drop is also real alpha on three sheets and a painted checkerboard on
// the other five (same two near-white tones as the first drop) — the same
// `key-background.mjs` keys them, unchanged.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const RAW = join('dist', 'assets', 'environment', 'nguhanh_son');
const KEYED = join('.tmp', 'keyed-nguhanhson2');
const OUT = join('public', 'assets', 'environment', 'nguhanhson2', 'atlas');

const NEEDS_KEYING = ['cliff.png', 'dao.png', 'mountain.png', 'thac.png', 'water and street.png'];
const HAS_ALPHA = ['honuoc.png', 'tree.png', 'isle.png'];

/**
 * Sheets to segment, what they hold, and the one masked region.
 *
 * `mountain.png` is the single sheet in this drop that carries its own
 * printed label column ("MOUNTAIN TILESET", "PEAKS (128x128)", …) baked into
 * the pixels at the left edge. Segmented as-is, every word becomes a handful
 * of sub-40px components — measured: 9x10 up to 20x10, far smaller than any
 * real prop on any of the eight sheets. `mask` blanks that column before the
 * flood fill runs rather than filtering by size afterwards, because filtering
 * by size would also throw out the sheet's genuinely small props (the Misc
 * row's little trees and rocks measure in the same range).
 */
const SHEETS = [
  { file: 'cliff.png', prefix: 'cliff2', note: 'dai da, thac, hang, cau, cong, bia' },
  { file: 'dao.png', prefix: 'isleA', note: '12 dao troi (bo cuc khac isleB)' },
  { file: 'honuoc.png', prefix: 'lake', note: 'thac vao ho, ao, cau, coi xay, gieng' },
  {
    file: 'mountain.png',
    prefix: 'peak',
    note: 'nui xa co nhan: dinh, vach, hang, thac',
    // Two passes were needed here, not one. The left-column mask alone still
    // left the "MOUNTAIN TILESET" / "PIXEL ART RPG" title — which runs past
    // x=186, above where the row labels start — to break into a dozen sub-20px
    // glyph components; measured by re-running with only the column mask and
    // finding those glyphs sitting at y=14-29, x up to 350.
    mask: [
      { x: 0, y: 0, w: 186, h: 1024 },
      { x: 186, y: 0, w: 1536 - 186, h: 48 },
    ],
  },
  { file: 'thac.png', prefix: 'floater', note: 'manh da troi + thac, nho hon dao' },
  { file: 'tree.png', prefix: 'flora', note: 'cay, bui, hoa, da, cau, dinh, cong' },
  { file: 'water and street.png', prefix: 'ground', note: 'nuoc, duong dat/da (blob), cau, hang rao' },
  { file: 'isle.png', prefix: 'isleB', note: '12 dao troi (bo cuc khac isleA)' },
];

/* --------------------------------------------------------------- keying */

mkdirSync(KEYED, { recursive: true });
mkdirSync(OUT, { recursive: true });

const { execFileSync } = await import('node:child_process');
execFileSync(
  process.execPath,
  ['tools/key-background.mjs', ...NEEDS_KEYING.map((f) => join(RAW, f)), '--out', KEYED],
  { stdio: 'inherit' },
);
for (const file of HAS_ALPHA) {
  await sharp(join(RAW, file)).png().toFile(join(KEYED, file));
}
console.log('');

/* ---------------------------------------------------------- segmentation */

/**
 * Real flood fill, 4-connected, over the alpha channel.
 *
 * An explicit stack of packed indices rather than recursion or two typed
 * arrays of coordinates: a 1536x1024 sheet is 1.5M pixels and the largest
 * component here (a cliff sheet's grass field) alone fills tens of thousands
 * of them.
 */
function segmentCC(data, width, height, { alphaFloor = 16, minArea = 60, mask = [] } = {}) {
  const blocked = new Uint8Array(width * height);
  for (const m of mask) {
    for (let y = m.y; y < Math.min(height, m.y + m.h); y++) {
      for (let x = m.x; x < Math.min(width, m.x + m.w); x++) blocked[y * width + x] = 1;
    }
  }
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const boxes = [];

  for (let y0 = 0; y0 < height; y0++) {
    for (let x0 = 0; x0 < width; x0++) {
      const at0 = y0 * width + x0;
      if (seen[at0] || blocked[at0] || alphaAt(x0, y0) <= alphaFloor) continue;
      let sp = 0;
      stack[sp++] = at0;
      seen[at0] = 1;
      let minX = x0, maxX = x0, minY = y0, maxY = y0, area = 0;
      while (sp > 0) {
        const at = stack[--sp];
        const x = at % width;
        const y = (at - x) / width;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const neighbours = [at - 1, at + 1, at - width, at + width];
        const coords = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (let i = 0; i < 4; i++) {
          const [nx, ny] = coords[i];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nat = neighbours[i];
          if (seen[nat] || blocked[nat] || alphaAt(nx, ny) <= alphaFloor) continue;
          seen[nat] = 1;
          stack[sp++] = nat;
        }
      }
      if (area >= minArea) boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }
  return boxes;
}

/** Shelf-packs the frames into one atlas per sheet, biggest first. */
async function packSheet(sheet) {
  const src = join(KEYED, sheet.file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const boxes = segmentCC(data, info.width, info.height, { mask: sheet.mask });
  if (boxes.length === 0) return null;

  const PAD = 3;
  const order = [...boxes].sort((a, b) => b.h - a.h || b.w - a.w);
  const area = order.reduce((sum, f) => sum + (f.w + PAD) * (f.h + PAD), 0);
  const limit = Math.max(...order.map((f) => f.w + PAD), Math.ceil(Math.sqrt(area) / 4) * 4);

  let x = 0, y = 0, shelf = 0;
  const placed = [];
  for (const frame of order) {
    if (x + frame.w + PAD > limit) { x = 0; y += shelf; shelf = 0; }
    placed.push({ ...frame, dx: x, dy: y });
    x += frame.w + PAD;
    shelf = Math.max(shelf, frame.h + PAD);
  }
  const width = limit;
  const height = y + shelf;

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
    // Bottom-centre: the whole map sorts standing things by foot Y.
    anchor: { x: 0.5, y: 1 },
  }));

  console.log(`${(sheet.prefix + '.png').padEnd(14)}${width}x${height}  ${placed.length} vat  (${sheet.note})`);
  return { image: `${sheet.prefix}.png`, size: { w: width, h: height }, frames: table };
}

const textures = [];
for (const sheet of SHEETS) {
  const packed = await packSheet(sheet);
  if (packed) textures.push(packed);
}

writeFileSync(
  join(OUT, 'nguhanhson2.json'),
  `${JSON.stringify(
    {
      textures,
      meta: {
        app: 'thien-menh-nghich-do/tools/build-nguhanhson2.mjs',
        source: 'dist/assets/environment/nguhanh_son',
        note: 'props: phan doan theo flood-fill 4-connected tren kenh alpha, anchor day-giua',
      },
    },
    null,
    2,
  )}\n`,
);

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0);
console.log(
  `\nnguhanhson2.json  ${textures.length} atlas, ${textures.reduce((n, t) => n + t.frames.length, 0)} vat`,
);
console.log(`texture budget    ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`);
