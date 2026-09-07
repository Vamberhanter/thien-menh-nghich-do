// Wukong's six hand-made sheets: inventory, colour rules and CLI.
//
//   node tools/extract-wukong.mjs --report          # frame counts per row
//   node tools/extract-wukong.mjs --measure [px]    # feet-to-shoulder ruler
//   node tools/extract-wukong.mjs --dump <dir>      # every frame + row strips
//   node tools/extract-wukong.mjs --preview <dir>   # cut lines + anchors
//
// The segmentation is the shared engine in `sheet-frames.mjs`, the same one Như
// Yên, Huyết Lang and the boss use. Three things are specific to this
// character:
//
//  * The sheets already ship alpha (no black canvas to knock out, unlike Huyết
//    Lang's), but nothing on them is fully opaque — the art tops out at alpha
//    254 — so the engine's ALPHA_FLOOR is doing all the work of separating the
//    art from its own soft fringe.
//  * The cloak streams a full frame-height above and behind him, so rows touch
//    and no gap search can find them. Every sheet therefore states its row
//    bands outright (`rows`), measured off the alpha row profile. That also
//    lets the idle sheet ignore its opening band of five oversized hero poses,
//    which are portrait art rather than animation frames.
//  * He is drawn almost entirely in near-black with a red/violet rim. The
//    colour rules below are luminance bands rather than hue tests, because
//    hue-wise the armour, the cloak and the qi are the same magenta family.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Surface } from './pixel.mjs';
import { decodePNG } from './png-decode.mjs';
import {
  ALPHA_FLOOR,
  analyseSheet as analyseSheetFrames,
  axisCuts,
  checker,
  cutFrame,
  frameExtent,
} from './sheet-frames.mjs';

export { cutFrame, frameExtent };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SHEET_DIR = join(ROOT, 'public', 'assets', 'characters', 'wukong', 'source');

/**
 * Inventory of the six sheets, checked by eye against a zoomed dump.
 *
 * `rows`  measured [y0, y1] band of every row that is used, in source pixels.
 * `cols`  frame count of each of those rows — the segmentation is told the
 *         answer and only has to find the cut lines.
 * `cut`   'even' tiles the row into equal cells instead of searching for the
 *         emptiest line — right for a sheet laid out on a machine grid, where
 *         the search drifts towards whichever side of a cell is emptier.
 * `cuts`  per-row column lines, stated outright. The last resort, used by the
 *         two sheets whose effects sweep bodily through the neighbouring pose:
 *         there is no empty line to find and no pitch to lock onto, so the
 *         boundaries were read off a ruler overlay (`--preview`).
 * `drop`  discards owned components under this share of the cell's biggest, to
 *         sweep up the fragment a `cuts` line severs off a crescent's tail.
 * `scale` downscale that lands this sheet's art on the shared body height.
 *         Each sheet drew him at its own size; measuring feet-to-shoulder on
 *         the upright poses (`--measure`) is what puts them all on one ruler.
 * `rowScale` per-row override of it, for the two sheets whose own rows disagree
 *         about how big he is. One number per sheet is the rule because a sheet
 *         is one sitting; `attack2` and `attack3` broke it.
 */
