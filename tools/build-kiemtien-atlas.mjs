// Cuts the Kiếm Tiên sheets into a feet-pivot Phaser atlas.
//   node tools/build-kiemtien-atlas.mjs [--dump]
//
// Seven 1536x1024 sheets, each a grid of poses: one walk, one attack, four
// skills and a sheet of extras. They are not one uniform grid — the rows differ
// per sheet, two sheets carry a printed label down the left edge, and the skill
// effects are far bigger than the pose they belong to.
//
// How a pose is found, and why not on the nominal grid:
//
//  * **Rows come from the art.** Dividing the height by the row count is wrong
//    on the attack sheet, whose poses run 143px tall inside a 128px cell and
//    drift up to 57px off the grid line as the sheet goes down. A horizontal
//    projection finds the real bands, which are separated cleanly on every
//    sheet.
//  * **Columns come from the art too, when they can.** Empty-column splitting
//    lands in the gaps between poses rather than inside one — on the walk sheet
//    a sword tip sits 2px into the next cell, so a grid cut would slice a blade
//    and paste its tip onto the neighbour. Fragments closer than MERGE are
//    joined back, which reunites a pose with its own detached sparks without
//    swallowing the label beside it.
//  * **When the effects fuse, the grid is the fallback.** On the later skill
//    sheets a single burst spans 1300px and there are no gaps left to split on.
//    Those sheets say so in their spec, and a band is divided evenly instead.
//    Every sheet declares what it expects and the split is checked against it,
//    so a mis-cut is a build error rather than a silently mangled frame.
//
// Two more things about this art:
//
//  * **Left and right are both drawn.** The other kits draw one profile and
//    flip it, which is why their clips read `_side`. Here they are separate
//    drawings (163x189 against 149x180, 25/255 mean difference from a mirror),
//    and mirroring either would move the sword to the wrong hand. So the atlas
//    carries whole facings and the animation module never sets `flip`.
//  * **The attack is drawn on eight headings**, including the diagonals, while
//    the walk is drawn on four. Both are kept as drawn; picking a diagonal
//    swing off the aim vector is the animation module's problem, not the
//    cutter's.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';
import { decodePNG } from './png-decode.mjs';
import { packFrames } from './atlas-pack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'public', 'assets', 'characters', 'kiemtien');
const OUT_DIR = join(SRC_DIR, 'atlas');
const DUMP = process.argv.includes('--dump') ? join(ROOT, '.tmp', 'kiemtien-frames') : null;

/** Breathing room around the pivot box, in pixels. */
const PAD = 12;
/** Below this a pixel is canvas. The sheets carry an invisible wash at 1-7. */
const ALPHA_FLOOR = 8;
/** Bands and columns are measured well above the wash, on real paint. */
const SOLID = 48;
/** Fragments closer than this belong to the same pose. */
const MERGE = 10;
/** Ignore specks: a band this short, or a run this narrow, is noise. */
const MIN_BAND = 25;
const MIN_RUN = 20;

const FOUR = ['up', 'down', 'left', 'right'];
/** The attack sheet's row order, read off the arrows printed beside each row. */
const EIGHT = ['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright'];

/**
 * What each sheet holds.
 *
 * `labelWidth` is the printed caption down the left edge — an arrow glyph on the
 * attack sheet, "Skill 1 (Lên)" and the like on the first two skill sheets.
 * Those columns are erased before anything is measured, rather than filtered
 * out afterwards: on the attack sheet the caption sits as little as 6px from
 * the first pose and on the up-left row it touches, so no gap rule separates
 * them. The numbers are the widest caption plus clearance, checked against the
 * leftmost pose on every row (attack captions end at 47 and poses start at 49;
 * the skill captions end at 87 and their poses start at 96).
 *
 * `split: 'grid'` forces even division of a band. The last three sheets need it:
 * one burst covers most of the row, so there is no empty column to cut on.
 */
