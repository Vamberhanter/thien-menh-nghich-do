// Contact sheet of a built atlas, drawn the way Phaser will draw it.
//
//   node tools/preview-atlas.mjs <atlas.json> <out.png> [clip-filter]
//
// One row per clip. Each cell rebuilds the frame's full `sourceSize` box out of
// the packed texture and its trim offset, then marks the frame's `anchor` with
// a ground line and a centre line. Every cell is the same size across the whole
// sheet, so this answers the three questions a rebuild has to get right:
//
//   * is anything clipped — art touching a cell edge has been cut off;
//   * is the scale consistent — bodies should be the same height in every row;
//   * do the feet agree — the ground line should sit under them in every frame.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';

const [atlasPath, outPath, filter] = process.argv.slice(2);
if (!atlasPath || !outPath) {
  console.error('usage: node tools/preview-atlas.mjs <atlas.json> <out.png> [clip-filter]');
  process.exit(2);
}

const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
const dir = dirname(atlasPath);

/** Every frame, keyed by clip, in frame order. */
const clips = new Map();
for (const texture of atlas.textures) {
  const image = decodePNG(join(dir, texture.image));
  for (const frame of texture.frames) {
    const match = /^(.*)_(\d+)$/.exec(frame.filename);
    const clip = match ? match[1] : frame.filename;
    const index = match ? Number(match[2]) : 0;
    if (filter && !clip.includes(filter)) continue;
    if (!clips.has(clip)) clips.set(clip, []);
    clips.get(clip).push({ frame, image, index });
  }
}
if (clips.size === 0) {
  console.error(`no clips matched${filter ? ` "${filter}"` : ''}`);
  process.exit(1);
}
for (const list of clips.values()) list.sort((a, b) => a.index - b.index);

const CELL = { w: 0, h: 0 };
let columns = 0;
for (const list of clips.values()) {
  columns = Math.max(columns, list.length);
  for (const { frame } of list) {
    CELL.w = Math.max(CELL.w, frame.sourceSize.w);
    CELL.h = Math.max(CELL.h, frame.sourceSize.h);
  }
}

const LABEL = 8;
const canvas = new Surface(columns * CELL.w, clips.size * (CELL.h + LABEL));

/** Checkerboard, with a bright seam on every cell edge. */
for (let y = 0; y < canvas.height; y++) {
  for (let x = 0; x < canvas.width; x++) {
    const row = Math.floor(y / (CELL.h + LABEL));
    const inLabel = y - row * (CELL.h + LABEL) >= CELL.h;
    const edge = x % CELL.w === 0 || (y - row * (CELL.h + LABEL)) % CELL.h === 0;
    const shade = inLabel ? 24 : ((x >> 3) + (y >> 3)) % 2 ? 64 : 104;
    canvas.set(x, y, edge && !inLabel ? [190, 190, 190, 255] : [shade, shade, shade, 255]);
  }
}

const blend = (x, y, colour, alpha) => {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const d = canvas.get(x, y);
  canvas.set(x, y, [
    Math.round(colour[0] * alpha + d[0] * (1 - alpha)),
    Math.round(colour[1] * alpha + d[1] * (1 - alpha)),
    Math.round(colour[2] * alpha + d[2] * (1 - alpha)),
    255,
  ]);
};

let row = 0;
const report = [];
for (const [clip, list] of clips) {
  const originY = row * (CELL.h + LABEL);
  let touchedEdge = false;

  list.forEach(({ frame, image }, col) => {
    const originX = col * CELL.w;
    // centre the box in the cell so rows with different boxes stay comparable
    const padX = Math.round((CELL.w - frame.sourceSize.w) / 2);
    const padY = CELL.h - frame.sourceSize.h;
    const ss = frame.spriteSourceSize;

    for (let y = 0; y < frame.frame.h; y++) {
      for (let x = 0; x < frame.frame.w; x++) {
        const s = ((frame.frame.y + y) * image.width + (frame.frame.x + x)) * 4;
        const a = image.data[s + 3] / 255;
        if (a === 0) continue;
        const bx = ss.x + x;
        const by = ss.y + y;
        if (bx === 0 || by === 0 || bx === frame.sourceSize.w - 1 || by === frame.sourceSize.h - 1) {
          touchedEdge = true;
        }
        blend(
          originX + padX + bx,
          originY + padY + by,
          [image.data[s], image.data[s + 1], image.data[s + 2]],
          a,
        );
      }
    }

    if (frame.anchor) {
      const ax = originX + padX + Math.round(frame.anchor.x * frame.sourceSize.w);
      const ay = originY + padY + Math.round(frame.anchor.y * frame.sourceSize.h);
      for (let x = originX; x < originX + CELL.w; x++) blend(x, ay, [255, 60, 60], 0.55);
      for (let y = originY + padY; y < originY + CELL.h; y++) blend(ax, y, [80, 200, 255], 0.5);
    }
  });

  // label bar: one bright block per frame, red if that clip touched a box edge
  for (let x = 0; x < list.length * CELL.w; x++) {
    for (let y = 0; y < LABEL - 2; y++) {
      canvas.set(x, originY + CELL.h + y, touchedEdge ? [220, 60, 60, 255] : [90, 170, 110, 255]);
    }
  }

  report.push(
    `${clip.padEnd(14)} ${String(list.length).padStart(2)} frames  box ${frame0(list).w}x${
      frame0(list).h
    }${touchedEdge ? '   *** ART TOUCHES THE BOX EDGE ***' : ''}`,
  );
  row++;
}

function frame0(list) {
  return list[0].frame.sourceSize;
}

writePreview(outPath, canvas);
for (const line of report) console.log(line);
console.log(`\n${outPath}  ${canvas.width}x${canvas.height}  (${clips.size} clips)`);
console.log('green bar = art clears its box on all sides; red bar = something is clipped');

function writePreview(path, surface) {
  const buf = encodePNG(surface);
  const CHUNK = 60000;
  const fd = openSync(path, 'w');
  try {
    for (let i = 0; i < buf.length; i += CHUNK) {
      writeSync(fd, Buffer.from(buf).subarray(i, i + CHUNK));
    }
  } finally {
    closeSync(fd);
  }
}
