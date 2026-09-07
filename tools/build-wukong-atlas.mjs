// Builds the game-ready Wukong atlas out of his thirteen hand-made sheets.
//   node tools/build-wukong-atlas.mjs
//
// Source inventory, measured by tools/extract-wukong.mjs and checked against a
// zoomed dump (`npm run dump:wukong`) and a cut overlay (`npm run cuts:wukong`).
//
// The redraw laid most movement rows out as **two four-beat cycles per row**,
// read left to right and then top to bottom, so such a "row" is two clips. The
// two side gaits are the exception: each gets a whole eight-beat row.
//
//   idle-walk   r0 idle down  | idle up     r1 walk LEFT (whole row)
//               r2 walk down  | idle right  r3 walk up | idle left
//               r4 walk RIGHT (whole row)
//   run         r0 front | …   r1 back | …   r2-r6 side, drawn facing LEFT
//   attack1     three four-beat side swings, one per row — the side chain
//   attack2     six five-beat swings, front-on: 2 aimed down, 4 to the corners
//   attack3     six six-beat swings, the same aims drawn heavier
//   attack-quaylung  three whole swings with his back turned — the `up` chain
//   fly         r0 hover (7)  r1-r2 flight (4)  r3-r4 the long streak (3, 2)
//   hurt-death  r0-r2 hit -> knockdown (9, c8 FX only), r3 lying, r4 dissolve
//   skill1..4   one technique each, whole rows, finale included
//
// Three things worth knowing about this builder:
//
//  * The techniques are baked as whole rows rather than as a pose plus a bolted
//    on particle, because that is how they were drawn: the qi grows out of the
//    staff across the row, and cutting the effect off the body to re-composite
//    it at runtime would throw away exactly the continuity that makes them read.
//  * Every output file gets its own frame box, sized to the art it holds, and
//    each frame carries a normalised `anchor`. Phaser re-applies that pivot on
//    every animation frame, so a small idle frame and a dragon four times its
//    width still stand on the same spot.
//  * Facing left reuses the right-hand art through `flipX` at runtime only
//    where the artist did not draw it. On this sheet he mostly did — all four
//    idle facings and all four walk facings are real art — so mirroring is down
//    to the run rows, which were drawn facing left and are flipped once here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWebP } from './image-io.mjs';
import { packFrames } from './atlas-pack.mjs';
import { frameScale } from './sheet-frames.mjs';
import { SHEET_DIR, SHEETS, analyseSheet, cutFrame, frameExtent } from './extract-wukong.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Output lives in its own directory, NOT next to the sheets — the source sheets
 * are already named `wukong-idle-walk.png`, `wukong-attack.png`, … so writing
 * per-action sheets beside them would silently overwrite the hand-made art.
 * `assertNotSource` below is the belt to this braces.
 */
const OUT_DIR = join(ROOT, 'public', 'assets', 'characters', 'wukong', 'atlas');

const SOURCE_FILES = new Set(Object.values(SHEETS).map((s) => join(SHEET_DIR, s.file)));

function assertNotSource(path) {
  if (SOURCE_FILES.has(resolve(path))) {
    throw new Error(`refusing to overwrite the source sheet ${path}`);
  }
  return path;
}

/** Breathing room around the art inside each frame box. */
const PAD = 3;

const range = (row, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `r${row}c${from + i}`);

/**
 * Baked clips.
 *
 * `anchor` picks which of the anchors the extractor measured (feet / cycle /
 * ground / centre / strip) the clip stands on; `feet` by default. Looping
 * in-place animations use `cycle`, whole drawn rows use `strip`, and anything
 * without feet in it uses `ground`.
 */