const SHEETS = [
  {
    file: 'kiemtien.png',
    clip: (dir) => `walk_${dir}`,
    rows: FOUR,
    cols: 8,
    labelWidth: 0,
    texture: 'kiemtien-walk.png',
  },
  {
    file: 'kiemtien-attack.png',
    clip: (dir) => `atk_${dir}`,
    rows: EIGHT,
    cols: 8,
    labelWidth: 48,
    texture: 'kiemtien-attack.png',
  },
  {
    file: 'kiemtien-skill1.png',
    clip: (dir) => `skill1_${dir}`,
    rows: FOUR,
    cols: 7,
    labelWidth: 92,
    split: 'cells',
    texture: 'kiemtien-skill1.png',
  },
  // The ray. Its two vertical rows are eight poses on a clean grid — the beam
  // goes up or down, across the cut rather than along it, so nothing overlaps.
  // Its two sideways rows are six, and the beam runs straight down the axis
  // being cut: it crosses into the next cell and lies over the next pose, so
  // they are split on the character instead. See `characterRuns`.
  {
    file: 'kiemtien-skill2.png',
    clip: (dir) => `skill2_${dir}`,
    rows: FOUR,
    cols: [8, 8, 5, 4],
    labelWidth: 92,
    // Vertical rows on the sheet's own 192px grid; sideways rows on the
    // character, because there the ray runs along the cut.
    split: ['cells', 'cells', 'chars', 'chars'],
    // The crystal bloom the ray opens where it lands. Drawn at the far end of
    // the sideways rows, past the last pose she is in, so it is cut out as its
    // own frame and the scene puts it at the end of the lane.
    tailClip: 'raybloom',
    requireCharacter: true,
    anchorFromFirst: true,
    texture: 'kiemtien-skill2.png',
  },
  // One drawn pose per heading rather than a cycle: these read as the held
  // moment of an ultimate, so each becomes a single-frame clip.
  {
    file: 'kiemtien-skill3.png',
    clip: (dir) => `skill3_${dir}`,
    rows: ['up', 'left'],
    cols: 2,
    rowMajor: ['up', 'left', 'down', 'right'],
    labelWidth: 0,
    texture: 'kiemtien-skill3.png',
  },
  {
    file: 'kiemtien-skill4.png',
    clip: (dir) => `skill4_${dir}`,
    rows: ['up', 'left'],
    cols: 2,
    rowMajor: ['up', 'down', 'left', 'right'],
    labelWidth: 0,
    texture: 'kiemtien-skill4.png',
  },
  // Sword-flight. Up and down are six frames each; the side cycle is twelve,
  // drawn across two rows the way the death is — the two rows are the same
  // heading (29.5/255 apart as drawn, 58.3 against a mirror of each other), so
  // they are one loop rather than a left and a right. Only the right was ever
  // drawn; the animation module mirrors it, which is the single place anything
  // about this character flips.
  //
  // The last row is takeoff, landing and the light left on the ground after —
  // mixed, so it is numbered rather than sequenced, same as the extras sheet.
  {
    file: 'kiemtien-fly.png',
    clip: (name) => name,
    rows: ['fly_up', 'fly_down', 'fly_side', 'fly_side', 'flyfx'],
    cols: [6, 6, 6, 6, 7],
    labelWidth: 0,
    texture: 'kiemtien-fly.png',
  },
  // Hurt is one row of six. Death is twelve, drawn across two rows: she folds,
  // falls, and the sword-light burns off the ground where she lay.
  //
  // Both are titled with a pill above the row rather than a caption beside it,
  // so there is nothing to erase from the left edge — the titles are their own
  // bands, 52px tall against 168+ for a row of poses, and `minBand` drops them.
  {
    file: 'kiemtien-hurt-death.png',
    clip: (name) => name,
    rows: ['hurt', 'death', 'death'],
    cols: 6,
    labelWidth: 0,
    minBand: 80,
    texture: 'kiemtien-hurt.png',
  },
  // Mixed extras: some cells hold the character mid-cast, others a detached
  // impact with nobody in it. Cut by position and numbered, because nothing on
  // the sheet says what order they go in.
  {
    file: 'kiemtien-skill3.1.png',
    clip: () => 'fx',
    rows: 3,
    cols: 4,
    labelWidth: 0,
    // Both axes: its middle and bottom rows touch, so there is no empty scanline
    // to separate them either.
    split: 'grid',
    rowSplit: 'grid',
    numbered: true,
    texture: 'kiemtien-fx.png',
  },
];

