// Segmentation engine for hand-made character sheets that already ship alpha.
//
// This was Như Yên's extractor; the boss sheets have the same shape of problem,
// so it now takes the sheet inventory and the colour rules as parameters and
// both characters share one implementation. What stays character-specific is
// the inventory (`SHEETS`) and two colour predicates — see `extract-nhuyen.mjs`
// and `extract-boss.mjs`.
//
// The job is deciding where one frame ends and the next begins, and where the
// character's feet are inside it. Three things make it non-trivial:
//   * The crescents of the attack/skill rows are wider than the pose and spill
//     into the neighbouring cell — a plain "column of empty pixels" split
//     merges two frames into one.
//   * Dissolve frames are loose sparkles, which the same split shatters into a
//     dozen slivers.
//   * Nothing is on a grid: each row has its own pitch and its own offset, and
//     on the boss sheets the big effects close the vertical gaps between rows
//     as well.
//
// So both axes are cut in two passes: trust the empty gaps when the number of
// solid blobs already matches the known count, otherwise search for the
// emptiest line near each ideal grid line.
import { decodePNG } from './png-decode.mjs';
import { Surface } from './pixel.mjs';

/** Pixels this faint are the sheets' anti-aliased fringe, not content. */
export const ALPHA_FLOOR = 8;

/**
 * Width of a frame's body profile, and where its feet anchor sits inside it.
 * Wide enough for the broadest frame on any sheet (an ice vortex reaches 285px
 * to one side of the anchor; the boss's crescents reach further still).
 */
export const PROFILE_SPAN = 900;
export const PROFILE_ORIGIN = 450;

/* ------------------------------------------------------------ mask helpers */

/** Runs of consecutive indices whose profile value exceeds `threshold`. */
export function bands(profile, threshold, minLength = 1) {
  const out = [];
  let start = -1;
  for (let i = 0; i < profile.length; i++) {
    const on = profile[i] > threshold;
    if (on && start === -1) start = i;
    if ((!on || i === profile.length - 1) && start !== -1) {
      const end = on ? i : i - 1;
      if (end - start + 1 >= minLength) out.push([start, end]);
      start = -1;
    }
  }
  return out;
}

/**
 * Cut lines along one axis, always `count + 1` values tiling [0, length].
 *
 * Pass 1 uses the gaps between solid blobs, after dropping sparkle-sized ones.
 * Pass 2 (effects merged cells into one blob) walks the ideal grid and picks the
 * emptiest line within ±42% of the pitch of each grid line.
 */