export const SHEETS = {
  /**
   * Five rows of eight: three standing facings and two gaits. The redraw put
   * every facing on the same eight-beat cycle, so unlike the first sheet there
   * is no row that has to be stretched or trimmed to match its neighbours.
   */
  idle: {
    file: 'wukong-idle-walk.png',
    rows: [
      [10, 201],
      [219, 388],
      [412, 581],
      [591, 772],
      [789, 976],
    ],
    // Not a uniform grid: the first two rows hold eight poses, the last three
    // hold nine. Declaring eight everywhere forced the cutter to fold two
    // neighbouring poses into one cell, which then flickered a second body
    // behind the character every time that frame came round.
    cols: [8, 8, 9, 9, 9],
    scale: 1.52,
    note: 'r0 idle down|up, r1 walk LEFT, r2 walk down|idle right, r3 walk up|idle left, r4 walk RIGHT',
  },
  /*
   * `wukong-walk.png` is a later redraw of the side gait. It is deliberately
   * NOT in this inventory: the side walk ships from `idle-walk` r2/r3, where
   * it was laid out alongside the front and back on one scale. The file stays
   * on disk — putting it back is an entry here plus two clip lines in the
   * builder.
   */
  /** Seven sprint rows; only three facings are baked — see the builder. */
  run: {
    file: 'wukong-run.png',
    rows: [
      [3, 164],
      [165, 321],
      [322, 452],
      [453, 578],
      [579, 727],
      [728, 858],
      [859, 1008],
    ],
    cols: [8, 8, 8, 8, 8, 8, 8],
    scale: 1.29,
    note: 'seven eight-beat sprints at rising leans; facings assigned in the builder',
  },
  /**
   * The basic chain, redrawn as three whole swings — one per row, four beats
   * each, all side-on. It is what the combo plays from now; the older
   * `attack` sheet below still supplies the head-on swings, which this sheet
   * does not draw.
   *
   * Cleanly separated: 25-60px of clear canvas at the tightest cut, so no
   * `cuts`. The 10px band at y405-414 holds two specks of stray glow between
   * rows and is deliberately outside every band, so `clipToRows` erases it.
   */
  attack1: {
    file: 'wukong-attack1.png',
    rows: [
      [58, 329],
      [423, 665],
      [729, 958],
    ],
    cols: [4, 4, 4],
    scale: 1.58,
    note: 'three side-on swings, four beats each — hits 1, 2 and 3 of the chain',
  },
  /**
   * The head-on halves of the chain, redrawn: every swing whose aim is not
   * flat sideways. Two sheets because there are twelve of them.
   *
   *  attack2  six rows of five, the body drawn front-on throughout — the
   *           downward family. r0 leaps and stabs straight down, r1 slams the
   *           ground, and r2-r5 fan the staff out to the four corners.
   *  attack3  six rows of six, back-on where the aim goes away from the
   *           camera — the upward family, same fan.
   *
   * Both cut themselves: the tightest gap between rows is 59px on attack2 and
   * 25px on attack3, and the columns fall apart on their own. attack2's rows 0
   * and 1 are the one pair that touch, so their shared boundary is the row
   * profile's minimum (four pixels of mass at y264) rather than clear canvas.
   */
  attack2: {
    file: 'wukong-attack2.png',
    rows: [
      [16, 262],
      [266, 465],
      [484, 613],
      [642, 749],
      [777, 883],
      [903, 1002],
    ],
    cols: [5, 5, 5, 5, 5, 5],
    // The two swings aimed straight down are drawn far larger than the four
    // aimed into the corners — r0's band is 246px tall against r5's 99 — so
    // this sheet needs a scale per row. Read by eye against `atk1_side_0` on a
    // shared ground line, which is the only ruler that has held up on this art.
    scale: 1.05,
    rowScale: { 0: 1.35, 1: 1.19, 3: 0.86, 4: 0.9, 5: 0.86 },
    note: 'front-on, aim down: r0 stab down, r1 ground slam, r2 up-right, r3 down-right, r4 up-left, r5 down-left',
  },
  attack3: {
    file: 'wukong-attack3.png',
    rows: [
      [11, 176],
      [199, 370],
      [401, 569],
      [590, 742],
      [780, 878],
      [902, 1005],
    ],
    cols: [6, 6, 6, 6, 6, 6],
    // Same story as attack2, milder: the two swings aimed down-left and
    // down-right are drawn about 6% smaller than the other four.
    scale: 1.12,
    rowScale: { 4: 0.87, 5: 0.87 },
    // r0 is no longer baked: `attack-quaylung` draws that heading three times
    // over, so the `up` chain comes off there instead of repeating this one.
    note: 'r0 up (back-on, unbaked), r1 down, r2 up-right, r3 up-left (back-on), r4 down-right, r5 down-left',
  },
  /**
   * The back-turned chain, drawn last and on its own sheet: three whole swings
   * with his back to the camera, which is the one aim `attack3` had a single
   * picture of. Five beats, five, then four — he opens from a standing guard,
   * spins into a ground slam, and lunges, the same shape the side chain has.
   *
   * Cuts itself: 46-57px of clear canvas at the tightest column, and the rows
   * are 16-22px apart.
   */
  attackBack: {
    file: 'wukong-attack-quaylung.png',
    rows: [
      [21, 282],
      [298, 598],
      [620, 830],
    ],
    cols: [5, 5, 4],
    // 1.5 first, which came out the tallest art in the kit: r0 and r1 stand more
    // upright than any other swing — no crouch, no lunge — so matching them to
    // the side chain by eye left them 11% over it once they were in motion.
    scale: 1.67,
    note: 'three back-on swings: r0 opener, r1 ground slam, r2 lunge',
  },
  /*
   * `wukong-attack.png` was the first swing sheet, and it is deliberately NOT
   * in this inventory any more. Its seven rows are the *older costume* — a
   * violet feathered cloak where the redraw wears crimson with a red scarf —
   * and the three sheets above now cover every facing it held. Keeping its two
   * head-on rows would have changed his coat on the frame he swings up or
   * down. The file stays on disk; putting it back is an entry here plus clip
   * lines in the builder.
   */
  /**
 * The fast half of Cân Đẩu Vân, drawn later and on its own sheet: twelve beats
 * of one acceleration, seven at speed and five flat out, ending on little more
 * than a beam. Drawn facing LEFT, like the side rows of `fly`, so the builder
 * mirrors it once into the right-facing art the rest of the codebase assumes.
 *
 * The column lines are stated because both rows shed sparks: detached specks of
 * beam 2-48px wide sit in the gaps, so a gap search counts eight islands in a
 * row of seven. The lines below put each spark with the frame it came off.
 */
  flyFast: {
    file: 'wukong-fly-fast.png',
    rows: [
      [111, 304],
      [448, 642],
    ],
    cols: [7, 5],
    cuts: {
      0: [0, 236, 518, 795, 1109, 1470, 1884, 2172],
      1: [0, 439, 875, 1341, 1798, 2172],
    },
    scale: 1.55,
    note: 'r0 seven beats at speed, r1 five flat out; drawn facing left',
  },
  /** Cân Đẩu Vân. Rows get shorter as the flight gets faster and longer. */
  fly: {
    file: 'wukong-fly.png',
    rows: [
      [14, 251],
      [272, 453],
      [474, 693],
      [707, 878],
      [879, 1013],
    ],
    cols: [7, 4, 4, 3, 2],
    scale: 1.55,
    note: 'r0 hover on the cloud, r1-r2 flight, r3-r4 the long streak',
  },
  /**
   * Hurt and death — the one sheet the redraw did NOT replace, so it still
   * holds the older costume. See the note in the builder.
   */
  hurt: {
    file: 'wukong-hurt-death.png',
    rows: [
      [12, 204],
      [205, 420],
      [421, 603],
      [604, 781],
      [782, 990],
    ],
    cols: [9, 9, 9, 7, 6],
    scale: 1.36,
    note: 'r0-r2 hit -> knockdown (c8 FX only), r3 lying still, r4 dissolve',
  },

  /*
   * The four techniques, one file each.
   *
   * These are the sheets the redraw was for. Every moment is its own island of
   * pixels with clear space around it, so the shared cutter finds the
   * boundaries on its own — no ruler-read `cuts`, no `drop` threshold, no seam
   * carving. All that is left to state is how many moments there are, which is
   * the one thing a picture cannot say for itself.
   *
   * Cell widths inside a row vary wildly on purpose — skill1's finale is 660px
   * against a 237px opening pose — and that is fine: the cutter needs gaps, not
   * a grid.
   */
  /*
   * Cửu U Nộ Diễm — three entries over two files, and the reason is scale.
   *
   * `scale` is per entry, and these rows disagree about how big he is: the
   * head-on cast is drawn at very nearly twice the size of the three others.
   * One entry per file would have to pick a side and get the rest wrong, so the
   * rows are grouped by the size they were drawn at rather than by the file they
   * live in. Nothing but `rows` and `scale` differ; entries may share a file.
   *
   * Column lines are stated throughout: the travelling flames touch, so a gap
   * search counts six islands in a row of nine.
   */
  /** Facing the camera. Six beats, the lotus opening at his own feet. */
  skill1: {
    file: 'wukong-skill1.png',
    rows: [[17, 306]],
    cols: [6],
    cuts: { 0: [0, 210, 424, 647, 891, 1135, 2172] },
    scale: 1.9,
    note: 'head-on cast',
  },
  /**
   * Facing away, read as one sequence across both rows. r1 is him and the flame
   * leaving; r2 carries it out to the eruption, and merges two moments into one
   * island twice over, so only its cells that hold a single picture are used.
   */
  skill1Back: {
    file: 'wukong-skill1.png',
    rows: [
      [339, 500],
      [502, 716],
    ],
    cols: [9, 6],
    cuts: {
      0: [0, 180, 372, 617, 850, 1087, 1306, 1470, 1738, 2172],
      1: [0, 236, 438, 858, 1500, 1895, 2172],
    },
    scale: 1.1,
    note: 'cast facing away; r1 body then flame, r2 the eruption',
  },
  /**
   * Across, drawn once per side rather than mirrored — and r1 is laid out
   * **right to left**: his first beat is the row's last cell. Reading it forwards
   * plays the eruption first and ends with him winding up.
   *
   * r2 is a draft and is not baked.
   *
   * r0 needs its own note: four travelling flames sit there, but three share one
   * island (1509-1931). The two quietest columns inside it, 1687 and 1823, are
   * the lines between them — found off the profile, not by eye.
   */
  skill1Side: {
    file: 'wukong-skill1-traiphai.png',
    rows: [
      [31, 255],
      [296, 480],
      [495, 688],
    ],
    cols: [11, 10, 7],
    cuts: {
      0: [0, 240, 451, 653, 889, 1120, 1325, 1509, 1687, 1823, 1931, 2172],
      1: [0, 253, 433, 641, 853, 1051, 1272, 1495, 1707, 1928, 2172],
    },
    scale: 1.25,
    note: 'r0 right; r1 left, read right-to-left; r2 a draft, unused',
  },
  /**
   * Hàng Ma Chân Lôi, redrawn a second time and split across two files by which
   * way he is turned. Nothing is thrown here either — the orbs circle him and
   * the beam grows off the staff — so every row is one whole technique.
   *
   * The head-on file holds four rows: straight down (front-on), straight up
   * (back-on), and one diagonal of each. Its third band is 445px tall because
   * the two diagonal rows overlap vertically; the quietest scanline between
   * them is y764, which is where the two bands below are cut.
   */
  skillLanceHead: {
    file: 'wukong-skillquaylung.png',
    rows: [
      [24, 299],
      [332, 525],
      [546, 763],
      [765, 991],
    ],
    cols: [6, 6, 5, 5],
    /*
     * One scale per row again, and this time measured on the **head**, not on
     * anchor-to-crown. Every one of these poses leans or leaps, which shortens
     * a stature reading while leaving the character exactly as big — by that
     * ruler all four rows looked like a match at 116 against the walking body's
     * 111, and on screen they were a fifth too large. The afro is the one part
     * that does not change with the pose.
     *
     * Measuring it turned out to be the hard part — every automatic ruler tried
     * here caught a lit effect instead — so these come off an A/B ladder: the
     * candidate re-sampled at a few factors beside the walking body on one
     * ground line, picking the rung that matches. Judging *which of two* is
     * bigger is something the eye does far better than reading a pixel count
     * off either.
     */
    scale: 1.37,
    rowScale: { 1: 1.23, 2: 1.19, 3: 1.31 },
    // r2 and r3 tuck his boots under a lit cloak with the beam driving past, so
    // the lowest-dark-pixel rule finds the effect instead of his feet — see
    // shiftAnchors(). Read off the crosshair overlay against cast_lance_right.
    rowAnchorShift: { 2: { x: -16, y: 0 }, 3: { x: -17, y: 0 } },
    note: 'r0 down (front), r1 up (back), r2 down-right (front), r3 up-right (back)',
  },
  /**
   * The sideways half, and both of its rows are drawn facing RIGHT — the file is
   * named for the two directions it serves, not for two directions it draws. So
   * one row ships as the right-hand cast and the other is mirrored once here
   * into the left, which is the only thing that tells them apart in play.
   */
  skillLanceSide: {
    file: 'wukong-skilltraiphai.png',
    rows: [
      [109, 336],
      [428, 644],
    ],
    cols: [7, 7],
    // Same A/B ladder against the walking body.
    scale: 1.37,
    rowScale: { 0: 1.29 },
    note: 'two takes of the flat side cast, both drawn facing right',
  },
  /**
   * The first Hàng Ma Chân Lôi sheet, back for one row and one reason.
   *
   * Its body art is superseded twice over, but nothing drawn since has a bolt
   * that *travels*: r1 c1-c4 are the beam alone, no body in them at all, growing
   * from a comet to a lance three times its own length and ending on an impact
   * star. That is what the technique throws down the lane, so those four cells
   * ship as `fx_lance` and the rest of the sheet stays unbaked.
   *
   * The column lines are stated because the beam welds the last three moments
   * into one island: a thread of core one pixel wide never dims along the axis,
   * so a gap search finds boundaries that are not there. Read off the ruler.
   */
  skill2: {
    file: 'wukong-skill2.png',
    rows: [
      [68, 387],
      [388, 754],
    ],
    cols: [4, 5],
    cuts: { 1: [0, 370, 580, 813, 1110, 1983] },
    scale: 1.9,
    note: 'only r1 c1-c4 ship — the travelling bolt',
  },
  /*
   * `wukong-skill-2.png` is on disk and not baked: it kept the orb on the staff
   * and drew every aim in one file, and the two sheets above replace it.
   */
  /*
   * The last two sheets are the ones where the effect dwarfs the man — a
   * demon's face and a qi dragon, both drawn several times his height. Their
   * `scale` used to be picked so the whole drawing came out a sensible size,
   * which is the wrong ruler: it shrank him along with the flame, so he cast
   * these two techniques at roughly 60% of the body he walks around in. The
   * scale is the body's now, measured off the opening pose, where the effect
   * has not started yet; the effect is then as large as it was drawn, which is
   * the point of it.
   */
  skill3: {
    file: 'wukong-skill3.png',
    rows: [
      [37, 396],
      [397, 988],
    ],
    cols: [4, 3],
    scale: 1.39,
    note: 'seven stages of demonic flame rising into a face',
  },
  /**
   * Ma Nguyệt Trảm, redrawn one row per aim — the second technique to get more
   * than one angle.
   *
   * r0 drives the crescent straight into the ground with him facing the camera;
   * r1 has his back turned and the dragon coiling overhead; r2 and r3 both send
   * it away to the right, so one of them is mirrored at bake time into the
   * left-hand cast, the same deal the lance's side sheet gets.
   *
   * Every cell holds a body and every row ends on its payoff — there is no fade
   * cell to drop here.
   */
  skill4: {
    file: 'wukong-skill4.png',
    rows: [
      [15, 334],
      [366, 568],
      [599, 784],
      [802, 998],
    ],
    cols: [6, 6, 4, 4],
    // A/B ladder against the walking body, then divided by this technique's
    // CAST_SCALE of 1.1 so what lands on screen is the size he walks around at.
    scale: 1.07,
    note: 'r0 down (front), r1 up (back), r2/r3 sideways — both drawn facing right',
  },
};