/** Idle is derived from the walk — see the note in kiemtienAnimations.ts. */
const IDLE_FRAMES = 4;
const IDLE_BOB = [0, 1, 2, 1];

function alphaAt(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
  return img.data[(y * img.width + x) * 4 + 3];
}

/** Horizontal projection → the rows the art actually occupies. */
function bandsOf(img) {
  const bands = [];
  let start = -1;
  for (let y = 0; y <= img.height; y++) {
    let lit = 0;
    if (y < img.height) {
      for (let x = 0; x < img.width; x++) {
        if (alphaAt(img, x, y) >= SOLID && ++lit > 2) break;
      }
    }
    const on = lit > 2;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      bands.push({ top: start, bottom: y - 1 });
      start = -1;
    }
  }
  return bands.filter((b) => b.bottom - b.top + 1 >= MIN_BAND);
}

/** Empty-column split of one band, fragments rejoined, captions dropped. */
function runsOf(img, band, labelWidth) {
  const filled = new Uint8Array(img.width);
  for (let x = 0; x < img.width; x++) {
    for (let y = band.top; y <= band.bottom; y++) {
      if (alphaAt(img, x, y) >= SOLID) {
        filled[x] = 1;
        break;
      }
    }
  }
  const raw = [];
  let start = -1;
  for (let x = 0; x <= img.width; x++) {
    const on = x < img.width && filled[x] === 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      raw.push({ x0: start, x1: x - 1 });
      start = -1;
    }
  }
  const merged = [];
  for (const run of raw) {
    const last = merged[merged.length - 1];
    if (last && run.x0 - last.x1 <= MERGE) last.x1 = run.x1;
    else merged.push({ ...run });
  }
  return merged.filter((r) => r.x1 >= labelWidth && r.x1 - r.x0 + 1 >= MIN_RUN);
}

/**
 * Split a band on the character rather than on the art around her.
 *
 * For the one case nothing else can do: a technique whose effect runs *along*
 * the axis being cut. Skill 2 fires a ray of sword-qi, and in its two sideways
 * rows that ray crosses two cells and overlaps the next pose, so there is no
 * empty column to cut on and an even grid slices the ray in half and pastes the
 * far end onto its neighbour — the frames came out as beam fragments with
 * nobody in them.
 *
 * Her hair is the one thing on these sheets that is both opaque and near-black;
 * every beam glows. So the dark columns are her, one cluster per pose, and a
 * cut just before each cluster keeps every character with the ray she is
 * firing. Whatever trails past the last of them — the ray after it has left
 * her, and the bloom where it lands — is split on gaps, which work again out
 * there because there is no longer a character in the way.
 */
function characterRuns(img, band, cols, labelWidth) {
  // Tuned against rows whose true pose count is known by eye: skill1 is seven
  // per row and skill2 eight in both its vertical rows. A downward beam is
  // bright white and washes over her, so the threshold has to be generous
  // enough to still find the head underneath it — at the strict values that
  // suited the sideways rows it lost one pose in every down row.
  const DARK_SUM = 200;
  const MIN_COLUMN = 3;
  const MIN_CLUSTER = 10;
  const JOIN = 40;
  /** A head's strip opens a little before her, so her leading arm comes too. */
  const LEAD = 24;

  const dark = new Int32Array(img.width);
  for (let x = labelWidth; x < img.width; x++) {
    let n = 0;
    for (let y = band.top; y <= band.bottom; y++) {
      if (alphaAt(img, x, y) < 200) continue;
      const i = (y * img.width + x) * 4;
      if (img.data[i] + img.data[i + 1] + img.data[i + 2] < DARK_SUM) n++;
    }
    dark[x] = n;
  }
  const clusters = [];
  let start = -1;
  for (let x = 0; x <= img.width; x++) {
    const on = x < img.width && dark[x] >= MIN_COLUMN;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start >= MIN_CLUSTER) clusters.push({ x0: start, x1: x - 1 });
      start = -1;
    }
  }
  // A highlight through her hair can break one head into two clusters.
  const heads = [];
  for (const c of clusters) {
    const last = heads[heads.length - 1];
    if (last && c.x0 - last.x1 < JOIN) last.x1 = c.x1;
    else heads.push({ ...c });
  }
  if (!heads.length) return [];

  const runs = [];
  for (let i = 0; i < heads.length; i++) {
    const x0 = i === 0 ? labelWidth : Math.max(labelWidth, heads[i].x0 - LEAD);
    const x1 = i + 1 < heads.length ? Math.max(x0, heads[i + 1].x0 - LEAD - 1) : img.width - 1;
    runs.push({ x0, x1 });
  }

  /*
   * Stop the last frame where the effect leaves her.
   *
   * Past the last character these rows carry the ray still travelling and the
   * bloom where it lands. Those are not poses: pulled into the clip they play
   * as frames she is absent from — she blinks out and a flower appears at her
   * feet, because a frame with nobody in it puts its pivot under the bloom.
   * The bloom belongs in the world, out at the end of the ray, and
   * `castSwordRay` already puts one there.
   */
  const last = runs[runs.length - 1];
  const tail = runsOf(img, band, labelWidth).filter((r) => r.x0 > last.x0);
  if (tail.length) last.x1 = tail[0].x0 - 1;
  runs.tail = tail;

  if (runs.length !== cols) {
    console.log(
      `    character split found ${runs.length} poses, expected ${cols}` +
        ` (${runs.map((r) => `${r.x0}-${r.x1}`).join(' ')})`,
    );
  }
  return runs;
}