const CLIPS = [
  /*
   * Idle and walk. Every facing is real art — the artist drew left as well as
   * right — so nothing here is mirrored. The front and back facings are
   * four-beat cycles packed two to a row; the two side walks each own a whole
   * eight-beat row (r1 left, r4 right). Nothing is in a tidy order: the layout
   * below is simply where each pose sits on the sheet.
   */
  /*
   * r0 does not split down the middle. Read by the head: c0-c2 face the
   * camera (two lit eyes), c3-c4 are drawn from behind (no face at all), and
   * c5-c7 are three-quarter turns to the right. Splitting it 4+4 put the
   * first back-facing pose inside the front idle, so standing still flashed
   * the back of his head once a cycle. The three-quarter poses have no clean
   * home — the true side idles are r2/r3 — so they stay unbaked.
   */
  { name: 'idle_down', sheet: 'idle', frames: range(0, 0, 2), anchor: 'cycle' },
  { name: 'idle_up', sheet: 'idle', frames: range(0, 3, 4), anchor: 'cycle' },
  /*
   * The side idle is r0's last three cells — the three-quarter turns that
   * close the row — and only the right-facing set is baked: left is the same
   * art mirrored at runtime, the way the sprint and the other kits do it.
   *
   * r2/r3's right halves hold a second, fuller side stance. It is not what
   * ships: the row-0 turns are the ones drawn to sit under the front and back
   * idles, so they are what the idle reads as.
   */
  { name: 'idle_right', sheet: 'idle', frames: range(0, 5, 7), anchor: 'cycle' },

  { name: 'walk_down', sheet: 'idle', frames: range(2, 0, 3), anchor: 'cycle' },
  { name: 'walk_up', sheet: 'idle', frames: range(3, 0, 3), anchor: 'cycle' },

  /*
   * The side gait gets a whole row per facing, unlike the front and back which
   * share theirs: r1 walks left, r4 walks right. Both are real art — the
   * artist drew each side — so the walk never mirrors.
   *
   * Only the last six cells of each row are the cycle — r1 c2-7 of eight,
   * r4 c3-8 of nine. The cells before them are lead-in poses the artist drew
   * ahead of the loop, and playing them reads as a stumble on the first step.
   *
   * These two rows used to be read as side *idles*, which left the walk
   * playing the standing poses from r2/r3 and left r4 unbaked entirely. The
   * standing side art is what r2/r3's right halves actually hold, and that is
   * where `idle_right` / `idle_left` now point.
   *
   * `wukong-walk.png` holds a later redraw of the same gait and is still on
   * disk, but it is not what ships: these are the frames the sheet was laid
   * out with, and they sit on the idle sheet's scale, which is the one every
   * other movement clip is measured against.
   */
  { name: 'walk_right', sheet: 'idle', frames: range(4, 3, 8), anchor: 'cycle' },
  { name: 'walk_left', sheet: 'idle', frames: range(1, 2, 7), anchor: 'cycle' },

  /*
   * Run. Fourteen cycles were drawn at rising leans; three are baked. The side
   * rows all face left, so `run_side` is mirrored once here into the
   * right-facing art the rest of the codebase assumes.
   */
  { name: 'run_down', sheet: 'run', frames: range(0, 0, 3), anchor: 'cycle' },
  { name: 'run_up', sheet: 'run', frames: range(1, 0, 3), anchor: 'cycle' },
  { name: 'run_side', sheet: 'run', frames: range(2, 0, 3), anchor: 'cycle', mirror: true },

  /*
   * Cửu Chuyển Côn Pháp, the three-hit staff chain. Four beats a swing:
   * wind-up, strike with the qi crescent drawn into the pose, follow-through,
   * recovery.
   *
   * Every one of the eight headings has its own drawn swing, which no other kit
   * in the roster gets: `attack1` draws the flat side chain as three separate
   * hits, and `attack2`/`attack3` draw the other six aims twice each. So a combo
   * step shows the art of *that* step, in the direction it is actually aimed,
   * rather than replaying one swing per facing the way Huyết Lang does.
   *
   * Straight up was the last to get its own art: `attack-quaylung` draws three
   * back-turned swings, so that heading has a full chain like the side does.
   */
  /*
   * These anchor on `feet`, not `strip` like the techniques do.
   *
   * `strip` registers a whole row off one point so drawn movement survives —
   * right for a technique, whose finale cells hold no body to stand on. Every
   * cell of a swing does hold one, and pinning them to it matters: the artist
   * re-centres him in each cell, so under `strip` his boots wandered up to
   * 33px back from the anchor by the impact frame. The hit is resolved from
   * the anchor, so the circle sat a body-width in front of where the player
   * could see him swinging, and a mob he was standing next to fell in the gap.
   */
  { name: 'atk1_side', sheet: 'attack1', frames: range(0, 0, 3), anchor: 'cycle' },
  { name: 'atk2_side', sheet: 'attack1', frames: range(1, 0, 3), anchor: 'cycle' },
  { name: 'atk3_side', sheet: 'attack1', frames: range(2, 0, 3), anchor: 'cycle' },

  /*
   * Everything the aim is not flat sideways, off `attack2` and `attack3`.
   *
   * Twelve swings between them, and they pair up: `attack2` draws each aim as a
   * five-beat swing, `attack3` redraws the same aim heavier, over six. So each
   * diagonal is a two-hit chain of its own, the second beat being the longer
   * one — which is what the third press of the combo lands on.
   *
   * The bodies are drawn as the aim needs them, not as the sheet is laid out:
   * `attack2` is front-on throughout, while on `attack3` the two swings that go
   * away from the camera (r0 straight up, r3 up-left) are drawn from behind and
   * the rest face front. Nothing is mirrored — the artist drew both the left
   * and the right of every diagonal.
   */
  { name: 'atk1_down', sheet: 'attack2', frames: range(0, 0, 4), anchor: 'cycle' },
  { name: 'atk2_down', sheet: 'attack2', frames: range(1, 0, 4), anchor: 'cycle' },
  { name: 'atk3_down', sheet: 'attack3', frames: range(1, 0, 5), anchor: 'cycle' },

  /*
   * Straight up, back to the camera, and the whole chain is real art: he opens
   * from a standing guard, spins into a ground slam, then lunges — the same
   * three beats the side chain has, which is what makes the two read as one
   * move set seen from two angles.
   *
   * `attack3` r0 drew this heading once, over six beats, and is no longer baked:
   * these three say the same thing better, and repeating one swing for a chain
   * that has three is exactly what this sheet was drawn to stop.
   */
  { name: 'atk1_up', sheet: 'attackBack', frames: range(0, 0, 4), anchor: 'cycle' },
  { name: 'atk2_up', sheet: 'attackBack', frames: range(1, 0, 4), anchor: 'cycle' },
  { name: 'atk3_up', sheet: 'attackBack', frames: range(2, 0, 3), anchor: 'cycle' },

  { name: 'atk1_upright', sheet: 'attack2', frames: range(2, 0, 4), anchor: 'cycle' },
  { name: 'atk2_upright', sheet: 'attack3', frames: range(2, 0, 5), anchor: 'cycle' },
  { name: 'atk1_upleft', sheet: 'attack2', frames: range(4, 0, 4), anchor: 'cycle' },
  { name: 'atk2_upleft', sheet: 'attack3', frames: range(3, 0, 5), anchor: 'cycle' },
  { name: 'atk1_downright', sheet: 'attack2', frames: range(3, 0, 4), anchor: 'cycle' },
  { name: 'atk2_downright', sheet: 'attack3', frames: range(4, 0, 5), anchor: 'cycle' },
  { name: 'atk1_downleft', sheet: 'attack2', frames: range(5, 0, 4), anchor: 'cycle' },
  { name: 'atk2_downleft', sheet: 'attack3', frames: range(5, 0, 5), anchor: 'cycle' },

  /*
   * The four techniques, one sheet each, every row taken whole.
   *
   * This is the point of the character. Each is a single escalation: qi gathers
   * at his feet, climbs the staff, and breaks. The last cell is not an effect
   * that accompanies the cast, it is the frame the cast arrives at, so it plays
   * inside the same clip as the beats before it. Where a technique wraps onto a
   * second row, the two rows are one sequence read top to bottom.
   */
  /*
   * Cửu U Nộ Diễm, four drawn facings and one flame.
   *
   * Every facing is real art now — `wukong-skill1` head-on, `-traiphai` across —
   * so nothing here is mirrored. `cast_nova_left` reads its row backwards,
   * because that row is laid out right to left; its first beat is the last cell.
   *
   * The flame is baked once, not four times, and that is not a shortcut: the
   * lotus and the eruption are drawn head-on in every one of the four rows, the
   * same picture whichever way he threw them. Only the body knows a direction.
   * Its cells come off the head-on sheet, where the flame spreads widest.
   *
   * `feet` for the bodies so he stays planted through the thrust; `ground` for
   * the flame, whose bottom is the floor it opens out of.
   */
  { name: 'cast_nova_down', sheet: 'skill1', frames: range(0, 0, 5), anchor: 'feet' },
  { name: 'cast_nova_up', sheet: 'skill1Back', frames: range(0, 0, 4), anchor: 'feet' },
  { name: 'cast_nova_right', sheet: 'skill1Side', frames: range(0, 0, 5), anchor: 'feet' },
  /*
   * The left cast is the right row mirrored, even though a left-facing row was
   * drawn, and this is not a shortcut either.
   *
   * `-traiphai` r1 is that row, and its six body cells are drawn at falling
   * sizes: read in the order the story needs (last cell first, since the row is
   * laid out right to left) he starts a head bigger than he is anywhere else in
   * the game and ends a third smaller. Nothing in the pipeline does that — the
   * sprite holds scale 1.00 for every frame of the cast, measured in game — it
   * is in the cells. Played back it reads as the character being zoomed out of.
   *
   * The other three facings are all even, r0 included, so mirroring r0 gives a
   * left cast that matches them. r1 goes back to being usable the moment its
   * six poses are drawn at one size.
   */
  {
    name: 'cast_nova_left',
    sheet: 'skill1Side',
    frames: range(0, 0, 5),
    anchor: 'feet',
    mirror: true,
  },
  {
    name: 'fx_nova',
    sheet: 'skill1Back',
    frames: [...range(0, 5, 8), 'r1c4'],
    anchor: 'ground',
  },  /*
   * Hàng Ma Chân Lôi, one whole row per aim, across two sheets.
   *
   * Neither sheet throws anything: the orbs circle him and the beam grows off
   * the staff, so a row is the whole technique and there is nothing to spawn.
   *
   * `quaylung` holds the four aims where you see him head-on — straight down,
   * straight up, and one diagonal of each — with the two diagonals drawn to the
   * right and mirrored for the left. `traiphai` holds the flat side, and both
   * of its rows are drawn facing right: one ships as the right-hand cast, the
   * other is mirrored here into the left-hand one.
   *
   * The last drawn cell of every row is dropped: it is him settling after the
   * orbs go out, and a technique's clip has to *end* on the moment it arrives,
   * because `recovery` parks the sprite on the final frame for another 450ms.
   * Baked in, the burst flashes past in a fifteenth of a second and the cast
   * stands on the settle — which is how the last version came out invisible.
   *
   * `feet`, not `strip`. Strip registers a row against the sheet's first frame
   * and so assumes every row shares a baseline; these do not. Row 0 drives its
   * beam 50px into the ground below his boots, so its band bottom is not where
   * he stands, and reading the other rows off that offset hung him up to 112px
   * in the air. Dropping the settle cell is what makes `feet` usable: every
   * cell that is left has a body in it to find the boots of.
   */
  { name: 'cast_lance_down', sheet: 'skillLanceHead', frames: range(0, 0, 4), anchor: 'feet' },
  { name: 'cast_lance_up', sheet: 'skillLanceHead', frames: range(1, 0, 4), anchor: 'feet' },
  { name: 'cast_lance_side_down', sheet: 'skillLanceHead', frames: range(2, 0, 3), anchor: 'feet' },
  { name: 'cast_lance_side_up', sheet: 'skillLanceHead', frames: range(3, 0, 3), anchor: 'feet' },
  { name: 'cast_lance_right', sheet: 'skillLanceSide', frames: range(1, 0, 5), anchor: 'feet' },
  {
    name: 'cast_lance_left',
    sheet: 'skillLanceSide',
    frames: range(0, 0, 5),
    anchor: 'feet',
    mirror: true,
  },
  /*
   * The bolt the technique throws, off the first lance sheet — the only art on
   * this character that draws a beam actually travelling. Four cells of it
   * reaching three lengths, hung off the `muzzle` anchor: their left edge, which
   * is the end that came out of the staff. The scene spawns it at his staff tip
   * and rotates it to the aim, so one drawn beam serves all eight headings.
   */
  { name: 'fx_lance', sheet: 'skill2', frames: range(1, 1, 4), anchor: 'muzzle' },
  {
    name: 'cast_wrath',
    sheet: 'skill3',
    frames: [...range(0, 0, 3), ...range(1, 0, 2)],
    anchor: 'strip',
  },
  /*
   * Ma Nguyệt Trảm, one whole row per aim. `feet` rather than `strip`: these
   * four rows do not share a baseline either — r0 drives its crescent into the
   * ground well below his boots — and every cell here has a body in it to find
   * the boots of.
   */
  { name: 'cast_dragon_down', sheet: 'skill4', frames: range(0, 0, 5), anchor: 'feet' },
  { name: 'cast_dragon_up', sheet: 'skill4', frames: range(1, 0, 5), anchor: 'feet' },
  { name: 'cast_dragon_right', sheet: 'skill4', frames: range(2, 0, 3), anchor: 'feet' },
  {
    name: 'cast_dragon_left',
    sheet: 'skill4',
    frames: range(3, 0, 3),
    anchor: 'feet',
    mirror: true,
  },

  // --- Cân Đẩu Vân: the dash rides the cloud -----------------------------
  /*
   * Cân Đẩu Vân, and r0 is not one animation but two.
   *
   * Its first four cells hover facing the camera and its last three hover with
   * his back to it — the two head-on facings, drawn the same way the walk has a
   * front and a back. Read as a single seven-beat loop it turned him front to
   * back and round again every 390ms, which is a spin, not a hover. Split, it is
   * what it was drawn as: flying towards you, and flying away.
   *
   * The side is r1, not r2. Both are four beats of him riding, but r2 is a climb
   * drawn at rising angles, so its frames disagree about where he is by 26px;
   * r1 is level and steady.
   *
   * `cycle` rather than `ground` for all three: `ground` hangs a frame off the
   * middle of its lowest slice, which here is the bottom of a boiling cloud.
   * `cycle` aligns the frames of a row to each other, so it tracks the man and
   * lets the cloud boil around him.
   */
  { name: 'fly_down', sheet: 'fly', frames: range(0, 0, 3), anchor: 'cycle' },
  { name: 'fly_up', sheet: 'fly', frames: range(0, 4, 6), anchor: 'cycle' },
  /*
   * The side of Cân Đẩu Vân is one speed ladder, and it all comes off
   * `fly-fast`: twelve beats of a single acceleration, from a short flame to
   * little more than a beam. Cut into three gears at the two places the drawing
   * changes character — the trail leaving his own length, and the sheet moving
   * to its second row.
   *
   * Taking all three from one sheet is the point. `cycle` aligns the frames of a
   * row to each other but knows nothing of other rows or other sheets, so a gear
   * borrowed from `fly` sat 18px to the side of these and popped across on every
   * change of gear. Within this sheet the three agree to within 6px.
   *
   * Drawn facing LEFT, so mirrored once here into the right-facing art the rest
   * of the codebase assumes. `fly` rows 1-4 held the earlier version of this
   * ladder and are no longer baked.
   */
  { name: 'fly_side', sheet: 'flyFast', frames: range(0, 0, 2), anchor: 'cycle', mirror: true },
  { name: 'fly_rush', sheet: 'flyFast', frames: range(0, 3, 6), anchor: 'cycle', mirror: true },
  { name: 'fly_streak', sheet: 'flyFast', frames: range(1, 0, 4), anchor: 'cycle', mirror: true },

  /*
   * Hurt and death. The one sheet the redraw did not replace, so he is wearing
   * the older costume for these two clips — see the note in the README. Baked
   * anyway: a character who cannot be staggered or killed is worse than one who
   * changes coat while it happens.
   */
  { name: 'hurt', sheet: 'hurt', frames: range(0, 0, 4) },
  {
    name: 'death',
    sheet: 'hurt',
    frames: [...range(0, 5, 7), ...range(4, 0, 5)],
    anchor: 'ground',
  },

  /*
   * The one free-standing effect frame: a ground burst, hung off the base of
   * its glow so it can be dropped on a world point. It is the per-target hit
   * confirmation and, flattened, the scorch under a strike.
   *
   * There used to be several more. They are frames of the cast clips now.
   */
  { name: 'fx_burst', sheet: 'hurt', frames: ['r0c8'], anchor: 'ground' },
];