/**
 * Colour rules for this character.
 *
 * Both are luminance bands, not hue tests. Wukong is drawn in near-black with a
 * red/violet rim: sampling an idle frame, the twenty commonest colours all sit
 * under luminance 50 with the green channel at zero, and the cloak, the armour
 * and the qi are all the same magenta family. Hue cannot separate them; how
 * bright they are can.
 *
 * `isDark` is the boots and the unlit plate — what he stands on. The staff head
 * pools light on the floor beside him, so the ceiling has to stay well under
 * that or the anchor slides towards the glow.
 *
 * `isBody` is the armour and the shaded half of the cloak. The bright rim of
 * the cloak is excluded on purpose: it is the part that flutters hardest
 * between frames, exactly like Như Yên's hair, and letting it into the
 * silhouette drags a walk row's alignment around with it.
 */
/** Width of the alpha seam opened along a cut line or a row boundary. */
const SEAM = 2;

const RULES = {
  isDark: (r, g, b) => (r + g + b) / 3 < 40,
  isBody: (r, g, b) => {
    const lum = (r + g + b) / 3;
    return lum >= 6 && lum < 90;
  },
};

/**
 * Clears every scanline that no declared row band covers.
 *
 * Stating the bands is not enough on its own. The engine labels connected
 * components across the *whole* sheet before it cuts anything, and Wukong's
 * cloak leaves a fringe faint enough to look like a gap (alpha under 40) yet
 * solid enough to clear the engine's floor of 8. That fringe welds one row's
 * component to the next row's, and a component that straddles a band belongs to
 * neither — the frame it should have filled comes out empty.
 *
 * Erasing the between-band scanlines makes the separation real, so each row's
 * art is its own island. It is done before the analysis rather than by editing
 * the sheets, so the hand-made art on disk stays untouched.
 *
 * The bands were measured at the row profile's minima, so on five of the six
 * sheets this costs nothing but fringe. The skill sheet is the exception: its
 * techniques are drawn tall enough to genuinely overlap, and the quietest line
 * between two of its rows still carries real pixels. A few pixels off the top
 * of a flame is the price of every frame on that sheet existing at all.
 */