export function axisCuts(profile, length, count) {
  const mass = profile.reduce((a, b) => a + b, 0);
  const solid = bands(profile, 0, 3).filter((b) => {
    let m = 0;
    for (let x = b[0]; x <= b[1]; x++) m += profile[x];
    return m > mass * 0.02; // a sparkle is well under 2% of the row
  });

  if (solid.length === count) {
    const cuts = [0];
    for (let i = 1; i < solid.length; i++) {
      cuts.push(Math.round((solid[i - 1][1] + solid[i][0]) / 2));
    }
    cuts.push(length);
    return { cuts, method: 'gaps' };
  }

  const pitch = length / count;
  const cuts = [0];
  for (let k = 1; k < count; k++) {
    const ideal = k * pitch;
    const lo = Math.max(cuts[cuts.length - 1] + 8, Math.round(ideal - pitch * 0.42));
    const hi = Math.min(length - 1, Math.round(ideal + pitch * 0.42));
    let best = lo;
    let bestScore = Infinity;
    for (let x = lo; x <= hi; x++) {
      // emptiness first, closeness to the grid line only as a tie-break
      const score = profile[x] * 1000 + Math.abs(x - ideal);
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    cuts.push(best);
  }
  cuts.push(length);
  return { cuts, method: 'grid' };
}

/**
 * Splits detected bands until there are `expected` of them.
 *
 * Used when a sheet's rows do not come out as separate bands: the count of rows
 * inside each band is assumed proportional to its height (they are drawn on a
 * roughly regular pitch), and each band is then cut into its share by the same
 * emptiest-line search. Splitting inside the band matters — cutting the whole
 * sheet on an even grid instead slices across poses, because the bands
 * themselves are not evenly spaced.
 */
function splitBands(profile, detected, expected) {
  if (detected.length === 0) {
    const { cuts } = axisCuts(profile, profile.length, expected);
    return Array.from({ length: expected }, (_, r) => [cuts[r], cuts[r + 1] - 1]);
  }

  const heights = detected.map(([a, b]) => b - a + 1);
  const total = heights.reduce((s, h) => s + h, 0);
  const shares = heights.map((h) => Math.max(1, Math.round((expected * h) / total)));

  // rounding can overshoot or undershoot; settle up on the tallest bands
  const order = heights.map((h, i) => [h, i]).sort((p, q) => q[0] - p[0]);
  let drift = shares.reduce((s, v) => s + v, 0) - expected;
  for (let pass = 0; drift !== 0 && pass < 64; pass++) {
    for (const [, i] of order) {
      if (drift === 0) break;
      if (drift > 0 && shares[i] > 1) {
        shares[i]--;
        drift--;
      } else if (drift < 0) {
        shares[i]++;
        drift++;
      }
    }
  }

  const out = [];
  detected.forEach(([y0, y1], i) => {
    const share = shares[i];
    if (share === 1) {
      out.push([y0, y1]);
      return;
    }
    const sub = profile.slice(y0, y1 + 1);
    const { cuts } = axisCuts(sub, sub.length, share);
    for (let k = 0; k < share; k++) out.push([y0 + cuts[k], y0 + cuts[k + 1] - 1]);
  });
  return out;
}

/** 8-connected components of the alpha mask, labelled from 1. */
function labelComponents(alpha, width, height) {
  const labels = new Int32Array(width * height);
  const sizes = [0];
  const stack = new Int32Array(width * height);
  let next = 1;

  for (let seed = 0; seed < labels.length; seed++) {
    if (!alpha[seed] || labels[seed]) continue;
    const label = next++;
    let size = 0;
    let top = 0;
    stack[top++] = seed;
    labels[seed] = label;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = ny * width + nx;
          if (!alpha[j] || labels[j]) continue;
          labels[j] = label;
          stack[top++] = j;
        }
      }
    }
    sizes[label] = size;
  }
  return { labels, sizes };
}

/**
 * Reassigns every component in a row to the pose it is nearest to, rather than
 * to whichever cell holds most of its pixels.
 *
 * Majority-of-pixels is the wrong question for art that overhangs its cell.
 * Huyết Lang's tail curls a long way to his right, far enough that on some walk
 * frames more than half of it lies in the next cell — so the next frame drew a
 * severed tail floating beside a character it did not belong to. Distance
 * answers it correctly: the tail is touching its own body's bounding box and
 * 60px clear of the neighbour's.
 *
 * Each cell's largest owned component is taken as that cell's pose and is left
 * where it is, so no cell can end up empty. Everything else — armour plates cut
 * loose by the backdrop knockout, embers, a crescent trailing out of frame —
 * goes to the nearest pose, which also means nothing is dropped for splitting
 * evenly across a cut line.
 */
function reclaim({ alpha, labels, sizes, width, y0, y1, owns }) {
  const boxes = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!alpha[i]) continue;
      const label = labels[i];
      if (!label) continue;
      const box = boxes.get(label);
      if (!box) {
        boxes.set(label, { x0: x, x1: x, y0: y, y1: y });
        continue;
      }
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y > box.y1) box.y1 = y;
    }
  }

  const poses = owns.map((own) => {
    let biggest = 0; // label 0 is "no component", and sizes[0] is 0
    for (const label of own) if (sizes[label] > sizes[biggest]) biggest = label;
    return biggest;
  });
  const anchored = new Set(poses.filter(Boolean));

  /** Manhattan gap between two boxes; 0 when they overlap or touch. */
  const gap = (a, b) =>
    Math.max(0, a.x0 - b.x1, b.x0 - a.x1) + Math.max(0, a.y0 - b.y1, b.y0 - a.y1);

  for (const [label, box] of boxes) {
    if (anchored.has(label)) continue;
    let nearest = -1;
    let best = Infinity;
    poses.forEach((pose, col) => {
      if (!pose) return;
      const distance = gap(box, boxes.get(pose));
      if (distance < best) {
        best = distance;
        nearest = col;
      }
    });
    if (nearest < 0) continue;
    owns.forEach((own, col) => (col === nearest ? own.add(label) : own.delete(label)));
  }
}