/** One output image per group; every clip inside a group shares its frame box. */
const FILES = [
  { file: 'wukong-idle.webp', match: /^idle_/ },
  { file: 'wukong-walk.webp', match: /^(walk|run)_/ },
  { file: 'wukong-attack.webp', match: /^atk\d_/ },
  /*
   * One file per technique. Every clip in a file shares one frame box, sized to
   * the widest art in it, and these four differ enormously — the dragon is four
   * times the width of the flame. Sharing a box would stamp the dragon's width
   * onto every frame of every other technique.
   */
  /*
   * Four facings share one file and so one frame box, which is right here: they
   * are the same man at the same size, and the widest of them sets a box the
   * others waste little of.
   */
  { file: 'wukong-skill-nova.webp', match: /^cast_nova_/ },
  { file: 'wukong-skill-lance.webp', match: /^cast_lance_/ },
  { file: 'wukong-skill-wrath.webp', match: /^cast_wrath$/ },
  { file: 'wukong-skill-dragon.webp', match: /^cast_dragon_/ },
  { file: 'wukong-fly.webp', match: /^fly_/ },
  { file: 'wukong-hurt.webp', match: /^(hurt|death)$/ },
  /*
   * The nova pillar gets its own file for the same reason the techniques do:
   * it is 230px of flame against the 150px hit burst that shares `fx_`, and one
   * box for both would pay the pillar's width on every burst the game spawns.
   * This rule has to sit above the generic `fx_` one to win.
   */
  { file: 'wukong-fx-nova.webp', match: /^fx_nova$/ },
  { file: 'wukong-fx-lance.webp', match: /^fx_lance$/ },
  // every other `fx_` shares a file; the lookahead keeps the pillar and the
  // bolt out of it, since a rule collecting a clip does not stop later rules
  // from doing so too
  { file: 'wukong-fx.webp', match: /^fx_(?!nova|lance)/ },
];