function clipToRows(img, rows) {
  const keep = new Uint8Array(img.height);
  for (const [y0, y1] of rows) {
    for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) keep[y] = 1;
  }

  /*
   * Bands that touch have to be prised apart as well.
   *
   * Where two rows are separated by empty canvas, clearing what is outside the
   * bands is enough. Where they are not — the sprint sheet has one gap in six,
   * because a cloak streaming off the top of one row lands in the row above it
   * — the bands are contiguous and there is nothing outside them to clear. The
   * component still spans both rows, still belongs to neither, and the frame it
   * should have filled still comes out empty.
   *
   * So the boundary itself is cleared: the last scanlines of each band, and the
   * first of the next. It severs whatever crosses, and the severed piece stays
   * with the row that holds most of it.
   */
  for (let r = 0; r + 1 < rows.length; r++) {
    if (rows[r + 1][0] - rows[r][1] > SEAM * 2) continue; // a real gap already
    for (let y = rows[r][1] - SEAM + 1; y <= rows[r][1] + SEAM; y++) {
      if (y >= 0 && y < img.height) keep[y] = 0;
    }
  }

  for (let y = 0; y < img.height; y++) {
    if (keep[y]) continue;
    const row = y * img.width;
    for (let x = 0; x < img.width; x++) img.data[(row + x) * 4 + 3] = 0;
  }
  return img;
}


