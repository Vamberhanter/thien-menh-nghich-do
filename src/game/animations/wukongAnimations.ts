import Phaser from 'phaser';
import { remoteAtlas } from '../../net/assets';
import type { Direction, Vector2Like } from '../types';

/**
 * Texture key + asset locations for Tôn Ngộ Không.
 *
 * The art comes from thirteen hand-made sheets in
 * `public/assets/characters/wukong/source/`, cut into clips by
 * `npm run build:wukong`. The build writes into an `atlas/` subfolder so it can
 * never overwrite the sheets it read.
 *
 * Geometry follows Như Yên and Huyết Lang: frames are **not** all the same size
 * — 156x138 for an idle breath, 606x188 for the lance — and every frame carries
 * a normalised pivot on the point he stands on. Phaser re-applies that pivot per
 * animation frame, so the sprite's (x, y) IS his standing point, which also
 * makes it the depth-sort key.
 *
 * Two things set this kit apart:
 *
 *  * **Nothing is composed at runtime.** Each of his four techniques is one
 *    whole drawn row played left to right: the qi gathers at his feet, climbs
 *    the staff and breaks — into a pillar, a lance, a demon's face, a dragon.
 *    The finale is the frame the movement arrives at, not an effect laid over
 *    it, so it plays inside the same clip as the beats before it. That is why
 *    `WukongEffects` is a fraction of the size of the other two FX modules.
 *  * **Almost nothing is mirrored.** The artist drew all four idle facings, all
 *    four walk facings and both the left and the right of every diagonal swing
 *    as real art, so `flipX` is down to the sprint, the flat side chain and the
 *    techniques — the three whose side art was drawn once.
 *  * **He swings where he is aimed, not where he faces.** `Direction` stays
 *    four-way because the movement art is, but three sheets of swings cover all
 *    eight headings, so the attack clip is picked off the aim vector.
 */
export const WUKONG_TEXTURE = 'wukong';

/**
 * Texture pixels per world unit in this atlas.
 *
 * The art is baked larger than the world it is drawn into (see ART_SCALE in
 * `build-wukong-atlas.mjs`) and every sprite made from it is scaled back down
 * by this, so the world is unchanged and there is simply more texture behind
 * him. The canvas renders at device resolution now, and without this the
 * texture was the limit: a display asking for 144 physical pixels of the
 * character had only 115 to sample.
 *
 * Anything that spawns a sprite from this atlas has to divide by it. That is
 * the whole cost of the trick, and it is why the number lives here beside the
 * texture key rather than inside any one module.
 */
export const WUKONG_ART_SCALE = 1.5;
const wukongAtlas = remoteAtlas('characters/wukong/atlas/wukong.json', 'characters/wukong/atlas');
export const WUKONG_ATLAS_URL = wukongAtlas.url;
export const WUKONG_ATLAS_PATH = wukongAtlas.path;
export const WUKONG_ATLAS_LOCAL_URL = wukongAtlas.localUrl;
export const WUKONG_ATLAS_LOCAL_PATH = wukongAtlas.localPath;

/* ------------------------------------------------------------------- clips */

