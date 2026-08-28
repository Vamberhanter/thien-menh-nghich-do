// Builds every Lâm Uyên sprite sheet + the Phaser multiatlas JSON.
//   node tools/generate-lin-yuan-sprites.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { FRAME_H, FRAME_W, renderFrame } from './lin-yuan-art.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'lin-yuan');
const DIRS = ['down', 'up', 'left', 'right'];

/* ------------------------------------------------------------------ poses */

const IDLE = [
  { bob: 0, sway: 0 },
  { bob: 1, sway: 1 },
  { bob: 1, sway: 1 },
  { bob: 0, sway: 0 },
];

const WALK = [
  { legPhase: 1, bob: 0, sway: 1, flutter: 1 },
  { legPhase: 0.5, bob: 1, sway: 0, flutter: 0 },
  { legPhase: 0, bob: 1, sway: -1, flutter: 0 },
  { legPhase: -1, bob: 0, sway: -1, flutter: 1 },
  { legPhase: -0.5, bob: 1, sway: 0, flutter: 0 },
  { legPhase: 0, bob: 1, sway: 1, flutter: 0 },
];

const ATTACK = [
  { sword: { rel: -135, len: 14 }, bob: 0, legPhase: -0.4 },
  { sword: { rel: -90, len: 15 }, bob: -1, legPhase: -0.2 },
  { sword: { rel: -35, len: 17 }, bob: 0, legPhase: 0.4, fx: { slash: { r: 16, a0: -1.2, a1: -0.2 } } },
  { sword: { rel: 15, len: 18 }, bob: 1, legPhase: 0.8, fx: { slash: { r: 17, a0: -0.6, a1: 0.6 } } },
  { sword: { rel: 55, len: 16 }, bob: 1, legPhase: 0.6, fx: { slash: { r: 15, a0: 0.1, a1: 1.1 } } },
  { sword: { rel: 25, len: 14 }, bob: 0, legPhase: 0.2 },
];

const SKILL = [
  { sword: { rel: -60, len: 14 }, bob: 0, legPhase: -0.4, fx: { motes: 6 } },
  { sword: { rel: -40, len: 14 }, bob: -1, legPhase: -0.2, fx: { motes: 8, orb: 2, dist: 8 } },
  { sword: { rel: -10, len: 15 }, bob: -1, legPhase: 0, fx: { orb: 3, dist: 10, motes: 6 } },
  { sword: { rel: 0, len: 16 }, bob: 0, legPhase: 0.3, fx: { orb: 5, dist: 10 } },
  { sword: { rel: 0, len: 17, glow: true }, bob: 1, legPhase: 0.7, fx: { crescent: 7, dist: 11 } },
  { sword: { rel: 5, len: 17, glow: true }, bob: 1, legPhase: 0.7, fx: { crescent: 9, dist: 14 } },
  { sword: { rel: 10, len: 16 }, bob: 0, legPhase: 0.4, fx: { crescent: 11, dist: 16 } },
  { sword: { rel: 20, len: 14 }, bob: 0, legPhase: 0.1, fx: { motes: 4 } },
];

const HURT = [
  { dir: 'down', hurt: 2, flash: 0.65 },
  { dir: 'down', hurt: 3, flash: 0.35 },
  { dir: 'down', hurt: 1, flash: 0.12 },
];

const DEATH = [
  { dir: 'down', hurt: 3, flash: 0.45 },
  { dir: 'down', fallen: 0.2 },
  { dir: 'down', fallen: 0.45 },
  { dir: 'down', fallen: 0.62 },
  { dir: 'down', fallen: 0.85, alpha: 0.85, fx: { motes: 8 } },
  { dir: 'down', fallen: 1, alpha: 0.5, fx: { motes: 6 } },
];

/* ------------------------------------------------------------------ sheets */

/** Directional sheet: one row per direction, one column per frame. */
function directionalSheet(name, poses) {
  const cols = poses.length;
  const rows = DIRS.length;
  const sheet = new Surface(cols * FRAME_W, rows * FRAME_H);
  const frames = [];
  DIRS.forEach((dir, row) => {
    poses.forEach((pose, col) => {
      sheet.blit(renderFrame({ ...pose, dir }), col * FRAME_W, row * FRAME_H);
      frames.push(frameEntry(`${name}_${dir}_${col}`, col * FRAME_W, row * FRAME_H));
    });
  });
  return { sheet, frames };
}

/** Single-row sheet (hurt / death are direction agnostic by design). */
function flatSheet(name, poses) {
  const sheet = new Surface(poses.length * FRAME_W, FRAME_H);
  const frames = [];
  poses.forEach((pose, col) => {
    sheet.blit(renderFrame(pose), col * FRAME_W, 0);
    frames.push(frameEntry(`${name}_${col}`, col * FRAME_W, 0));
  });
  return { sheet, frames };
}

function frameEntry(filename, x, y) {
  return {
    filename,
    rotated: false,
    trimmed: false,
    sourceSize: { w: FRAME_W, h: FRAME_H },
    spriteSourceSize: { x: 0, y: 0, w: FRAME_W, h: FRAME_H },
    frame: { x, y, w: FRAME_W, h: FRAME_H },
  };
}

const SHEETS = [
  { file: 'lin-yuan-idle.png', ...directionalSheet('idle', IDLE) },
  { file: 'lin-yuan-walk.png', ...directionalSheet('walk', WALK) },
  { file: 'lin-yuan-attack.png', ...directionalSheet('attack', ATTACK) },
  { file: 'lin-yuan-skill.png', ...directionalSheet('skill', SKILL) },
  { file: 'lin-yuan-hurt.png', ...flatSheet('hurt', HURT) },
  { file: 'lin-yuan-death.png', ...flatSheet('death', DEATH) },
];

mkdirSync(OUT_DIR, { recursive: true });

const atlas = {
  textures: SHEETS.map(({ file, sheet, frames }) => ({
    image: file,
    format: 'RGBA8888',
    size: { w: sheet.width, h: sheet.height },
    scale: 1,
    frames,
  })),
  meta: {
    app: 'thien-menh-nghich-do/tools/generate-lin-yuan-sprites.mjs',
    version: '1.0',
    smartupdate: 'procedural',
  },
};

for (const { file, sheet, frames } of SHEETS) {
  writeFileSync(join(OUT_DIR, file), encodePNG(sheet));
  console.log(`${file.padEnd(22)} ${sheet.width}x${sheet.height}  ${frames.length} frames`);
}
writeFileSync(join(OUT_DIR, 'lin-yuan.json'), JSON.stringify(atlas, null, 2));
console.log(`lin-yuan.json          ${atlas.textures.length} textures`);

// Optional contact sheet for eyeballing the whole rig: --preview <path>
const previewIdx = process.argv.indexOf('--preview');
if (previewIdx !== -1 && process.argv[previewIdx + 1]) {
  const width = Math.max(...SHEETS.map((s) => s.sheet.width));
  const height = SHEETS.reduce((sum, s) => sum + s.sheet.height, 0);
  const preview = new Surface(width, height);
  preview.rect(0, 0, width, height, [46, 52, 64, 255]);
  let y = 0;
  for (const { sheet } of SHEETS) {
    preview.blit(sheet, 0, y);
    y += sheet.height;
  }
  writeFileSync(process.argv[previewIdx + 1], encodePNG(preview));
  console.log(`preview -> ${process.argv[previewIdx + 1]}`);
}