/**
 * Opens a seam along every column cut, for the same reason `clipToRows` opens
 * one between the rows.
 *
 * Sideways it is worse than it is vertically: the cloak of one pose does not
 * merely graze its neighbour, it overlaps it. On the idle rows the last two
 * cells come back as a single connected component, and since the engine assigns
 * a component whole — to whichever cell holds most of it, deliberately, so a
 * trailing crescent is never blitted into two frames — the losing cell ends up
 * with nothing at all.
 *
 * The cut line is the truth about where one pose ends on sheets drawn this
 * tightly, so it is applied to the mask rather than only to the bookkeeping. The
 * cuts are found here with the engine's own `axisCuts`, so the seams land where
 * the engine is about to cut anyway; re-running it afterwards on the seamed
 * profile returns the same lines, now with real gaps at them.
 */
function seamColumns(img, spec) {
  const { width, data } = img;

  spec.rows.forEach(([y0, y1], row) => {
    const profile = new Int32Array(width);
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] >= ALPHA_FLOOR) profile[x]++;
      }
    }
    const count = spec.cols[row];
    const { cuts, method } = spec.cuts?.[row]
      ? { cuts: spec.cuts[row], method: 'given' }
      : spec.cut === 'even'
        ? { cuts: Array.from({ length: count + 1 }, (_, k) => Math.round((k * width) / count)), method: 'even' }
        : axisCuts(profile, width, count);

    /*
     * A row that already falls apart into the right number of pieces needs no
     * seam, and carving one into it does harm: the cut lines then come from a
     * grid search rather than from the art, and a 5px trench dropped through a
     * pose can leave the cell either side of it holding a sliver — or nothing.
     *
     * The redrawn sheets are almost all like this. Only the rows where two
     * moments genuinely touch get carved.
     */
    if (method === 'gaps') return;

    for (let k = 1; k < cuts.length - 1; k++) {
      for (let x = cuts[k] - SEAM; x <= cuts[k] + SEAM; x++) {
        if (x < 0 || x >= width) continue;
        for (let y = y0; y <= y1; y++) data[(y * width + x) * 4 + 3] = 0;
      }
    }
  });
  return img;
}