/**
 * Even division of the whole sheet width, ignoring where paint happens to fall.
 *
 * The difference from `gridRuns` matters more than it sounds. That one divides
 * the *painted* span, so a row whose effect reaches further than its neighbours
 * gets wider cells and every boundary after the first drifts. On skill2's
 * downward row the drift was about 14px per cell, which is nothing until a
 * character standing 9px from a boundary is sliced down the middle — five of
 * its eight frames came out with no one in them.
 *
 * This divides the sheet the way the artist laid it out: 1536 across 8 is 192,
 * whatever the beams do. Checked by hand against both vertical rows — every
 * character sits inside its own cell.
 */
function cellRuns(img, cols) {
  return Array.from({ length: cols }, (_, i) => ({
    x0: Math.round((i * img.width) / cols),
    x1: Math.round(((i + 1) * img.width) / cols) - 1,
  }));
}

/** Even division of a band's painted span — the fallback when effects fuse. */
function gridRuns(img, band, labelWidth, cols) {
  let left = img.width;
  let right = -1;
  for (let x = labelWidth; x < img.width; x++) {
    for (let y = band.top; y <= band.bottom; y++) {
      if (alphaAt(img, x, y) < SOLID) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      break;
    }
  }
  if (right < 0) return [];
  const span = (right - left + 1) / cols;
  return Array.from({ length: cols }, (_, i) => ({
    x0: Math.round(left + i * span),
    x1: Math.round(left + (i + 1) * span) - 1,
  }));
}

function cut(img, run, band) {
  const w = run.x1 - run.x0 + 1;
  const h = band.bottom - band.top + 1;
  const out = new Surface(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((band.top + y) * img.width + (run.x0 + x)) * 4;
      const a = img.data[i + 3];
      if (a < ALPHA_FLOOR) continue;
      out.set(x, y, [img.data[i], img.data[i + 1], img.data[i + 2], a]);
    }
  }
  return out;
}

function contentBounds(surface) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (!surface.alphaAt(x, y)) continue;
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
 * Where the character meets the floor.
 *
 * Measured on solid paint only, and on the body rather than the whole frame:
 * a skill's effect reaches well past the feet — under them, on the ground, and
 * out to the side — so the silhouette's own lowest row is not the floor. The
 * lowest band of *opaque* pixels is, because the effects are translucent and
 * the character is not.
 */