/* ------------------------------------------------------------- the analysis */

/**
 * Cuts one sheet into frames.
 *
 * Each frame carries the set of component labels that belong to it, so a
 * crescent trailing out of the neighbouring cell is never blitted twice: a
 * component is kept only by the frame holding most of its pixels.
 *
 * `img` lets a caller hand in an already-decoded sheet. Sheets that ship a
 * black canvas instead of alpha have to be knocked out before segmentation, and
 * doing that in the caller keeps this file free of per-character clean-up.
 *
 * @param {{dir:string, key:string, spec:object, rules:{isDark:Function,isBody:Function}, img?:object}} input
 */
export function analyseSheet({ dir, key, spec, rules, img: decoded }) {
  if (!spec) throw new Error(`unknown sheet "${key}"`);

  const img = decoded ?? decodePNG(`${dir}/${spec.file}`);
  const { width, height, data } = img;

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    if (data[i * 4 + 3] >= ALPHA_FLOOR) alpha[i] = 1;
  }

  const { labels, sizes } = labelComponents(alpha, width, height);

  const rowProfile = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let c = 0;
    for (let x = 0; x < width; x++) if (alpha[y * width + x]) c++;
    rowProfile[y] = c;
  }

  /**
   * `cut: 'even'` skips the search entirely and tiles the sheet into equal
   * cells. Sheets laid out on a machine-made grid are better served this way:
   * the emptiest-line search drifts towards whatever side of a cell happens to
   * be emptier, and on Huyết Lang's strips that walked the cut lines up to 60px
   * off, far enough to swap which cell a pose belongs to.
   */
  const even = spec.cut === 'even';
  const tile = (length, count) =>
    Array.from({ length: count + 1 }, (_, k) => Math.round((k * length) / count));

  // Rows first by their empty gaps. Where the effects have closed those gaps —
  // the boss's ground explosions bridge three rows of its attack sheet — the
  // bands that hold more than one row are split further.
  let rows;
  let rowMethod;
  if (even) {
    const lines = tile(height, spec.cols.length);
    rows = spec.cols.map((_, r) => [lines[r], lines[r + 1] - 1]);
    rowMethod = 'even';
  } else {
    rows = bands(rowProfile, 2, 20);
    rowMethod = 'gaps';
    if (rows.length !== spec.cols.length) {
      rows = splitBands(rowProfile, rows, spec.cols.length);
      rowMethod = 'split';
    }
  }

  const frames = [];
  const rowInfo = [];

  rows.forEach(([y0, y1], row) => {
    const count = spec.cols[row];
    const colProfile = new Int32Array(width);
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < width; x++) if (alpha[y * width + x]) colProfile[x]++;
    }
    const { cuts, method } = even
      ? { cuts: tile(width, count), method: 'even' }
      : axisCuts(colProfile, width, count);
    rowInfo.push({ row, y0, y1, method, rowMethod, cuts });

    const owns = [];
    for (let col = 0; col < count; col++) {
      // how much of each component falls inside this slice
      const inside = new Map();
      for (let y = y0; y <= y1; y++) {
        for (let x = cuts[col]; x <= cuts[col + 1] - 1; x++) {
          const i = y * width + x;
          const label = labels[i];
          if (!label) continue;
          inside.set(label, (inside.get(label) ?? 0) + 1);
        }
      }
      const own = new Set();
      for (const [label, n] of inside) {
        if (n * 2 > sizes[label]) own.add(label);
      }
      owns.push(own);
    }

    if (spec.claim === 'nearest') reclaim({ alpha, labels, sizes, width, y0, y1, owns });

    for (let col = 0; col < count; col++) {
      frames.push(
        measureFrame({
          img,
          alpha,
          labels,
          own: owns[col],
          row,
          col,
          y0,
          y1,
          rules,
          sliceX0: cuts[col],
          sliceX1: cuts[col + 1] - 1,
        }),
      );
    }
  });

  addCycleAnchors(frames);

  return { key, spec, img, alpha, labels, sizes, rows: rowInfo, frames };
}

