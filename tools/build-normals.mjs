// Adds normal maps to an already-built atlas, so its sprites can be lit.
//
//   node tools/build-normals.mjs public/assets/characters/wukong/atlas
//   node tools/build-normals.mjs --all
//   node tools/build-normals.mjs <dir> --preview .tmp/relit
//   node tools/build-normals.mjs --all --strip
//
// This runs *after* a character's own builder, on the packed images rather than
// on the source sheets, and that is the whole reason it can be one tool for
// every character: Phaser samples the normal map with the same UVs as the
// texture, so the two have to be the same size and the same layout, which is
// only true once the frames are packed.
//
// It writes `<image>_n.webp` beside each texture and adds `normalMap` to that
// texture's entry in the atlas JSON. `Phaser.Loader.FileTypes.MultiAtlasFile`
// reads that key and links the pair on load, so nothing in the game has to know
// the file exists — the only change there is turning on the lights.
//
// `--strip` takes the `normalMap` keys back out, and is not a convenience: the
// loader fetches every normal map it finds named in the JSON whether or not the
// lights are on, so an atlas carrying them with `Light2D` switched off pays the
// whole download for nothing. The generated files stay on disk, so turning the
// lighting on later is one run without `--strip` rather than a rebuild.
//
// `--preview` writes a relit copy of each texture next to nothing at all: it
// lights the art with the generated normals offline, which is how you judge a
// normal map without first wiring up the engine.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { decodeImage } from './image-io.mjs';
import { encodeNormal, normalNameFor, normalSurface } from './normal-map.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every atlas the game ships, for `--all`. */
const ATLAS_DIRS = [
  'public/assets/characters/nhuyen/atlas',
  'public/assets/characters/huyetlang/atlas',
  'public/assets/characters/wukong/atlas',
  'public/assets/characters/miku/atlas',
  'public/assets/boss/atlas',
  'public/assets/world/atlas',
];

/**
 * Lights one texture with its own normals, for eyeballing.
 *
 * A single light up and to the left, plus enough ambient to keep the shadowed
 * side readable — roughly what the scene will do. The point is not to look
 * pretty, it is to show whether the normals describe a body: if they do, the
 * character gains a lit side and a dark side and reads as round.
 */
function relight(img, normals, dir = { x: -0.55, y: -0.7, z: 0.45 }, ambient = 0.45) {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height * 4);
  const len = Math.hypot(dir.x, dir.y, dir.z);
  const lx = dir.x / len;
  const ly = dir.y / len;
  const lz = dir.z / len;

  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    if (data[s + 3] === 0) continue;
    const nx = (normals.data[s] / 255) * 2 - 1;
    const ny = (normals.data[s + 1] / 255) * 2 - 1;
    const nz = (normals.data[s + 2] / 255) * 2 - 1;
    const lambert = Math.max(0, nx * lx + ny * ly + nz * lz);
    const k = ambient + (1 - ambient) * lambert * 1.6;
    out[s] = Math.min(255, Math.round(data[s] * k));
    out[s + 1] = Math.min(255, Math.round(data[s + 1] * k));
    out[s + 2] = Math.min(255, Math.round(data[s + 2] * k));
    out[s + 3] = data[s + 3];
  }
  return { width, height, data: out };
}

async function buildDir(dir, previewDir, strip) {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) {
    console.log(`skip ${dir} (khong co)`);
    return;
  }
  const jsons = readdirSync(abs).filter((f) => f.endsWith('.json'));
  if (jsons.length === 0) {
    console.log(`skip ${dir} (khong co atlas json)`);
    return;
  }

  for (const name of jsons) {
    const jsonPath = join(abs, name);
    const atlas = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(atlas.textures)) continue;

    if (strip) {
      let removed = 0;
      for (const texture of atlas.textures) {
        if (texture.normalMap === undefined) continue;
        delete texture.normalMap;
        removed++;
      }
      writeFileSync(jsonPath, JSON.stringify(atlas, null, 2));
      console.log(`${dir}/${name}  bo ${removed} normalMap (file van con tren dia)`);
      continue;
    }

    let bytes = 0;
    for (const texture of atlas.textures) {
      const imagePath = join(abs, texture.image);
      if (!existsSync(imagePath)) {
        console.log(`  ! thieu ${texture.image}`);
        continue;
      }
      const img = await decodeImage(imagePath);
      const normals = normalSurface(img);
      const outName = normalNameFor(texture.image);
      const buf = await encodeNormal(normals);
      writeFileSync(join(abs, outName), buf);
      texture.normalMap = outName;
      bytes += buf.length;

      if (previewDir) {
        const pDir = resolve(ROOT, previewDir);
        mkdirSync(pDir, { recursive: true });
        const lit = relight(img, normals);
        writeFileSync(
          join(pDir, `${basename(texture.image).replace(/\.[a-z0-9]+$/i, '')}_relit.png`),
          await sharp(Buffer.from(lit.data.buffer, lit.data.byteOffset, lit.data.length), {
            raw: { width: lit.width, height: lit.height, channels: 4 },
          })
            .png()
            .toBuffer(),
        );
      }
    }

    writeFileSync(jsonPath, JSON.stringify(atlas, null, 2));
    console.log(
      `${dir}/${name}  ${atlas.textures.length} normal map  +${(bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }
}

const args = process.argv.slice(2);
const previewIndex = args.indexOf('--preview');
const previewDir = previewIndex >= 0 ? args[previewIndex + 1] : null;
const dirs = args.includes('--all')
  ? ATLAS_DIRS
  : args.filter((a) => !a.startsWith('--') && a !== previewDir);

if (dirs.length === 0) {
  console.log('dung: node tools/build-normals.mjs <atlas-dir> | --all  [--preview <dir>]');
} else {
  for (const dir of dirs) await buildDir(dir, previewDir, args.includes('--strip'));
}
