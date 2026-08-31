// Trims transparent margins off every frame and packs what is left into one
// texture.
//
// Before this, each output file was a grid of identical boxes sized to the
// biggest frame in the group, so 65% of every atlas was empty pixels — paid for
// twice, once in the download and again in VRAM, where a texture costs
// width * height * 4 no matter what is drawn on it.
//
// Trimming is invisible to the game because the metadata carries the original
// box: `sourceSize` is what the frame used to be, `spriteSourceSize` is where
// the kept pixels sat inside it, and Phaser re-inserts that offset when it
// draws (`Frame.setTrim`). A sprite's `width`/`height` still report the
// untrimmed size (`Frame.realWidth`), so origins, custom pivots and anything
// derived from `displayOrigin` keep working untouched.
import { Surface } from './pixel.mjs';

/** Transparent gutter between packed frames, in px. */
const PADDING = 1;

/**
 * Widest texture we will emit. 2048 is the size every WebGL implementation
 * worth supporting can hold, and keeping the sheet narrow lets the shelf packer
 * fill rows instead of leaving a long ragged edge.
 */
const MAX_WIDTH = 2048;

/** Lays the items out in shelves no wider than `targetWidth`. */
function shelve(order, targetWidth) {
  const places = new Map();
  let cursorX = PADDING;
  let cursorY = PADDING;
  let shelfHeight = 0;
  let usedWidth = 0;

  for (const item of order) {
    if (cursorX + item.box.w + PADDING > targetWidth && cursorX > PADDING) {
      cursorX = PADDING;
      cursorY += shelfHeight + PADDING;
      shelfHeight = 0;
    }
    places.set(item, { x: cursorX, y: cursorY });
    cursorX += item.box.w + PADDING;
    usedWidth = Math.max(usedWidth, cursorX);
    shelfHeight = Math.max(shelfHeight, item.box.h);
  }

  return {
    places,
    width: Math.max(2, usedWidth + (usedWidth % 2)),
    height: Math.max(2, cursorY + shelfHeight + PADDING),
  };
}

/** Tight bounding box of the non-transparent pixels, or null if fully empty. */
function contentBox(surface) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (surface.alphaAt(x, y) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Packs already-cut frames into one texture.
 *
 * @param {Array<{name: string, surface: Surface, anchor?: {x: number, y: number}}>} entries
 *        `surface` is the frame drawn in its full box; `anchor` is the
 *        normalised pivot inside that box, if the character uses one.
 * @returns {{surface: Surface, frames: object[]}} texture plus atlas metadata
 */
export function packFrames(entries) {
  const items = entries.map((entry) => {
    const box = contentBox(entry.surface);
    return {
      entry,
      // A fully transparent frame still needs a slot, or the animation would
      // skip it: give it a 1x1 hole rather than dropping it.
      box: box ?? { x: 0, y: 0, w: 1, h: 1 },
      empty: box === null,
    };
  });

  // Shelf packing, tallest first: with sprites of similar height this fills
  // rows tightly, and it cannot produce the pathological gaps that packing in
  // declaration order does.
  const order = [...items].sort((a, b) => b.box.h - a.box.h);

  /**
   * Try several sheet widths and keep the one that wastes least.
   *
   * A shelf packer is very sensitive to this: always filling to MAX_WIDTH
   * produces long, one-shelf strips (1924x162 for the attack sheet) whose last
   * shelf is mostly air, while a squarer target lets rows share their height.
   * The candidates start from the area's square root — the best a perfect
   * packer could do — and widen from there.
   */
  const area = items.reduce(
    (sum, item) => sum + (item.box.w + PADDING) * (item.box.h + PADDING),
    0,
  );
  const widest = Math.max(...items.map((item) => item.box.w)) + PADDING * 2;
  const candidates = new Set();
  for (const factor of [1, 1.15, 1.35, 1.6, 2, 2.6, 3.4]) {
    candidates.add(Math.min(MAX_WIDTH, Math.max(widest, Math.ceil(Math.sqrt(area) * factor))));
  }
  candidates.add(Math.min(MAX_WIDTH, Math.max(widest, MAX_WIDTH)));

  let best = null;
  for (const targetWidth of candidates) {
    const layout = shelve(order, targetWidth);
    if (!best || layout.width * layout.height < best.width * best.height) best = layout;
  }

  for (const item of order) item.at = best.places.get(item);
  const width = best.width;
  const height = best.height;
  const surface = new Surface(width, height);

  const frames = [];
  for (const item of items) {
    const { entry, box, at, empty } = item;
    if (!empty) {
      for (let y = 0; y < box.h; y++) {
        for (let x = 0; x < box.w; x++) {
          const pixel = entry.surface.get(box.x + x, box.y + y);
          if (pixel[3] === 0) continue;
          surface.set(at.x + x, at.y + y, pixel);
        }
      }
    }
    frames.push({
      filename: entry.name,
      rotated: false,
      trimmed: true,
      // what the frame was before trimming — Phaser reports this as the
      // sprite's width/height, so origins and pivots are unaffected
      sourceSize: { w: entry.surface.width, h: entry.surface.height },
      // where the kept pixels sat inside that box
      spriteSourceSize: { x: box.x, y: box.y, w: box.w, h: box.h },
      frame: { x: at.x, y: at.y, w: box.w, h: box.h },
      ...(entry.anchor ? { anchor: entry.anchor } : {}),
    });
  }

  return { surface, frames };
}