/**
 * Adds the `cycle` anchor: the one to use for a looping in-place animation.
 *
 * The `feet` anchor is the centre of the lowest dark pixels, which is right for
 * a pose that plants a foot — but in a walk cycle it latches onto whichever
 * foot happens to be lowest, and snaps between them from frame to frame. On the
 * side-view walk rows that is a **40px** jump, which reads as the character
 * skidding sideways as they walk.
 *
 * So for those rows the frames are aligned to each other instead: each frame's
 * body silhouette (hair and effects excluded — both flutter) is reduced to a
 * column profile, and cross-correlation against a reference frame says how far
 * the body actually sits from where the reference's body sits. The anchor
 * follows that offset, and the row is then shifted as a whole so its average
 * placement still matches what the feet said. Genuine sway survives; the
 * snapping does not.
 */
function addCycleAnchors(frames) {
  const byRow = new Map();
  for (const frame of frames) {
    if (!byRow.has(frame.row)) byRow.set(frame.row, []);
    byRow.get(frame.row).push(frame);
  }

  /** Largest leftover misalignment worth cancelling, in source pixels. */
  const MAX_SHIFT = 70;

  for (const row of byRow.values()) {
    // default: same as feet, so a row this cannot handle degrades gracefully
    for (const frame of row) frame.anchors.cycle = { ...frame.anchors.feet };
    if (row.length < 2 || row.some((f) => f.bodyMass === 0)) continue;

    // reference = the frame of median body mass, i.e. the least extreme pose
    const ordered = [...row].sort((a, b) => a.bodyMass - b.bodyMass);
    const reference = ordered[ordered.length >> 1];

    /*
     * `residual` is how far this frame's body sits from the reference's body
     * once both have been placed by their feet anchors. Adding back the gap
     * between the two anchors turns it into the body's true displacement from
     * the reference — and that is what the anchor must track for the character
     * to appear to hold still.
     *
     * Both axes get this. Vertically the lowest-dark-pixel rule is not merely
     * noisy but *inverted*: on a passing frame both feet are off the ground, so
     * the anchor rides up and the character is drawn lower — they dip exactly
     * where a walk cycle should rise. Cancelling that leaves a flat, ground-
     * locked walk, which is the right trade for a sprite this size.
     */
    const displacement = (axis) => {
      const profile = axis === 'x' ? 'bodyProfileX' : 'bodyProfileY';
      const shifts = row.map((frame) => {
        if (frame === reference) return 0;
        let best = 0;
        let bestScore = -Infinity;
        for (let r = -MAX_SHIFT; r <= MAX_SHIFT; r++) {
          let score = 0;
          for (let k = Math.max(0, -r); k < Math.min(PROFILE_SPAN, PROFILE_SPAN - r); k++) {
            score += reference[profile][k] * frame[profile][k + r];
          }
          // ties go to the smaller shift, so a flat correlation stays put
          if (score > bestScore || (score === bestScore && Math.abs(r) < Math.abs(best))) {
            bestScore = score;
            best = r;
          }
        }
        return best + (frame.anchors.feet[axis] - reference.anchors.feet[axis]);
      });

      // keep the row where the feet put it on average, only remove the snapping
      let sum = 0;
      row.forEach((frame, i) => {
        sum += frame.anchors.feet[axis] - shifts[i];
      });
      const base = sum / row.length;
      return shifts.map((shift) => Math.round(base + shift));
    };

    const xs = displacement('x');
    const ys = displacement('y');
    row.forEach((frame, i) => {
      frame.anchors.cycle = { x: xs[i], y: ys[i] };
    });
  }
}