/* ------------------------------------------------------------------- build */

/**
 * Texture pixels per world unit.
 *
 * Everything else in this file measures in world units — a frame box, an
 * anchor, a reach — and the game draws a frame 1:1, so a character 115px tall
 * in the atlas is 115px tall in the world. That is tidy and it caps how sharp
 * he can ever be: the canvas now renders at device resolution, so a display at
 * ratio 1.25 asks for 144 physical pixels of him and the texture only holds
 * 115. The extra pixels have nothing to show.
 *
 * So the art is baked larger than the world and drawn back down: every sheet
 * scale is divided here, and the game multiplies every sprite scale by the
 * reciprocal (`WUKONG_ART_SCALE`). Nothing about the world changes — the same
 * character, the same size, the same hitbox — there is simply more texture
 * behind him.
 *
 * 1.5 and not 2, because the source sheets do not have 2: measured, the hand
 * drawn art holds about 175px of him against the 115 that shipped, which is
 * 1.52. Baking past what the source has would only enlarge blur.
 */
const ART_SCALE = 1.5;

const sheets = {};
for (const key of Object.keys(SHEETS)) sheets[key] = analyseSheet(key);

/*
 * Applied by replacing each sheet's spec with a copy: `frameExtent`, `boxFor`
 * and `cutFrame` all read the scale off the spec, so dividing it in one place
 * keeps the box, the anchors and the resample consistent. A copy rather than a
 * mutation because `SHEETS` is shared with the report and preview tools, which
 * measure the source and must keep seeing the source numbers.
 */
