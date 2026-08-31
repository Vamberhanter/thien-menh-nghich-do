// Proves a trimmed atlas still draws exactly what the untrimmed one drew.
//
//   node tools/check-atlas.mjs <atlas.json> [reference-atlas.json]
//
// Trimming is only safe if the metadata can put the kept pixels back where they
// were. So for every frame this rebuilds the full `sourceSize` box out of the
// packed texture plus `spriteSourceSize`, and compares it against the same
// frame in a reference atlas — by default the copy in git HEAD, i.e. the
// untrimmed build. Any non-zero delta means the game would draw it shifted.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePNG } from './png-decode.mjs';

const [atlasPath, referencePath] = process.argv.slice(2);
if (!atlasPath) {
  console.error('usage: node tools/check-atlas.mjs <atlas.json> [reference.json]');
  process.exit(2);
}

const dir = dirname(atlasPath);

/** Loads an atlas from disk, or out of git HEAD when `fromGit` is set. */
function loadAtlas(path, fromGit) {
  const read = (file) =>
    fromGit
      ? execSync(`git show HEAD:"${file.replace(/\\/g, '/')}"`, {
          encoding: 'buffer',
          maxBuffer: 1 << 28,
        })
      : readFileSync(file);

  const atlas = JSON.parse(read(path).toString('utf8'));
  const images = new Map();
  for (const texture of atlas.textures) {
    const file = join(dirname(path), texture.image);
    if (fromGit) {
      // decodePNG reads from disk, so stage the blob in .tmp first
      const staged = join('.tmp', 'atlas-ref', texture.image);
      mkdirSync(dirname(staged), { recursive: true });
      writeFileSync(staged, read(file));
      images.set(texture.image, decodePNG(staged));
    } else {
      images.set(texture.image, decodePNG(file));
    }
  }
  return { atlas, images };
}

/** Rebuilds a frame's full untrimmed box as RGBA, exactly as Phaser would. */
function rebuild(frame, image) {
  const w = frame.sourceSize.w;
  const h = frame.sourceSize.h;
  const out = new Uint8Array(w * h * 4);
  const ss = frame.spriteSourceSize;
  const trimmed = frame.trimmed === true;
  const offsetX = trimmed ? ss.x : 0;
  const offsetY = trimmed ? ss.y : 0;

  for (let y = 0; y < frame.frame.h; y++) {
    for (let x = 0; x < frame.frame.w; x++) {
      const src = ((frame.frame.y + y) * image.width + (frame.frame.x + x)) * 4;
      const dx = offsetX + x;
      const dy = offsetY + y;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const dst = (dy * w + dx) * 4;
      out[dst] = image.data[src];
      out[dst + 1] = image.data[src + 1];
      out[dst + 2] = image.data[src + 2];
      out[dst + 3] = image.data[src + 3];
    }
  }
  return { w, h, data: out };
}

const current = loadAtlas(atlasPath, false);
const reference = referencePath
  ? loadAtlas(referencePath, false)
  : loadAtlas(atlasPath, true);

const byName = new Map();
for (const texture of reference.atlas.textures) {
  for (const frame of texture.frames) {
    byName.set(frame.filename, { frame, image: reference.images.get(texture.image) });
  }
}

let checked = 0;
let missing = 0;
let worst = 0;
let worstFrame = '';
const anchorProblems = [];

for (const texture of current.atlas.textures) {
  for (const frame of texture.frames) {
    const ref = byName.get(frame.filename);
    if (!ref) {
      missing++;
      console.log(`  ? ${frame.filename}: not in the reference`);
      continue;
    }

    // the pivot has to keep pointing at the same spot in the untrimmed box
    const a = frame.anchor;
    const b = ref.frame.anchor;
    if (a || b) {
      const ax = a ? a.x * frame.sourceSize.w : null;
      const bx = b ? b.x * ref.frame.sourceSize.w : null;
      const ay = a ? a.y * frame.sourceSize.h : null;
      const by = b ? b.y * ref.frame.sourceSize.h : null;
      if (Math.abs((ax ?? 0) - (bx ?? 0)) > 0.5 || Math.abs((ay ?? 0) - (by ?? 0)) > 0.5) {
        anchorProblems.push(`${frame.filename}: (${ax},${ay}) vs (${bx},${by})`);
      }
    }

    const mine = rebuild(frame, current.images.get(texture.image));
    const theirs = rebuild(ref.frame, ref.image);
    if (mine.w !== theirs.w || mine.h !== theirs.h) {
      console.log(`  ! ${frame.filename}: box ${mine.w}x${mine.h} vs ${theirs.w}x${theirs.h}`);
      worst = 255;
      worstFrame = frame.filename;
      continue;
    }
    let delta = 0;
    for (let i = 0; i < mine.data.length; i++) {
      const d = Math.abs(mine.data[i] - theirs.data[i]);
      if (d > delta) delta = d;
    }
    if (delta > worst) {
      worst = delta;
      worstFrame = frame.filename;
    }
    checked++;
  }
}

const currentArea = current.atlas.textures.reduce((s, t) => s + t.size.w * t.size.h, 0);
const referenceArea = reference.atlas.textures.reduce((s, t) => s + t.size.w * t.size.h, 0);

console.log(`frames compared : ${checked}${missing ? ` (${missing} missing)` : ''}`);
console.log(`max pixel delta : ${worst}${worst ? `  worst: ${worstFrame}` : '  (identical)'}`);
console.log(
  `texture area    : ${(referenceArea / 1e6).toFixed(2)} Mpx -> ${(currentArea / 1e6).toFixed(2)} Mpx` +
    `  (${Math.round((1 - currentArea / referenceArea) * 100)}% smaller)`,
);
if (anchorProblems.length) {
  console.log(`anchor moved on ${anchorProblems.length} frame(s):`);
  for (const line of anchorProblems.slice(0, 5)) console.log(`  ${line}`);
}

const ok = worst === 0 && missing === 0 && anchorProblems.length === 0;
console.log(ok ? '\nOK — the trimmed atlas draws identically' : '\nFAILED');
if (!existsSync(dir)) process.exit(1);
process.exit(ok ? 0 : 1);