/**
 * Bounding box plus the candidate anchors, because no single rule fits every
 * pose on these sheets:
 *
 *   feet   centre of the lowest dark pixels — boots and hair are the only near
 *          black areas, so an effect curling below the hem cannot drag the
 *          anchor sideways. Right for a one-shot pose that plants a foot:
 *          attacking, staggering, falling over.
 *   cycle  feet, but with the sideways snapping taken out by aligning the frames
 *          of the row to each other. Right for any looping in-place animation —
 *          see addCycleAnchors. Filled in later, once the whole row is known.
 *   ground bottom of the art, centred on its lowest slice. Right for the
 *          lying-down and dissolve frames, which have no feet under them.
 *   centre box centre. Right for the effect-only frames.
 */
function measureFrame({ img, alpha, labels, own, row, col, y0, y1, rules, sliceX0, sliceX1 }) {
  const { width, data } = img;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  const isDark = (s) => rules.isDark(data[s], data[s + 1], data[s + 2]);
  const isBody = (s) => rules.isBody(data[s], data[s + 1], data[s + 2]);

  let darkBottom = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!alpha[i] || !own.has(labels[i])) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (isDark(i * 4)) darkBottom = Math.max(darkBottom, y);
    }
  }
  if (maxX < 0) throw new Error(`frame r${row}c${col} came out empty`);

  const centreOfRows = (from, to, darkOnly) => {
    let sum = 0;
    let n = 0;
    for (let y = from; y <= to; y++) {
      for (let x = minX; x <= maxX; x++) {
        const i = y * width + x;
        if (!alpha[i] || !own.has(labels[i])) continue;
        if (darkOnly && !isDark(i * 4)) continue;
        sum += x;
        n++;
      }
    }
    return n ? Math.round(sum / n) : Math.round((minX + maxX) / 2);
  };

  const h = maxY - minY + 1;
  const feetY = darkBottom > 0 ? darkBottom : maxY;
  const anchors = {
    feet: { x: centreOfRows(Math.max(minY, feetY - 9), feetY, true), y: feetY },
    ground: {
      x: centreOfRows(maxY - Math.max(2, Math.round(h * 0.08)), maxY, false),
      y: maxY,
    },
    centre: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) },
    /** Middle of the frame's own cell — for effect frames that must not drift. */
    cell: {
      x: Math.round((sliceX0 + sliceX1) / 2),
      y: Math.round((minY + maxY) / 2),
    },
  };

  /*
   * Body occupancy profiles, one per axis, indexed **relative to the feet
   * anchor** rather than to the sheet. Two frames of one row sit ~220px apart on
   * the sheet, so profiles in sheet coordinates never overlap and correlating
   * them is meaningless; relative to their own anchors they line up, and the
   * correlation peak is exactly the leftover misalignment addCycleAnchors
   * needs to cancel.
   */
  const bodyProfileX = new Float64Array(PROFILE_SPAN);
  const bodyProfileY = new Float64Array(PROFILE_SPAN);
  let bodyMass = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * width + x;
      if (!alpha[i] || !own.has(labels[i]) || !isBody(i * 4)) continue;
      const kx = x - anchors.feet.x + PROFILE_ORIGIN;
      const ky = y - anchors.feet.y + PROFILE_ORIGIN;
      if (kx < 0 || kx >= PROFILE_SPAN || ky < 0 || ky >= PROFILE_SPAN) continue;
      bodyProfileX[kx]++;
      bodyProfileY[ky]++;
      bodyMass++;
    }
  }
  // normalise so correlation compares shape, not how much armour is on show
  if (bodyMass > 0) {
    for (let k = 0; k < PROFILE_SPAN; k++) {
      bodyProfileX[k] /= bodyMass;
      bodyProfileY[k] /= bodyMass;
    }
  }

  return {
    id: `r${row}c${col}`,
    row,
    col,
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h,
    own,
    anchors,
    // used by addCycleAnchors to align the frames of a loop to each other
    bodyProfileX,
    bodyProfileY,
    bodyMass,
  };
}