/**
 * Moves a whole row's anchors by a hand-read offset, in source pixels.
 *
 * Every anchor the engine measures asks the art a question, and `feet` asks the
 * one that matters most: where is the lowest *dark* pixel. That works because
 * this character's boots are the darkest thing he has — until a row draws them
 * tucked up under a lit cloak with a bright beam driving past them, and then
 * the lowest dark pixel is a fold of the effect and the anchor slides a hundred
 * pixels sideways.
 *
 * Two rows of the Hàng Ma Chân Lôi head-on sheet are drawn that way. There is no
 * rule that finds his feet in them because they are not visible, so the offset
 * is read off a crosshair overlay, the same way the scales are.
 */
function shiftAnchors(sheet) {
  const shifts = sheet.spec.rowAnchorShift;
  if (!shifts) return sheet;
  for (const frame of sheet.frames) {
    const d = shifts[frame.row];
    if (!d) continue;
    for (const anchor of Object.values(frame.anchors)) {
      anchor.x += d.x ?? 0;
      anchor.y += d.y ?? 0;
    }
  }
  return sheet;
}

const cache = new Map();

export function analyseSheet(key) {
  if (cache.has(key)) return cache.get(key);
  const spec = SHEETS[key];
  if (!spec) throw new Error(`unknown sheet "${key}"`);
  const img = seamColumns(clipToRows(decodePNG(join(SHEET_DIR, spec.file)), spec.rows), spec);
  const sheet = shiftAnchors(analyseSheetFrames({ dir: SHEET_DIR, key, spec, rules: RULES, img }));
  cache.set(key, sheet);
  return sheet;
}