for (const sheet of Object.values(sheets)) {
  sheet.spec = {
    ...sheet.spec,
    scale: sheet.spec.scale / ART_SCALE,
    // `rowScale` is keyed by row index, not a list — the two sheets whose rows
    // disagree about size state it as an object.
    rowScale:
      sheet.spec.rowScale &&
      Object.fromEntries(
        Object.entries(sheet.spec.rowScale).map(([row, v]) => [row, v / ART_SCALE]),
      ),
  };
}

/**
 * Adds the `strip` anchor: the one a whole drawn row has to be played on.
 *
 * The other anchors all ask a question of the frame — where are the feet, where
 * is the lowest art, where is the centre. That is right for a pose, and wrong
 * for a row drawn as a fixed-camera animation. Two things break:
 *
 *  * The finale cells have no body in them. A pillar of qi has no feet, so
 *    `feet` falls back to the bottom of the art and the anchor jumps to
 *    wherever the glow happens to reach.
 *  * Even among the cells that do have a body, he is drawn *moving* — lunging
 *    forward across the row as the technique builds. Re-anchoring each frame on
 *    his feet cancels exactly that movement, pinning him in place while the
 *    effect slides around him.
 *
 * So the sheet is registered the way a filmstrip is: every frame anchors at the
 * same offset inside its own cell, taken from where his feet stand in the very
 * first frame of the sheet — not the first frame of each row, because a
 * technique that wraps onto a second row opens that row mid-escalation, with no
 * clean standing pose to measure.
 *
 * The offset is measured from each cell's **left edge**, not its centre. Cells
 * in a row are moments in time and nothing makes them the same width: Hàng Ma
 * Chân Lôi's last cell is four times as wide as its first, because the lance it
 * ends on is four times as long as the pose it starts from. Registering on
 * centres put the anchor halfway along that lance, so the beam came out of the
 * air behind him.
 */
