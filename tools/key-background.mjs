// Removes a drawn "transparency checkerboard" from a sheet, in place-safe copies.
//
//   node tools/key-background.mjs <in.png> [more.png ...] --out <dir>
//
// Four of the Ngũ Hành Sơn sheets arrived with no alpha channel at all and a
// checkerboard *painted into the image* instead — two near-white tones, ~254
// and ~235, alternating. Measured, not guessed: a horizontal line through the
// background of `terrain.png` reads
//
//   254 254 233 254 235 236 254 234 233 254
//
// A plain "delete white" pass is the obvious move and the wrong one: this art
// has white blossom, pale stone, snow and cloud in it, and keying by colour
// alone eats all of them. So the background is found by *connectivity* rather
// than by colour — it is the region that touches the border, and a white
// petal in the middle of a tree is not.
//
// Everything else is left exactly as it is: no crop, no resize, no filtering.
// The art is 96px-grid tiles and stays that way (see §27 of the brief).
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

/**
 * How close to neutral white a pixel must be to count as backdrop.
 *
 * Both checker tones sit above 225 and are grey to within a couple of units.
 * The channel-spread test is what keeps pale *coloured* art — sunlit stone,
 * cream walls — out of the flood: those drift 8-20 units between channels.
 */
const WHITE_MIN = 222;
const NEUTRAL_SPREAD = 10;

const isBackdrop = (r, g, b) =>
  r >= WHITE_MIN &&
  g >= WHITE_MIN &&
  b >= WHITE_MIN &&
  Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL_SPREAD;

/**
 * Flood from every border pixel, four-connected.
 *
 * Iterative with an explicit stack: a 1536x1024 sheet is 1.5M pixels and a
 * recursive fill blows the call stack on the first sheet.
 */
function backdropMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = y * width + x;
    if (mask[at]) return;
    const i = at * 4;
    if (!isBackdrop(data[i], data[i + 1], data[i + 2])) return;
    mask[at] = 1;
    stack.push(at);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const at = stack.pop();
    const x = at % width;
    const y = (at - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return mask;
}

/**
 * Softens the one-pixel fringe the checkerboard leaves behind.
 *
 * Where art meets backdrop the drawing tool blended them, so the outermost
 * ring of kept pixels is part backdrop — cut hard, it reads as a white halo
 * around every tree. Any kept pixel with a cleared neighbour is pulled toward
 * transparent in proportion to how white it is, which removes the halo without
 * eating the silhouette.
 */
function fadeFringe(data, mask, width, height) {
  const cleared = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] === 1 : true;
  let softened = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (mask[at]) continue;
      if (!cleared(x - 1, y) && !cleared(x + 1, y) && !cleared(x, y - 1) && !cleared(x, y + 1)) {
        continue;
      }
      const i = at * 4;
      const light = Math.min(data[i], data[i + 1], data[i + 2]);
      if (light < WHITE_MIN - 40) continue;
      // 222 -> keep, 255 -> gone.
      const keep = Math.max(0, Math.min(1, (255 - light) / 33));
      const alpha = Math.round(data[i + 3] * keep);
      if (alpha < data[i + 3]) {
        data[i + 3] = alpha;
        softened++;
      }
    }
  }
  return softened;
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex < 0) {
  console.error('usage: node tools/key-background.mjs <in.png> [...] --out <dir>');
  process.exit(2);
}
const outDir = args[outIndex + 1];
const inputs = args.slice(0, outIndex);
mkdirSync(outDir, { recursive: true });

for (const input of inputs) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const before = countTransparent(data);
  const mask = backdropMask(data, width, height);
  let cleared = 0;
  for (let at = 0; at < mask.length; at++) {
    if (!mask[at]) continue;
    data[at * 4 + 3] = 0;
    cleared++;
  }
  const softened = fadeFringe(data, mask, width, height);

  const out = join(outDir, basename(input));
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(out);

  const pct = (n) => ((100 * n) / (width * height)).toFixed(1) + '%';
  console.log(
    `${basename(input).padEnd(26)} ${width}x${height}` +
      `  trong suot ${pct(before)} -> ${pct(before + cleared)}` +
      `  (${cleared} px nen, ${softened} px vien)`,
  );
}

function countTransparent(data) {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 12) n++;
  return n;
}
