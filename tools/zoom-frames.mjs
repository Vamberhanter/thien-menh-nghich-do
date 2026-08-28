// Zoomed montage of extracted frames, for eyeballing poses.
//   node tools/zoom-frames.mjs <out.png> <zoom> <cols> r0c0 r0c1 ...
import { writeFileSync } from 'node:fs';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { analyseSheet, cutFrame } from './extract-lamuyen.mjs';

const [out, zoomArg, colsArg, ...ids] = process.argv.slice(2);
const zoom = Number(zoomArg) || 3;
const cols = Number(colsArg) || 4;
const CELL = { w: 144, h: 144 };

const sheet = analyseSheet();
const { frames } = sheet;
const pick = ids.map((id) => {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) throw new Error(`bad id ${id}`);
  const frame = frames.find((f) => f.row === +m[1] && f.col === +m[2]);
  if (!frame) throw new Error(`no frame ${id}`);
  return { id, frame };
});

const rows = Math.ceil(pick.length / cols);
const canvas = new Surface(cols * CELL.w * zoom, rows * CELL.h * zoom);
for (let y = 0; y < canvas.height; y++)
  for (let x = 0; x < canvas.width; x++)
    canvas.set(x, y, ((x >> 4) + (y >> 4)) % 2 ? [56, 60, 72, 255] : [38, 42, 52, 255]);

pick.forEach(({ frame }, i) => {
  const cut = cutFrame(sheet, frame, CELL, { x: CELL.w / 2, y: CELL.h - 16 });
  const ox = (i % cols) * CELL.w * zoom;
  const oy = Math.floor(i / cols) * CELL.h * zoom;
  for (let y = 0; y < CELL.h; y++) {
    for (let x = 0; x < CELL.w; x++) {
      const c = cut.get(x, y);
      if (c[3] === 0) continue;
      // composite onto the opaque checker: what you see is what the game shows
      const a = c[3] / 255;
      for (let j = 0; j < zoom; j++)
        for (let k = 0; k < zoom; k++) {
          const px = ox + x * zoom + k;
          const py = oy + y * zoom + j;
          const d = canvas.get(px, py);
          canvas.set(px, py, [
            Math.round(c[0] * a + d[0] * (1 - a)),
            Math.round(c[1] * a + d[1] * (1 - a)),
            Math.round(c[2] * a + d[2] * (1 - a)),
            255,
          ]);
        }
    }
  }
  // corner tick marks every cell so the grid is readable
  for (let t = 0; t < 10 * zoom; t++) {
    canvas.set(ox + t, oy, [255, 220, 120, 255]);
    canvas.set(ox, oy + t, [255, 220, 120, 255]);
  }
});

writeFileSync(out, encodePNG(canvas));
console.log(`${pick.map((p) => p.id).join(' ')} -> ${out} (${canvas.width}x${canvas.height})`);