function addStripAnchors(sheet) {
  const first = sheet.frames[0];
  if (!first) return;
  const firstRow = sheet.rows[0];
  const offsetX = first.anchors.feet.x - firstRow.cuts[0];
  const offsetY = first.anchors.feet.y - firstRow.y1;

  for (const info of sheet.rows) {
    for (const frame of sheet.frames) {
      if (frame.row !== info.row) continue;
      frame.anchors.strip = {
        x: Math.round(info.cuts[frame.col] + offsetX),
        y: Math.round(info.y1 + offsetY),
      };
    }
  }
}

for (const sheet of Object.values(sheets)) addStripAnchors(sheet);

const lookup = (clip, id) => {
  const frame = sheets[clip.sheet].frames.find((f) => f.id === id);
  if (!frame) throw new Error(`${clip.name}: source frame ${clip.sheet}/${id} not found`);
  return frame;
};

/** Smallest box that holds every frame of every clip in the group. */
function boxFor(clips) {
  let half = 0;
  let up = 0;
  let down = 0;
  for (const clip of clips) {
    for (const id of clip.frames) {
      const e = frameExtent(sheets[clip.sheet], lookup(clip, id), clip.anchor ?? 'feet');
      half = Math.max(half, e.left, e.right); // mirroring needs both sides
      up = Math.max(up, e.up);
      down = Math.max(down, e.down);
    }
  }
  const even = (n) => n + (n % 2);
  const frame = { w: even(2 * (half + PAD)), h: even(up + down + 2 * PAD) };
  return { frame, at: { x: frame.w / 2, y: up + PAD } };
}

