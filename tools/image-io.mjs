// Shared read/write for the atlas pipeline's *output* images (the packed
// textures the game actually fetches). Source sheets stay PNG and keep using
// `png.mjs` / `png-decode.mjs` directly — this only covers the packed atlas
// image, which is why it dispatches on extension: a build script picks the
// format by naming its `spec.file`, and every reader (check-atlas, preview)
// follows along without caring which one it is.
import sharp from 'sharp';
import { decodePNG } from './png-decode.mjs';

/** Lossless WebP — pixel-exact like the PNG encoder it replaces, smaller. */
export async function encodeWebP(surface) {
  return sharp(Buffer.from(surface.data.buffer, surface.data.byteOffset, surface.data.length), {
    raw: { width: surface.width, height: surface.height, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
}

/** Decodes a packed atlas image, PNG or WebP, to the same `{width, height, data}` shape. */
export async function decodeImage(path) {
  if (!/\.webp$/i.test(path)) return decodePNG(path);
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