/* ------------------------------------------------------------------ ruler */

/**
 * Feet-to-shoulder height of one frame, in source pixels.
 *
 * The shoulder line is the topmost row whose body is at least `share` of the
 * frame's widest body row. His hair and the cloak collar are above the
 * shoulders but far narrower than them, and the staff — the one piece whose
 * height swings wildly between poses — is thinner still, so this measures the
 * torso and ignores what is attached to it.
 */
export function shoulderHeight(sheet, frame, share = 0.62) {
  const { img, alpha, labels } = sheet;
  const { width, data } = img;
  const feetY = frame.anchors.feet.y;

  const widths = new Int32Array(frame.h);
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    let n = 0;
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const i = y * width + x;
      if (!alpha[i] || !frame.own.has(labels[i])) continue;
      const s = i * 4;
      if (RULES.isBody(data[s], data[s + 1], data[s + 2])) n++;
    }
    widths[y - frame.y] = n;
  }

  const widest = Math.max(...widths);
  if (widest === 0) return 0;
  const floor = widest * share;
  for (let k = 0; k < widths.length; k++) {
    if (widths[k] >= floor) return feetY - (frame.y + k);
  }
  return 0;
}

/* ------------------------------------------------------------------ report */

function report() {
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    console.log(`\n=== ${key}  ${SHEETS[key].file}  scale ${sheet.spec.scale}`);
    console.log(`    ${SHEETS[key].note}`);
    for (const info of sheet.rows) {
      const boxes = sheet.frames
        .filter((f) => f.row === info.row)
        .map((f) => {
          const e = frameExtent(sheet, f);
          return `c${f.col} ${e.left}<>${e.right} ^${e.up}v${e.down}`;
        })
        .join('  ');
      console.log(`  r${info.row} cut=${info.method.padEnd(4)} ${boxes}`);
    }
  }
  console.log('\n(extents are post-scale pixels around the feet anchor: left<>right ^up vdown)');
}

/** Prints feet-to-shoulder per frame — the ruler behind each sheet's `scale`. */
function measure(target) {
  console.log(`target shoulder height ${target}px\n`);
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const heights = sheet.frames.map((f) => shoulderHeight(sheet, f));
    const upright = heights.filter((h) => h > 0).sort((a, b) => a - b);
    const median = upright[upright.length >> 1] ?? 0;
    console.log(
      `${key.padEnd(7)} median ${String(median).padStart(4)}  want scale ${(median / target).toFixed(
        2,
      )}  have ${sheet.spec.scale}`,
    );
    for (const info of sheet.rows) {
      const list = sheet.frames
        .filter((f) => f.row === info.row)
        .map((f) => shoulderHeight(sheet, f))
        .join(' ');
      console.log(`   r${info.row} ${list}`);
    }
  }
  console.log('\nFX-only cells have no body, so their 0 is expected — scale those by eye');
}