mkdirSync(OUT_DIR, { recursive: true });

const textures = [];
const manifest = [];

for (const spec of FILES) {
  const clips = CLIPS.filter((c) => spec.match.test(c.name));
  if (clips.length === 0) throw new Error(`${spec.file} matched no clips`);

  const { frame: FRAME, at: AT } = boxFor(clips);
  const entries = [];

  clips.forEach((clip) => {
    clip.frames.forEach((id, col) => {
      const sheet = sheets[clip.sheet];
      entries.push({
        name: `${clip.name}_${col}`,
        surface: cutFrame(sheet, lookup(clip, id), FRAME, AT, {
          anchor: clip.anchor ?? 'feet',
          mirror: clip.mirror ?? false,
          scale: frameScale(sheet, lookup(clip, id)),
        }),
        // normalised pivot inside the untrimmed box — Phaser turns this into
        // the sprite's origin, and trimming does not move it
        anchor: { x: AT.x / FRAME.w, y: AT.y / FRAME.h },
      });
    });
    manifest.push({ clip: clip.name, count: clip.frames.length, file: spec.file });
  });

  const { surface, frames } = packFrames(entries);

  writeFileSync(assertNotSource(join(OUT_DIR, spec.file)), await encodeWebP(surface));
  textures.push({
    image: spec.file,
    format: 'RGBA8888',
    size: { w: surface.width, h: surface.height },
    scale: 1,
    frames,
  });
  console.log(
    `${spec.file.padEnd(26)} ${String(surface.width).padStart(5)}x${String(surface.height).padEnd(5)}` +
      ` box ${FRAME.w}x${FRAME.h} anchor ${AT.x},${AT.y}  ${frames.length} frames` +
      `  [${clips.map((c) => c.name).join(', ')}]`,
  );
}

const atlas = {
  textures,
  meta: {
    app: 'thien-menh-nghich-do/tools/build-wukong-atlas.mjs',
    version: '2.0',
    source: 'wukong-{idle-walk,run,attack1..3,fly,fly-fast,hurt-death,skill1..4}.png',
    note: 'per-file frame boxes; each frame carries a normalised anchor (feet/cycle, strip for whole drawn rows, ground for effects)',
  },
};
writeFileSync(assertNotSource(join(OUT_DIR, 'wukong.json')), JSON.stringify(atlas, null, 2));

const total = textures.reduce((sum, t) => sum + t.size.w * t.size.h, 0);
console.log(`\nwukong.json          ${textures.length} textures, ${manifest.length} clips`);
console.log(`texture budget       ${(total / 1e6).toFixed(2)} Mpx  (~${((total * 4) / 1e6).toFixed(0)} MB VRAM)`);