interface ClipSpec {
  /** Frame-name prefix in the atlas, e.g. `atk1_side` -> `atk1_side_0`. */
  clip: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

const CLIPS: readonly ClipSpec[] = [
  /*
   * Four beats per cycle throughout the movement sheets. Idle runs slow enough
   * to read as breathing; the cloak and the staff-glow are never still, so it
   * carries as much motion as another character's walk.
   */
  // The front idle is three drawn poses, the back only two — that is all the
  // sheet holds of each. Both run at 0.5s a cycle so the two facings breathe
  // at the same rate.
  { clip: 'idle_down', frames: 3, frameRate: 6, repeat: -1 },
  { clip: 'idle_up', frames: 2, frameRate: 4, repeat: -1 },
  // Drawn facing right, mirrored for left.
  { clip: 'idle_right', frames: 3, frameRate: 6, repeat: -1 },

  { clip: 'walk_down', frames: 4, frameRate: 9, repeat: -1 },
  { clip: 'walk_up', frames: 4, frameRate: 9, repeat: -1 },
  // The side gait is a six-beat cycle — the last six cells of its row, the
  // first two being lead-in poses. 8fps puts one cycle at 0.75s, the cadence
  // the other kits walk at, rather than stepping faster than the front walk.
  { clip: 'walk_right', frames: 6, frameRate: 8, repeat: -1 },
  { clip: 'walk_left', frames: 6, frameRate: 8, repeat: -1 },

  // the sprint rows: same four beats, much harder forward lean
  { clip: 'run_down', frames: 4, frameRate: 12, repeat: -1 },
  { clip: 'run_up', frames: 4, frameRate: 12, repeat: -1 },
  { clip: 'run_side', frames: 4, frameRate: 12, repeat: -1 },

  /*
   * Cửu Chuyển Côn Pháp: wind-up, strike with the qi crescent drawn into the
   * pose, follow-through, recovery.
   *
   * Every one of the eight headings has its own drawn swing — flat sideways and
   * straight up are three each, and the other six were drawn twice. The rates
   * differ so
   * that a swing takes the same time whatever it is aimed at: four beats at 13,
   * five at 15, six at 17 all land between 300 and 355ms, which is what keeps
   * the combo window from stretching when the player turns a corner.
   */
  { clip: 'atk1_side', frames: 4, frameRate: 13, repeat: 0 },
  { clip: 'atk2_side', frames: 4, frameRate: 13, repeat: 0 },
  { clip: 'atk3_side', frames: 4, frameRate: 13, repeat: 0 },

  { clip: 'atk1_down', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk2_down', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk3_down', frames: 6, frameRate: 17, repeat: 0 },
  { clip: 'atk1_up', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk2_up', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk3_up', frames: 4, frameRate: 13, repeat: 0 },

  { clip: 'atk1_upright', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk2_upright', frames: 6, frameRate: 17, repeat: 0 },
  { clip: 'atk1_upleft', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk2_upleft', frames: 6, frameRate: 17, repeat: 0 },
  { clip: 'atk1_downright', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk2_downright', frames: 6, frameRate: 17, repeat: 0 },
  { clip: 'atk1_downleft', frames: 5, frameRate: 15, repeat: 0 },
  { clip: 'atk2_downleft', frames: 6, frameRate: 17, repeat: 0 },

  // the four techniques, each one whole drawn sheet including its finale
  // Cửu U Nộ Diễm has four drawn facings and no mirroring: `wukong-skill1` holds
  // the two head-on casts, `-traiphai` the two across. The flame they throw is
  // not in any of them — it ships as `fx_nova` and is planted down the lane.
  { clip: 'cast_nova_down', frames: 6, frameRate: 12, repeat: 0 },
  { clip: 'cast_nova_up', frames: 5, frameRate: 11, repeat: 0 },
  { clip: 'cast_nova_right', frames: 6, frameRate: 12, repeat: 0 },
  { clip: 'cast_nova_left', frames: 6, frameRate: 12, repeat: 0 },
  // The flame itself, now an animation rather than a single frame: the lotus
  // opens, spreads, and breaks upward.
  { clip: 'fx_nova', frames: 5, frameRate: 14, repeat: 0 },
  /*
   * Hàng Ma Chân Lôi is the one technique with more than one drawn angle: six
   * whole rows across two sheets, one per aim. Nothing is thrown — the orbs
   * circle him and the beam grows off the staff — so unlike the version before
   * it there is no bolt clip to spawn alongside these.
   *
   * The rows are not the same length, so the rates differ to keep every angle
   * within 400-430ms of the others.
   */
  { clip: 'cast_lance_down', frames: 5, frameRate: 12, repeat: 0 },
  { clip: 'cast_lance_up', frames: 5, frameRate: 12, repeat: 0 },
  { clip: 'cast_lance_right', frames: 6, frameRate: 14, repeat: 0 },
  { clip: 'cast_lance_left', frames: 6, frameRate: 14, repeat: 0 },
  { clip: 'cast_lance_side_up', frames: 4, frameRate: 10, repeat: 0 },
  { clip: 'cast_lance_side_down', frames: 4, frameRate: 10, repeat: 0 },

  // The bolt the technique throws: four cells of it reaching three lengths.
  // 13fps puts it at 308ms, close enough to the casts' 400-430 that the beam is
  // still growing as the pose lands.
  { clip: 'fx_lance', frames: 4, frameRate: 13, repeat: 0 },
  { clip: 'cast_wrath', frames: 7, frameRate: 11, repeat: 0 },

  /*
   * Ma Nguyệt Trảm, the second technique drawn from more than one angle: four
   * rows, one per cardinal aim. The two side rows are shorter than the head-on
   * ones, so their rate is slower and every angle still runs 500ms.
   */
  { clip: 'cast_dragon_down', frames: 6, frameRate: 12, repeat: 0 },
  { clip: 'cast_dragon_up', frames: 6, frameRate: 12, repeat: 0 },
  { clip: 'cast_dragon_right', frames: 4, frameRate: 8, repeat: 0 },
  { clip: 'cast_dragon_left', frames: 4, frameRate: 8, repeat: 0 },

  // Cân Đẩu Vân — the cloud gathers under him, then carries him
  // Cân Đẩu Vân. Two head-on facings, then three side clips that are one speed
  // ladder: the trail lengthens and the rate climbs with it. All loop, because
  // a flight ends when the player says so.
  { clip: 'fly_down', frames: 4, frameRate: 10, repeat: -1 },
  { clip: 'fly_up', frames: 3, frameRate: 10, repeat: -1 },
  { clip: 'fly_side', frames: 3, frameRate: 12, repeat: -1 },
  { clip: 'fly_rush', frames: 4, frameRate: 15, repeat: -1 },
  { clip: 'fly_streak', frames: 5, frameRate: 18, repeat: -1 },

  { clip: 'hurt', frames: 5, frameRate: 18, repeat: 0 },
  { clip: 'death', frames: 9, frameRate: 7, repeat: 0 },
];

const PREFIX = 'wukong-';
const key = (clip: string) => `${PREFIX}${clip}`;

/** A clip plus whether it has to be mirrored to face the wanted way. */
export interface ClipRef {
  key: string;
  flip: boolean;
}

/** Atlas clip name behind an animation key, for looking up timing data. */
export const clipNameOf = (ref: ClipRef): string => ref.key.slice(PREFIX.length);

const spec = (clip: string): ClipSpec => {
  const found = CLIPS.find((c) => c.clip === clip);
  if (!found) throw new Error(`unknown Wukong clip "${clip}"`);
  return found;
};

/** Side art is baked facing right, so only `left` needs mirroring. */
const side = (clip: string, direction: Direction): ClipRef => ({
  key: key(clip),
  flip: direction === 'left',
});

/** Real art exists for this facing, so it is played as drawn. */
const drawn = (clip: string): ClipRef => ({ key: key(clip), flip: false });

/**
 * Which drawn swing a chain step shows.
 *
 * He swings where he is *aimed*, not where the sprite faces. `Direction` is
 * four-way because the movement art is, but three sheets of swings were drawn
 * — `attack1` flat sideways, `attack2` and `attack3` everything else — and
 * between them all eight headings have their own picture. So this reads the aim
 * vector, which is already eight-way (see `aimFromVector`), and only falls back
 * on the facing when there is no aim to read.
 *
 * Chains are as long as the art allows. Flat sideways, straight down and
 * straight up all have three separate swings — sideways and up were even drawn
 * to the same shape, so step 0 opens, step 1 spins into the ground slam, step 2
 * lunges, whichever way he is turned. The four corners have two; where a chain
 * runs short the last swing repeats rather than the first, so the third press is
 * always the heavier of the two.
 */
type Octant = 'down' | 'up' | 'side' | 'upleft' | 'upright' | 'downleft' | 'downright';

/**
 * Half-width of a diagonal octant as a unit-vector component: an aim counts as
 * diagonal once *both* axes clear sin(22.5°), which is exactly the 45° wedge
 * around each corner.
 */
const DIAGONAL = Math.sin(Math.PI / 8);

function octant(direction: Direction, aim?: Vector2Like): Octant {
  if (!aim) return direction === 'down' || direction === 'up' ? direction : 'side';
  const { x, y } = aim;
  if (Math.abs(x) > DIAGONAL && Math.abs(y) > DIAGONAL) {
    return `${y < 0 ? 'up' : 'down'}${x < 0 ? 'left' : 'right'}` as Octant;
  }
  if (Math.abs(x) > Math.abs(y)) return 'side';
  return y < 0 ? 'up' : 'down';
}

const CHAINS: Record<Octant, readonly string[]> = {
  side: ['atk1_side', 'atk2_side', 'atk3_side'],
  down: ['atk1_down', 'atk2_down', 'atk3_down'],
  up: ['atk1_up', 'atk2_up', 'atk3_up'],
  upright: ['atk1_upright', 'atk2_upright'],
  upleft: ['atk1_upleft', 'atk2_upleft'],
  downright: ['atk1_downright', 'atk2_downright'],
  downleft: ['atk1_downleft', 'atk2_downleft'],
};

const swing = (direction: Direction, step: number, aim?: Vector2Like): ClipRef => {
  const which = octant(direction, aim);
  const chain = CHAINS[which];
  const clip = chain[Math.min(step, chain.length - 1)];
  // Only the flat side chain is mirrored; the artist drew both the left and the
  // right of every diagonal, so those play as they were drawn.
  return which === 'side' ? side(clip, direction) : drawn(clip);
};

export const WukongClip = {
  /**
   * Front and back are drawn head-on. The side idle exists only facing right —
   * the three-quarter turns at the end of the idle row — so left is that same
   * clip mirrored, the way the sprint is handled.
   */
  idle: (direction: Direction): ClipRef =>
    direction === 'left' || direction === 'right'
      ? side('idle_right', direction)
      : drawn(`idle_${direction}`),

  /**
   * All four walk facings are real art too, so walking never mirrors. Only the
   * sprint does: its side row was drawn facing left and is flipped once at bake
   * time into the right-facing art the rest of the codebase assumes.
   */
  move: (direction: Direction, running: boolean): ClipRef => {
    if (!running) return drawn(`walk_${direction}`);
    if (direction === 'left' || direction === 'right') return side('run_side', direction);
    return drawn(`run_${direction}`);
  },

  /** `step` is 0-based. `aim` picks the octant; the facing is the fallback. */
  attack: (direction: Direction, step: number, aim?: Vector2Like): ClipRef =>
    swing(direction, step, aim),

  /** Cửu U Nộ Diễm — qi gathers at his feet and erupts as a pillar. */
  /**
   * Cửu U Nộ Diễm. Four drawn aims and no mirroring at all: the head-on pair
   * come off `wukong-skill1`, and both sides were drawn separately on
   * `-traiphai` rather than one being flipped. A diagonal aim resolves to
   * whichever of the four it is nearest, the way the dragon does.
   */
  nova: (direction: Direction, aim?: Vector2Like): ClipRef => {
    const which = octant(direction, aim);
    if (which === 'down' || which === 'up') return drawn(`cast_nova_${which}`);
    const pointsLeft = aim && aim.x !== 0 ? aim.x < 0 : direction === 'left';
    return drawn(pointsLeft ? 'cast_nova_left' : 'cast_nova_right');
  },

  /**
   * Hàng Ma Chân Lôi — the orb that swells on the staff and bursts.
   *
   * The only technique drawn from more than one angle: head-on, back-on, flat
   * sideways and the two rising/falling diagonals. Head-on and back-on play as
   * drawn; the other three were drawn facing right, so they mirror on an aim
   * that points left — which is read off the aim, not the facing, because a
   * diagonal aim leaves `Direction` reading `up` or `down`.
   */
  lance: (direction: Direction, aim?: Vector2Like): ClipRef => {
    const which = octant(direction, aim);
    if (which === 'down' || which === 'up') return drawn(`cast_lance_${which}`);
    const pointsLeft = aim && aim.x !== 0 ? aim.x < 0 : direction === 'left';
    // Flat sideways has a drawn row each way — the second is mirrored at bake
    // time rather than at runtime — so it never flips here. The diagonals have
    // one row each and do.
    if (which === 'side') return drawn(pointsLeft ? 'cast_lance_left' : 'cast_lance_right');
    return {
      key: key(`cast_lance_side_${which.startsWith('up') ? 'up' : 'down'}`),
      flip: Boolean(pointsLeft),
    };
  },

  /** Phần Thiên Ma Diễm — seven stages of flame rising into a demon's face. */
  wrath: (direction: Direction): ClipRef => side('cast_wrath', direction),

  /**
   * Ma Nguyệt Trảm — a crescent growing into the qi dragon.
   *
   * Four drawn aims, and both side rows were drawn facing right, so one is
   * mirrored at bake time into the left-hand cast rather than flipped here.
   * The diagonals fall to the side rather than to the head-on rows: the dragon
   * is a long horizontal sweep, and it reads far better carrying on sideways
   * than pointed at the camera.
   */
  dragon: (direction: Direction, aim?: Vector2Like): ClipRef => {
    const which = octant(direction, aim);
    if (which === 'down' || which === 'up') return drawn(`cast_dragon_${which}`);
    const pointsLeft = aim && aim.x !== 0 ? aim.x < 0 : direction === 'left';
    return drawn(pointsLeft ? 'cast_dragon_left' : 'cast_dragon_right');
  },

  /**
   * Cân Đẩu Vân, on the cloud.
   *
   * `gear` is how much speed he has built up: 0 cruising, 1 pushing, 2 at a
   * full streak. Only the side has art for all three — the artist drew the
   * ladder as a side view, which is the facing a long trail reads in — so the
   * head-on facings hold their one picture and let the speed show in how fast
   * the ground goes by.
   */
  fly: (direction: Direction, gear = 0): ClipRef => {
    if (direction === 'up' || direction === 'down') return drawn(`fly_${direction}`);
    const clip = gear >= 2 ? 'fly_streak' : gear === 1 ? 'fly_rush' : 'fly_side';
    return side(clip, direction);
  },
  /** Taking off is the same picture as staying up, at a standstill. */
  dash: (direction: Direction): ClipRef => WukongClip.fly(direction),

  hurt: (): ClipRef => drawn('hurt'),
  death: (): ClipRef => drawn('death'),
} as const;

/**
 * 1-based frame on which each action connects. Damage fires on the frame rather
 * than on a timer, so retiming the art retimes the hit, and a swing interrupted
 * before this frame deals nothing.
 */
const IMPACT_FRAME: Record<string, number> = {
  // frame 3 of 4 is the crescent at full sweep; frame 4 is the recovery
  // Hit 1 lands on beat 3, where the thrust is fully out and the crescent is
  // at its widest; beat 4 is the staff coming back up.
  atk1_side: 3,
  // Hit 2 is the ground slam — beat 3 is the staff coming down through the
  // burst, beat 2 only the spin that winds it up.
  atk2_side: 3,
  // Hit 3 is the odd one: the finisher keeps extending, so its longest reach
  // is the *last* beat rather than the third. Landing it on 3 would cut the
  // lunge off before the streak the chain has been building to.
  atk3_side: 4,

  /*
   * The head-on and diagonal swings are drawn to a rule the side chain is not:
   * `attack2` spends its whole five beats reaching, so the payoff is its last
   * cell, while `attack3` draws the same swing over six and keeps the sixth for
   * the recovery. Five of five, and five of six.
   */
  atk1_down: 5,
  atk2_down: 5,
  atk3_down: 5,
  // The back-turned chain keeps its own beats: the opener reaches furthest on
  // its last cell, while the slam and the lunge spend a beat recovering after.
  atk1_up: 5,
  atk2_up: 4,
  atk3_up: 4,
  atk1_upright: 5,
  atk2_upright: 5,
  atk1_upleft: 5,
  atk2_upleft: 5,
  atk1_downright: 5,
  atk2_downright: 5,
  atk1_downleft: 5,
  atk2_downleft: 5,
  // for the techniques it is the other way round: the last frame IS the
  // technique arriving, so damage fires with it
  //
  // The last body frame of each nova facing: the thrust is complete and the
  // flame is away. The facing-away cast is a beat shorter than the others.
  cast_nova_down: 6,
  cast_nova_up: 5,
  cast_nova_right: 6,
  cast_nova_left: 6,
  // The last frame, like every other technique: the settle cell that used to
  // follow it is not baked, so the clip ends on the burst and `recovery` holds
  // it there rather than on a pose with nothing in it.
  cast_lance_down: 5,
  cast_lance_up: 5,
  cast_lance_right: 6,
  cast_lance_left: 6,
  cast_lance_side_up: 4,
  cast_lance_side_down: 4,
  cast_wrath: 7,
  // The last frame of each dragon row: none of them draws a fade, so the clip
  // ends on the strike and `recovery` holds it there.
  cast_dragon_down: 6,
  cast_dragon_up: 6,
  cast_dragon_right: 4,
  cast_dragon_left: 4,
};

/**
 * How much larger than life each technique is drawn while it plays.
 *
 * The four cast sheets are baked at the size his *body* is everywhere else,
 * which is what keeps the man the same man from a walk into a cast. That is a
 * floor, not a target: these are his ultimates and they are meant to fill more
 * of the screen than a footstep does, so the whole cast — body and the flame,
 * face, lance or dragon drawn around it — is blown up while it plays.
 *
 * They do not all get the same number, because the artist did not draw them at
 * the same effect-to-body ratio. Measured off the baked art, how far each one
 * throws its effect past him at these numbers:
 *
 *   nova   152px    lance  362px    wrath  443px    dragon  441px
 *
 * Cửu U Nộ Diễm and Phần Thiên Ma Diễm break upward, around him. Ma Nguyệt Trảm
 * is drawn reaching sideways, so at a shared 1.5 it reads as much larger than
 * the other two even though its art is not — the spread is what the eye
 * measures in a top-down view — and its multiplier is cut until the lane it
 * covers matches the widest of them.
 *
 * Hàng Ma Chân Lôi is not blown up at all — `CAST_SCALE` 1 — and it is the odd
 * one out on purpose.
 * The other three hide the man inside the thing he is casting — a flame, a
 * demon's face, a dragon — so enlarging the frame enlarges mostly effect. This
 * one does not: for the first half of every row he is just standing there with
 * an orb on the end of his staff, so any multiplier reads as *the character
 * suddenly growing*, which is what 1.5 looked like. At 1 he stays the size he
 * walks around at and the orb is as large as it was drawn.
 *
 * Applied at runtime rather than at bake time on purpose: baking it would mean
 * frame boxes half again as wide for every technique — about 11 Mpx of texture
 * against 3.35 — and would buy no extra detail, because the two biggest sheets
 * are already scaled up rather than down to reach body size.
 */
const CAST_SCALE: Record<string, number> = {
  /*
   * Well under the other three, and the redraw is why. The rest of the
   * techniques were baked a little below body size, so blowing them up by half
   * landed them near it. These four rows are matched to the body exactly, so the
   * same half again made him half again bigger than the man who walks around.
   * 1.15 is the small lift that reads as a technique without becoming that.
   */
  cast_nova_down: 1.15,
  cast_nova_up: 1.15,
  cast_nova_right: 1.15,
  cast_nova_left: 1.15,
  cast_lance_down: 1,
  cast_lance_up: 1,
  cast_lance_right: 1,
  cast_lance_left: 1,
  cast_lance_side_up: 1,
  cast_lance_side_down: 1,
  cast_wrath: 1.5,
  cast_dragon_down: 1.1,
  cast_dragon_up: 1.1,
  cast_dragon_right: 1.1,
  cast_dragon_left: 1.1,
};

/** 1 for anything that is not one of his four techniques. */
export function castScaleOf(ref: ClipRef): number {
  return CAST_SCALE[clipNameOf(ref)] ?? 1;
}
export function impactFrameOf(ref: ClipRef): number {
  return IMPACT_FRAME[clipNameOf(ref)] ?? 1;
}

/** Playback time of the clip behind a ref, in ms. */
export function refDuration(ref: ClipRef): number {
  const { frames, frameRate } = spec(clipNameOf(ref));
  return (frames / frameRate) * 1000;
}

/* ----------------------------------------------------------------- effects */

/**
 * The one free-standing effect frame.
 *
 * Most of them are frames of the cast clips now — the dragon and the flame
 * belong to the animation that draws them. Two are not, and both for the same
 * reason: they have to appear somewhere the character is not. The pillar erupts
 * at the far end of the lane; the bolt flies down it.
 */
export const WUKONG_FX = {
  burst: 'fx_burst_0',
  /**
   * Cửu U Nộ Diễm's flame. `frame` is what the sprite is created on, `anim` what
   * it then plays — five beats of the lotus opening and breaking.
   */
  novaFlame: { frame: 'fx_nova_0', anim: `${PREFIX}fx_nova` },
  /**
   * The second cell of that flame: one tight lotus, before it starts spreading.
   * The trail that runs out ahead of the eruption is this frame, small.
   */
  novaBloom: 'fx_nova_1',
  /**
   * Hàng Ma Chân Lôi's bolt: four cells of its own, so this one is an animation
   * key rather than a single frame. It hangs off its left edge (the `muzzle`
   * anchor), which is the end that left the staff.
   */
  lanceBolt: { frame: 'fx_lance_0', anim: key('fx_lance') },
  /**
   * Where that bolt leaves the staff, in **world** pixels from his feet.
   *
   * Art pixels and world pixels were the same number when the atlas was baked
   * 1:1; they are not any more (WUKONG_ART_SCALE). This is applied as a world
   * offset and the measurement below was taken off the 1:1 bake, so the value
   * still stands — but it is a world figure now, not a texture one.
   *
   * Not the staff itself — the orb on the end of it. Sampling the white-hot
   * cores of `cast_lance_right` across its middle frames, one cluster of 90-120
   * pixels sits at (148, -49) in every one of them while everything else moves:
   * that is the beam head the technique has been building, and the bolt has to
   * leave from there or it starts out of thin air behind it.
   */
  lanceMuzzle: { x: 148, y: -49 },
} as const;

/* ---------------------------------------------------------------- creation */

export function createWukongAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(key('idle_down'))) return;

  for (const clip of CLIPS) {
    scene.anims.create({
      key: key(clip.clip),
      frames: scene.anims.generateFrameNames(WUKONG_TEXTURE, {
        prefix: `${clip.clip}_`,
        start: 0,
        end: clip.frames - 1,
      }),
      frameRate: clip.frameRate,
      repeat: clip.repeat,
    });
  }
}