/* --------------------------------------------------------------- cut / scale */

/**
 * Copies one source frame into a `box * scale` sized surface with its anchor
 * landing on `at * scale`, then area-filters it back down to `box`.
 *
 * `scale` is a float on purpose. These sheets draw their character several times
 * larger than the game wants, and each sheet drew them at its own size. Both
 * corrections are one number: every row gets the downscale that lands it on the
 * same body height, so nothing is ever scaled *up* and no row keeps a
 * half-pixel offset.
 */
export function cutFrame(sheet, frame, box, at, options = {}) {
  const { mirror = false, anchor = 'feet', scale = 1 } = options;
  const { img, alpha, labels } = sheet;
  const src = frame.anchors[anchor];
  if (!src) throw new Error(`unknown anchor "${anchor}"`);

  const bigW = Math.round(box.w * scale);
  const bigH = Math.round(box.h * scale);
  const big = new Surface(bigW, bigH);
  const anchorX = at.x * scale;
  const ox = Math.round(anchorX - src.x);
  const oy = Math.round(at.y * scale - src.y);

  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const i = y * img.width + x;
      if (!alpha[i] || !frame.own.has(labels[i])) continue;
      const dx = mirror ? Math.round(anchorX * 2) - (x + ox) - 1 : x + ox;
      const s = i * 4;
      big.set(dx, y + oy, [img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3]]);
    }
  }

  return scale === 1 ? big : resample(big, box.w, box.h);
}

/**
 * Area-average resample onto an exact target size, weighting by fractional
 * pixel coverage. Colour is averaged with alpha as the weight (i.e. on
 * premultiplied values) so transparent pixels cannot bleed their colour into
 * the edges as a dark fringe.
 */
function resample(surface, width, height) {
  const out = new Surface(width, height);
  const sx = surface.width / width;
  const sy = surface.height / height;

  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let aw = 0; // alpha-weighted mass, for the colour average
      let cover = 0; // total sampled area, for the output alpha
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++) {
        const hy = Math.min(y1, py + 1) - Math.max(y0, py);
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          const w = hy * (Math.min(x1, px + 1) - Math.max(x0, px));
          const p = surface.get(px, py);
          const a = (p[3] / 255) * w;
          r += p[0] * a;
          g += p[1] * a;
          b += p[2] * a;
          aw += a;
          cover += w;
        }
      }
      if (aw === 0) continue;
      out.set(x, y, [
        Math.round(r / aw),
        Math.round(g / aw),
        Math.round(b / aw),
        Math.max(1, Math.min(255, Math.round((aw / cover) * 255))),
      ]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ report */

/** Extent of one frame around its anchor, already divided by the sheet scale. */
export function frameExtent(sheet, frame, anchor = 'feet') {
  const a = frame.anchors[anchor];
  const s = sheet.spec.scale;
  return {
    left: Math.ceil((a.x - frame.x) / s),
    right: Math.ceil((frame.x + frame.w - 1 - a.x) / s),
    up: Math.ceil((a.y - frame.y) / s),
    down: Math.ceil((frame.y + frame.h - 1 - a.y) / s),
  };
}

/** Flattens onto a checkerboard so transparent areas are visible in a viewer. */
export function checker(surface, box) {
  const out = new Surface(surface.width, surface.height);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const cellEdge = x % box.w === 0 || y % box.h === 0;
      const base = cellEdge ? 200 : ((x >> 3) + (y >> 3)) % 2 ? 64 : 104;
      const p = surface.get(x, y);
      const a = p[3] / 255;
      out.set(x, y, [
        Math.round(p[0] * a + base * (1 - a)),
        Math.round(p[1] * a + base * (1 - a)),
        Math.round(p[2] * a + base * (1 - a)),
        255,
      ]);
    }
  }
  return out;
}
