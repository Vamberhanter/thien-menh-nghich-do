// Minimal PNG encoder (RGBA8) — no external dependencies.
import { constants, deflateSync } from 'node:zlib';

const { Z_FILTERED } = constants;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** @param {{width:number,height:number,data:Uint8Array}} img */
export function encodePNG(img) {
  const { width, height, data } = img;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk(
      'IDAT',
      deflateSync(filterScanlines(data, width, height), {
        level: 9,
        // the data coming out of the filters is small deltas, which is exactly
        // what this strategy is tuned for — worth another 1-3% here
        strategy: Z_FILTERED,
      }),
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Per-row PNG filtering, choosing the cheapest of the five filters for each
 * scanline (libpng's minimum-sum-of-absolute-differences heuristic).
 *
 * This is lossless — the decoder reverses it exactly — but it decides most of a
 * PNG's size, because deflate compresses small deltas far better than raw
 * pixels. Writing filter 0 for every row, which this used to do, costs 14-28%
 * on these atlases: 2488KB -> 1795KB on the boss's walk sheet alone.
 */
function filterScanlines(data, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);

  // one scratch buffer per filter, reused for every row
  const candidates = [
    Buffer.alloc(stride),
    Buffer.alloc(stride),
    Buffer.alloc(stride),
    Buffer.alloc(stride),
    Buffer.alloc(stride),
  ];
  const current = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    current.set(data.subarray(y * stride, (y + 1) * stride));

    for (let i = 0; i < stride; i++) {
      const x = current[i];
      const a = i >= bpp ? current[i - bpp] : 0; // left
      const b = previous[i]; // above
      const c = i >= bpp ? previous[i - bpp] : 0; // above-left
      candidates[0][i] = x;
      candidates[1][i] = (x - a) & 0xff;
      candidates[2][i] = (x - b) & 0xff;
      candidates[3][i] = (x - ((a + b) >> 1)) & 0xff;
      candidates[4][i] = (x - paeth(a, b, c)) & 0xff;
    }

    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const buf = candidates[f];
      let score = 0;
      // treat each byte as signed: near-zero deltas are what compresses
      for (let i = 0; i < stride; i++) {
        const v = buf[i];
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    out[y * (stride + 1)] = best;
    candidates[best].copy(out, y * (stride + 1) + 1);
    previous.set(current);
  }

  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