function measureFeet(surface) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (surface.alphaAt(x, y) < 200) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const box =
    maxX < 0 ? contentBounds(surface) : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  if (!box) return { x: surface.width / 2, y: surface.height - 1 };

  const from = Math.max(box.y, box.y + box.h - Math.max(4, Math.round(box.h * 0.14)));
  const hist = new Int32Array(box.w);
  for (let y = from; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (surface.alphaAt(x, y) < 200) continue;
      const [r, g, b] = surface.get(x, y);
      hist[x - box.x] += r + g + b < 280 ? 2 : 1;
    }
  }
  const peak = Math.max(1, ...hist);
  const floor = peak * 0.22;
  let left = -1;
  let right = -1;
  for (let i = 0; i < hist.length; i++) {
    if (hist[i] < floor) continue;
    if (left < 0) left = i;
    right = i;
  }
  const feetX = left < 0 ? box.x + box.w / 2 : box.x + (left + right) / 2;
  return { x: feetX, y: box.y + box.h - 1 };
}

/** Horizontal span of the feet — narrowest means legs together. */
function feetSpan(surface) {
  const box = contentBounds(surface);
  if (!box) return Infinity;
  const from = Math.max(box.y, box.y + box.h - Math.max(4, Math.round(box.h * 0.12)));
  let left = Infinity;
  let right = -1;
  for (let y = from; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (!surface.alphaAt(x, y)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return right < 0 ? Infinity : right - left;
}

function boxFor(surfaces, anchors) {
  let maxLeft = 0;
  let maxRight = 0;
  let maxAbove = 0;
  let maxBelow = 0;
  surfaces.forEach((s, i) => {
    const b = contentBounds(s);
    if (!b) return;
    maxLeft = Math.max(maxLeft, anchors[i].x - b.x);
    maxRight = Math.max(maxRight, b.x + b.w - 1 - anchors[i].x);
    maxAbove = Math.max(maxAbove, anchors[i].y - b.y);
    maxBelow = Math.max(maxBelow, b.y + b.h - 1 - anchors[i].y);
  });
  const w = Math.ceil(maxLeft + maxRight) + PAD * 2 + 2;
  const h = Math.ceil(maxAbove + maxBelow) + PAD * 2 + 2;
  // Where the pivot sits inside that box, rather than assuming the floor is a
  // fixed inset from the bottom. A skill's effect reaches *below* the feet —
  // cracks and a shockwave on the ground, 31px of it on skill1's rising cut —
  // and the walk, which has nothing under its soles, hid that assumption.
  return {
    w: Math.max(16, w + (w % 2)),
    h: Math.max(16, h + (h % 2)),
    anchorX: PAD + Math.ceil(maxLeft),
    anchorY: PAD + Math.ceil(maxAbove),
  };
}

function placeOnPivot(surface, box, anchorPx, lift = 0, name = '?') {
  const out = new Surface(box.w, box.h);
  const ox = Math.round(box.anchorX - anchorPx.x);
  const oy = Math.round(box.anchorY - anchorPx.y) - lift;
  let kept = 0;
  let total = 0;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const [r, g, b, a] = surface.get(x, y);
      if (!a) continue;
      total++;
      const dx = x + ox;
      const dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= box.w || dy >= box.h) continue;
      out.set(dx, dy, [r, g, b, a]);
      kept++;
    }
  }
  if (kept < total) {
    const b = contentBounds(surface);
    throw new Error(
      `frame "${name}" clipped: kept ${kept}/${total} in ${box.w}x${box.h} (PAD=${PAD})\n` +
        `  content ${b.w}x${b.h} at ${b.x},${b.y}  anchor ${anchorPx.x.toFixed(1)},` +
        `${anchorPx.y.toFixed(1)}  offset ${ox},${oy}`,
    );
  }
  // The pivot stays on the floor through the bob, so breathing does not slide
  // the character along the ground plane.
  return {
    surface: out,
    anchor: { x: (anchorPx.x + ox) / box.w, y: (anchorPx.y + oy + lift) / box.h },
  };
}

/** Blanks the caption columns so nothing downstream can see them. */
function eraseCaption(img, width) {
  if (!width) return;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < width; x++) {
      img.data[(y * img.width + x) * 4 + 3] = 0;
    }
  }
}

