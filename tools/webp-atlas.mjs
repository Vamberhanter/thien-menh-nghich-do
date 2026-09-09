// Transcodes an already-built atlas from PNG to lossless WebP, in place.
//
//   node tools/webp-atlas.mjs public/assets/characters/nhuyen/atlas/nhuyen.json ...
//
// The builders are the right place to choose a format, and most of them now
// emit WebP directly. This exists for the ones whose source sheets are not on
// this machine: their packed output is on disk and correct, so there is nothing
// to re-cut — only to re-encode. Lossless, so every pixel and every frame
// rectangle in the JSON stays exactly what the builder produced; the only
// change to the atlas is the `image` filename.
//
// The old PNG is removed once the WebP is written, because the uploader ships a
// whole folder and would otherwise push both.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node tools/webp-atlas.mjs <atlas.json> [...]');
  process.exit(2);
}

let saved = 0;
let grown = 0;

for (const atlasPath of targets) {
  const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
  const dir = dirname(atlasPath);
  let touched = 0;

  for (const texture of atlas.textures ?? []) {
    if (!texture.image?.toLowerCase().endsWith('.png')) continue;
    const from = join(dir, texture.image);
    if (!existsSync(from)) throw new Error(`${atlasPath}: thieu ${texture.image}`);

    const image = texture.image.replace(/\.png$/i, '.webp');
    const to = join(dir, image);
    const { data, info } = await sharp(from)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Round-trip through raw RGBA rather than re-encoding the PNG stream, so
    // the result is the same pixels the builder packed regardless of what the
    // PNG's own filtering did to them.
    const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ lossless: true })
      .toBuffer();
    writeFileSync(to, out);

    const before = readFileSync(from).length;
    if (out.length >= before) grown++;
    saved += before - out.length;
    rmSync(from);
    texture.image = image;
    touched++;

    console.log(
      `  ${texture.image.padEnd(24)} ${info.width}x${info.height}` +
        `  ${(before / 1048576).toFixed(2)} -> ${(out.length / 1048576).toFixed(2)} MB` +
        `  (-${(100 * (1 - out.length / before)).toFixed(0)}%)`,
    );
  }

  if (touched === 0) {
    console.log(`${atlasPath}: khong con PNG nao`);
    continue;
  }
  writeFileSync(atlasPath, `${JSON.stringify(atlas, null, 2)}\n`);
  console.log(`${atlasPath}: ${touched} texture -> webp`);
}

console.log(`\ntiet kiem ${(saved / 1048576).toFixed(2)} MB` + (grown ? `  (${grown} file khong nho hon)` : ''));
