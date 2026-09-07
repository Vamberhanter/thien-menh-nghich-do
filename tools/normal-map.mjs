// Derives a normal map from a packed atlas image, so Phaser's `Light2D`
// pipeline has a surface to light.
//
//   import { normalMapFor } from './normal-map.mjs';
//
// The art was never drawn with a normal map in mind, so one has to be inferred,
// and the whole trick is what to infer it from.
//
// **Height comes mostly from the silhouette.** Blur the alpha channel and you
// get a field that is high in the middle of the character and falls away at his
// outline — which, read as a surface, is a body inflated into the round. That is
// what puts thickness on a flat sprite: the edges bend away from the light, so
// the rim goes dark on one side and hot on the other as the light moves.
//
// **Luminance only supplies detail.** It is tempting to use it as the height
// field outright, but on this art that inverts the form: these characters are
// drawn near-black with a bright rim, so the *brightest* pixels are the ones at
// the edge, and a luminance height field would make every outline a ridge and
// every body a pit. It is mixed in at a quarter weight, where it reads as
// surface relief — plate, folds, the twist of a flame — on top of a body shape
// that came from the silhouette.
//
// Everything outside the sprite is written flat (128, 128, 255) and fully
// transparent, so packed padding between frames cannot leak a false slope into
// the frame beside it.
import sharp from 'sharp';

/** How steeply the height field is read. Higher = more pronounced relief. */
const STRENGTH = 2.6;
/** Blur radius for the body form, and for the finer luminance detail. */
const FORM_BLUR = 4;
const DETAIL_BLUR = 1;
/** Share of the height field that comes from the silhouette rather than paint. */
const FORM_WEIGHT = 0.76;

/** Separable box blur over a Float32 plane, run twice for a smoother falloff. */
function blur(src, w, h, radius) {
  if (radius <= 0) return src;
  let a = src;
  let b = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          sum += a[row + xx];
          n++;
        }
        b[row + x] = sum / n;
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          sum += b[yy * w + x];
          n++;
        }
        a[y * w + x] = sum / n;
      }
    }
  }
  return a;
}

/**
 * Builds the RGBA normal map for one decoded image.
 *
 * @param {{width:number,height:number,data:Uint8Array}} img packed atlas image
 * @returns {{width:number,height:number,data:Uint8Array}} normal map, same size
 */
export function normalSurface(img) {
  const { width: w, height: h, data } = img;
  const n = w * h;

  const alpha = new Float32Array(n);
  const paint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * 4;
    const a = data[s + 3] / 255;
    alpha[i] = a;
    // Luminance is pre-multiplied by alpha so the fringe outside the art cannot
    // pull the detail field around.
    paint[i] = (((data[s] + data[s + 1] + data[s + 2]) / 3) / 255) * a;
  }

  const form = blur(alpha.slice(), w, h, FORM_BLUR);
  const detail = blur(paint, w, h, DETAIL_BLUR);

  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    height[i] = FORM_WEIGHT * form[i] + (1 - FORM_WEIGHT) * detail[i];
  }

  const out = new Uint8Array(n * 4);
  const at = (x, y) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = i * 4;

      if (data[s + 3] === 0) {
        // flat and invisible: packing padding must not slope
        out[s] = 128;
        out[s + 1] = 128;
        out[s + 2] = 255;
        out[s + 3] = 0;
        continue;
      }

      // Sobel on the height field
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      // The surface faces away from the uphill direction, hence the negation.
      let nx = -dx * STRENGTH;
      let ny = -dy * STRENGTH;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;

      out[s] = Math.round((nx * 0.5 + 0.5) * 255);
      out[s + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[s + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      out[s + 3] = 255;
    }
  }

  return { width: w, height: h, data: out };
}

/** Encodes a normal map. Lossless: a compressed normal shows up as facet noise. */
export async function encodeNormal(surface) {
  return sharp(Buffer.from(surface.data.buffer, surface.data.byteOffset, surface.data.length), {
    raw: { width: surface.width, height: surface.height, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
}

/** Convention: `wukong-idle.webp` -> `wukong-idle_n.webp`, matching Phaser's docs. */
export const normalNameFor = (image) => image.replace(/(\.[a-z0-9]+)$/i, '_n$1');