/** Every pose on one sheet, as { clip, index, surface }. */
function readSheet(sheet) {
  const path = join(SRC_DIR, sheet.file);
  if (!existsSync(path)) {
    console.log(`  skipped ${sheet.file} — not present`);
    return null;
  }
  const img = decodePNG(path);
  eraseCaption(img, sheet.labelWidth);
  const wantRows = Array.isArray(sheet.rows) ? sheet.rows.length : sheet.rows;
  const bands =
    sheet.rowSplit === 'grid'
      ? Array.from({ length: wantRows }, (_, i) => ({
          top: Math.round((i * img.height) / wantRows),
          bottom: Math.round(((i + 1) * img.height) / wantRows) - 1,
        }))
      : bandsOf(img).filter((b) => b.bottom - b.top + 1 >= (sheet.minBand ?? MIN_BAND));
  if (bands.length !== wantRows) {
    throw new Error(
      `${sheet.file}: found ${bands.length} bands, expected ${wantRows} ` +
        `(${bands.map((b) => `${b.top}-${b.bottom}`).join(' ')})`,
    );
  }

  const poses = [];
  bands.forEach((band, row) => {
    const cols = colsOf(sheet, row);
    const mode = Array.isArray(sheet.split) ? sheet.split[row] : sheet.split;
    let runs =
      mode === 'grid'
        ? gridRuns(img, band, sheet.labelWidth, cols)
        : mode === 'cells'
          ? cellRuns(img, cols)
          : mode === 'chars'
            ? characterRuns(img, band, cols, sheet.labelWidth)
            : runsOf(img, band, sheet.labelWidth);
    if (runs.length !== cols) {
      const found = runs.length;
      runs = gridRuns(img, band, sheet.labelWidth, cols);
      console.log(
        `    row ${row}: split found ${found} poses, fell back to an even ${cols}-way grid`,
      );
    }
    runs.forEach((run, col) => {
      const surface = cut(img, run, band);
      /*
       * Skip a cell the artist left her out of.
       *
       * The ray's downward row has eight cells and she is drawn in seven: the
       * fourth is the beam and the lotus with nobody there. Kept, it played as
       * a one-frame blink out of existence in the middle of the cast. Dropping
       * it costs a beat of the beam growing and keeps her on screen, which is
       * the better trade. Opt-in, because plenty of frames elsewhere are
       * *meant* to have no one in them.
       */
      if (sheet.requireCharacter && !hasCharacter(surface)) {
        console.log(`    row ${row} cell ${col}: no character drawn, skipped`);
        return;
      }
      poses.push({ row, col, surface });
    });

    /*
     * Take the whole row's floor from the pose she stands in alone.
     *
     * `measureFeet` looks for the lowest solid pixels, which is her boots right
     * up until a technique puts something solid *below* them. The ray aimed
     * down draws a lotus under her: the pivot landed on the bottom of that, 142
     * pixels below her feet, and she was drawn that much into the air for the
     * whole cast.
     *
     * Where she stands does not change across a row — the poses are drawn at
     * one height in one band — so the first pose, which is her and nothing
     * else, says where the floor is for all of them. Each frame keeps its own
     * horizontal anchor, because she does drift sideways.
     */
    if (sheet.anchorFromFirst) {
      const mine = poses.filter((p) => p.row === row);
      if (mine.length) {
        const floor = measureFeet(mine[0].surface).y;
        for (const pose of mine) pose.anchor = { x: measureFeet(pose.surface).x, y: floor };
      }
    }
    // The effect the technique leaves behind, kept out of her clip and given a
    // name of its own so the scene can place it where the drawing says it lands
    // rather than on top of her.
    if (sheet.tailClip && runs.tail) {
      for (const run of runs.tail) {
        poses.push({ row, col: 0, clip: sheet.tailClip, surface: cut(img, run, band) });
      }
    }
  });

  // rowMajor lets a 2x2 sheet name its cells in reading order rather than by
  // row, which is how the ultimates are laid out.
  //
  // Otherwise a frame's number runs on per clip rather than restarting per
  // band, so a cycle drawn across two rows — the twelve-frame death, and the
  // side flight — comes out as one clip numbered 0..11 instead of two halves
  // that both start at zero.
  const seen = new Map();
  const named = poses.map(({ row, col, surface, clip: override, anchor }) => {
    if (override) {
      const index = (seen.get(override) ?? -1) + 1;
      seen.set(override, index);
      return { clip: override, index, surface, anchor };
    }
    if (sheet.numbered) {
      return { clip: sheet.clip(), index: seen.set('n', (seen.get('n') ?? -1) + 1).get('n'), surface, anchor };
    }
    if (sheet.rowMajor) {
      const dir = sheet.rowMajor[row * colsOf(sheet, row) + col];
      return { clip: sheet.clip(dir), index: 0, surface, anchor };
    }
    const clip = sheet.clip(sheet.rows[row]);
    const index = (seen.get(clip) ?? -1) + 1;
    seen.set(clip, index);
    return { clip, index, surface, anchor };
  });
  const shape = bands.map((_, r) => colsOf(sheet, r)).join('+');
  console.log(`  ${sheet.file.padEnd(24)} ${bands.length} bands (${shape}) = ${named.length} frames`);
  return named;
}