/** Writes every frame and a per-row strip, for checking poses by eye. */
async function dump(dir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { encodePNG } = await import('./png.mjs');
  mkdirSync(dir, { recursive: true });

  const BOX = { w: 300, h: 300 };
  const AT = { x: 150, y: 250 };

  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const rows = sheet.spec.cols.length;
    const cols = Math.max(...sheet.spec.cols);
    const strip = new Surface(cols * BOX.w, rows * BOX.h);
    for (const frame of sheet.frames) {
      const cut = cutFrame(sheet, frame, BOX, AT, { scale: sheet.spec.scale });
      strip.blit(cut, frame.col * BOX.w, frame.row * BOX.h);
    }
    writeFileSync(join(dir, `${key}.png`), encodePNG(checker(strip, BOX)));
    console.log(`${key}.png  ${strip.width}x${strip.height}`);
  }
}

/**
 * Writes each whole sheet shrunk to fit a viewer, with the row bands, the
 * detected cut lines and the feet anchors drawn on. This is how you tell a bad
 * row band from a bad column cut: a band that clips a cloak shows up as art
 * outside its bracket, and a misplaced anchor as a cross off his boots.
 */
async function preview(dir) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { encodePNG } = await import('./png.mjs');
  mkdirSync(dir, { recursive: true });

  const WIDTH = 760;
  for (const key of Object.keys(SHEETS)) {
    const sheet = analyseSheet(key);
    const { img, alpha, labels } = sheet;
    const step = img.width / WIDTH;
    const height = Math.round(img.height / step);
    const out = new Surface(WIDTH, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const sx = Math.min(img.width - 1, Math.round(x * step));
        const sy = Math.min(img.height - 1, Math.round(y * step));
        const i = sy * img.width + sx;
        const base = ((x >> 3) + (y >> 3)) % 2 ? 64 : 104;
        if (!alpha[i] || !labels[i]) {
          out.set(x, y, [base, base, base, 255]);
          continue;
        }
        const s = i * 4;
        const a = img.data[s + 3] / 255;
        out.set(x, y, [
          Math.round(img.data[s] * a + base * (1 - a)),
          Math.round(img.data[s + 1] * a + base * (1 - a)),
          Math.round(img.data[s + 2] * a + base * (1 - a)),
          255,
        ]);
      }
    }

    const mark = (x, y, colour) => {
      if (x < 0 || x >= WIDTH || y < 0 || y >= height) return;
      out.set(x, y, colour);
    };
    for (const info of sheet.rows) {
      for (const cut of info.cuts) {
        const x = Math.min(WIDTH - 1, Math.round(cut / step));
        for (let y = Math.round(info.y0 / step); y <= Math.round(info.y1 / step); y++) {
          mark(x, y, [80, 200, 255, 255]);
        }
      }
      for (const edge of [info.y0, info.y1]) {
        const y = Math.round(edge / step);
        for (let x = 0; x < WIDTH; x++) mark(x, y, [255, 220, 60, 255]);
      }
    }
    for (const frame of sheet.frames) {
      const ax = Math.round(frame.anchors.feet.x / step);
      const ay = Math.round(frame.anchors.feet.y / step);
      for (let d = -7; d <= 7; d++) {
        mark(ax + d, ay, [255, 40, 40, 255]);
        mark(ax, ay + d, [255, 40, 40, 255]);
      }
    }

    writeFileSync(join(dir, `${key}.png`), encodePNG(out));
    console.log(`${key}.png  ${out.width}x${out.height}`);
  }
}

// CLI only — the atlas builder imports this module and must stay quiet.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--report')) report();
  const measureIndex = process.argv.indexOf('--measure');
  if (measureIndex >= 0) measure(Number(process.argv[measureIndex + 1]) || 112);
  const dumpIndex = process.argv.indexOf('--dump');
  if (dumpIndex >= 0) await dump(process.argv[dumpIndex + 1] ?? '.tmp/wukong-frames');
  const previewIndex = process.argv.indexOf('--preview');
  if (previewIndex >= 0) await preview(process.argv[previewIndex + 1] ?? '.tmp/wukong-preview');
  if (process.argv.length <= 2) {
    console.log(`sheets in ${SHEET_DIR}:`);
    for (const f of readdirSync(SHEET_DIR)) console.log(`  ${f}`);
    console.log('\nrun with --report, --measure [px], --dump <dir> or --preview <dir>');
  }
}