/**
 * Is she in this frame at all?
 *
 * Her hair is the one thing on these sheets that is both opaque and near-black
 * while every effect glows, so a frame with none of it has nobody in it. Used
 * to drop a cell the artist left her out of — see `requireCharacter`.
 */
function hasCharacter(surface) {
  let dark = 0;
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (surface.alphaAt(x, y) < 200) continue;
      const [r, g, b] = surface.get(x, y);
      if (r + g + b < 200 && ++dark >= 300) return true;
    }
  }
  return false;
}

/** Columns in one band — a sheet may declare a different count per row. */
function colsOf(sheet, row) {
  return Array.isArray(sheet.cols) ? sheet.cols[row] : sheet.cols;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (DUMP) mkdirSync(DUMP, { recursive: true });

  const textures = [];
  let walkPoses = null;

  for (const sheet of SHEETS) {
    const poses = readSheet(sheet);
    if (!poses) continue;
    if (sheet.file === 'kiemtien.png') walkPoses = poses;

    const plan = poses.map((p) => ({ name: `${p.clip}_${p.index}`, surface: p.surface, lift: 0, anchor: p.anchor }));
    emit(sheet.texture, plan, textures);
    if (DUMP) {
      for (const item of plan) {
        writeFileSync(join(DUMP, `${item.name}.png`), encodePNG(item.surface));
      }
    }
  }

  // Idle rides on the walk: the pose whose feet sit closest together, bobbed.
  if (walkPoses) {
    const plan = [];
    for (const dir of FOUR) {
      const row = walkPoses.filter((p) => p.clip === `walk_${dir}`);
      const spans = row.map((p) => feetSpan(p.surface));
      const neutral = row[spans.indexOf(Math.min(...spans))];
      for (let i = 0; i < IDLE_FRAMES; i++) {
        plan.push({ name: `idle_${dir}_${i}`, surface: neutral.surface, lift: IDLE_BOB[i] });
      }
    }
    emit('kiemtien-idle.png', plan, textures);
  }

  writeFileSync(
    join(OUT_DIR, 'kiemtien.json'),
    JSON.stringify(
      {
        textures,
        meta: {
          app: 'thien-menh-nghich-do/build-kiemtien-atlas',
          version: '1.0',
          image: 'kiemtien',
          format: 'RGBA8888',
          scale: '1',
        },
      },
      null,
      2,
    ),
  );
  console.log(`atlas ${join(OUT_DIR, 'kiemtien.json')}  (${textures.length} sheets)`);
}

function emit(file, plan, textures) {
  // A row may have been given one floor for all its frames — see anchorFromFirst.
  const anchors = plan.map((item) => item.anchor ?? measureFeet(item.surface));
  const box = boxFor(
    plan.map((item) => item.surface),
    anchors,
  );
  const entries = plan.map((item, i) => {
    const placed = placeOnPivot(item.surface, box, anchors[i], item.lift, item.name);
    return { name: item.name, surface: placed.surface, anchor: placed.anchor };
  });
  const packed = packFrames(entries);
  writeFileSync(join(OUT_DIR, file), encodePNG(packed.surface));
  textures.push({
    image: file,
    format: 'RGBA8888',
    size: { w: packed.surface.width, h: packed.surface.height },
    scale: 1,
    frames: packed.frames,
  });
  console.log(
    `wrote ${file.padEnd(24)} ${packed.surface.width}x${packed.surface.height}` +
      `  ${entries.length} frames  box ${box.w}x${box.h}`,
  );
}

main();
