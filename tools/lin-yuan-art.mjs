// Lâm Uyên — pixel art rig. Every frame is drawn procedurally at 48x64.
import { Surface, flashed } from './pixel.mjs';

export const FRAME_W = 48;
export const FRAME_H = 64;

const BASE = {
  OUT: [20, 17, 28],
  HAIR_D: [24, 22, 38],
  HAIR: [42, 40, 66],
  HAIR_H: [74, 72, 112],
  SKIN_S: [196, 133, 94],
  SKIN: [240, 196, 150],
  SKIN_H: [255, 226, 190],
  EYE: [26, 24, 40],
  ROBE_D: [20, 32, 58],
  ROBE: [35, 58, 105],
  ROBE_H: [58, 92, 158],
  TRIM: [236, 242, 251],
  TRIM_S: [176, 192, 214],
  BELT: [200, 164, 86],
  BELT_D: [130, 98, 44],
  SHOE: [50, 44, 60],
  SHOE_H: [78, 70, 92],
  WOOD: [138, 96, 58],
  WOOD_D: [92, 62, 36],
  WOOD_H: [186, 140, 90],
  QI_C: [226, 251, 255],
  QI_M: [110, 214, 255],
  QI_D: [46, 120, 206],
};

function palette(flash = 0) {
  const p = {};
  for (const k of Object.keys(BASE)) p[k] = flashed(BASE[k], flash);
  return p;
}

const SHADOW = [0, 0, 0, 70];

const HAIR_TOP = 13; // top of the hair in every upright pose
const SHOULDER_Y = 31;
const HEM_TOP = 42;
const HEM_BOTTOM = 53;
const LEG_TOP = 50;
const SHOE_TOP = 57;
const GROUND_Y = 60;

const DIR_VEC = {
  down: [0, 1],
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

/* ------------------------------------------------------------------ shadow */

function drawShadow(s, width, alpha) {
  const col = [SHADOW[0], SHADOW[1], SHADOW[2], Math.round(SHADOW[3] * alpha)];
  s.ellipse(24, GROUND_Y + 1, width, 3, col);
}

/* -------------------------------------------------------------- front view */

function drawLegsFrontal(s, P, legPhase) {
  const off = Math.round(legPhase * 2);
  const legs = [
    { x: 18, lift: Math.max(0, off) },
    { x: 26, lift: Math.max(0, -off) },
  ];
  for (const leg of legs) {
    const shoeTop = SHOE_TOP - leg.lift;
    s.rect(leg.x, LEG_TOP, 4, shoeTop - LEG_TOP, P.TRIM_S);
    s.vline(leg.x, LEG_TOP, shoeTop - 1, P.TRIM);
    s.roundRect(leg.x - 1, shoeTop, 6, GROUND_Y - shoeTop + 1, P.SHOE, 1);
    s.hline(leg.x - 1, leg.x + 3, shoeTop, P.SHOE_H);
  }
}

function drawRobeFrontal(s, P, flutter) {
  // skirt
  s.trapezoid(HEM_TOP, HEM_BOTTOM, 16, 31, 13 - flutter, 34 + flutter, P.ROBE);
  s.trapezoid(HEM_TOP, HEM_BOTTOM, 16, 18, 13 - flutter, 16 - flutter, P.ROBE_H);
  s.trapezoid(HEM_TOP, HEM_BOTTOM, 29, 31, 31 + flutter, 34 + flutter, P.ROBE_D);
  s.hline(13 - flutter, 34 + flutter, HEM_BOTTOM, P.TRIM);
  s.hline(14 - flutter, 33 + flutter, HEM_BOTTOM - 1, P.TRIM_S);
  s.vline(24, HEM_TOP, HEM_BOTTOM - 2, P.ROBE_D);
  // torso
  s.roundRect(16, SHOULDER_Y, 16, HEM_TOP - SHOULDER_Y, P.ROBE, 2);
  s.vline(16, SHOULDER_Y + 1, HEM_TOP - 1, P.ROBE_H);
  s.vline(31, SHOULDER_Y + 1, HEM_TOP - 1, P.ROBE_D);
  // white collar (V)
  s.line(19, SHOULDER_Y, 24, SHOULDER_Y + 7, P.TRIM, 2);
  s.line(28, SHOULDER_Y, 24, SHOULDER_Y + 7, P.TRIM, 2);
  s.hline(23, 24, SHOULDER_Y + 7, P.TRIM_S);
  // belt
  s.rect(15, HEM_TOP - 3, 18, 3, P.BELT);
  s.hline(15, 32, HEM_TOP - 1, P.BELT_D);
  s.rect(22, HEM_TOP - 3, 4, 5, P.BELT_D);
  s.rect(23, HEM_TOP - 2, 2, 3, P.BELT);
  // belt ribbons
  s.vline(21, HEM_TOP + 2, HEM_TOP + 8, P.TRIM_S);
  s.vline(27, HEM_TOP + 2, HEM_TOP + 7, P.TRIM_S);
}

function drawSleeve(s, P, x, y, h, mirrored) {
  s.roundRect(x, y, 4, h, P.ROBE, 1);
  s.vline(mirrored ? x + 3 : x, y + 1, y + h - 2, mirrored ? P.ROBE_D : P.ROBE_H);
  s.hline(x, x + 3, y + h - 1, P.TRIM);
  s.hline(x, x + 3, y + h - 2, P.TRIM_S);
}

function drawHand(s, P, x, y) {
  s.roundRect(x, y, 3, 3, P.SKIN, 1);
  s.set(x + 2, y + 2, P.SKIN_S);
}

function drawHeadFrontal(s, P, sway) {
  const hy = HAIR_TOP;
  // ponytail peeking past the shoulder
  s.line(31, hy + 6, 33 + sway, hy + 19, P.HAIR_D, 3);
  s.line(31, hy + 6, 33 + sway, hy + 16, P.HAIR, 2);
  // top knot
  s.roundRect(20, hy - 2, 8, 4, P.HAIR_D, 1);
  s.hline(21, 26, hy - 2, P.HAIR);
  // hair cap
  s.roundRect(16, hy, 16, 9, P.HAIR, 2);
  s.hline(19, 27, hy + 1, P.HAIR_H);
  // face
  s.roundRect(18, hy + 5, 12, 12, P.SKIN, 2);
  s.vline(29, hy + 7, hy + 14, P.SKIN_S);
  // fringe
  s.hline(18, 29, hy + 5, P.HAIR_D);
  s.hline(18, 29, hy + 6, P.HAIR);
  s.hline(23, 24, hy + 7, P.HAIR);
  s.set(18, hy + 7, P.HAIR);
  s.set(29, hy + 7, P.HAIR);
  // side locks
  s.rect(16, hy + 5, 2, 10, P.HAIR);
  s.rect(30, hy + 5, 2, 10, P.HAIR_D);
  // brows + eyes
  s.hline(20, 21, hy + 8, P.HAIR_D);
  s.hline(26, 27, hy + 8, P.HAIR_D);
  s.rect(20, hy + 9, 2, 2, P.EYE);
  s.rect(26, hy + 9, 2, 2, P.EYE);
  s.set(20, hy + 9, P.QI_C);
  s.set(26, hy + 9, P.QI_C);
  // ears + mouth
  s.set(17, hy + 10, P.SKIN_S);
  s.set(30, hy + 10, P.SKIN_S);
  s.hline(23, 24, hy + 14, P.SKIN_S);
  // neck
  s.rect(21, hy + 16, 6, 2, P.SKIN_S);
}

function drawHeadBack(s, P, sway) {
  const hy = HAIR_TOP;
  s.roundRect(20, hy - 2, 8, 4, P.HAIR_D, 1);
  s.roundRect(16, hy, 16, 17, P.HAIR, 2);
  s.hline(19, 27, hy + 1, P.HAIR_H);
  s.vline(30, hy + 3, hy + 14, P.HAIR_D);
  // tie band
  s.rect(21, hy + 2, 6, 2, P.TRIM_S);
  s.rect(22, hy + 2, 4, 1, P.TRIM);
  // ponytail down the back — reads against the robe thanks to the light core
  s.trapezoid(hy + 4, hy + 26, 21, 27, 22 + sway, 26 + sway, P.HAIR_D);
  s.trapezoid(hy + 4, hy + 26, 22, 26, 23 + sway, 25 + sway, P.HAIR);
  s.trapezoid(hy + 6, hy + 24, 23, 24, 23 + sway, 24 + sway, P.HAIR_H);
  s.hline(23 + sway, 25 + sway, hy + 27, P.HAIR_D);
  s.rect(20, hy + 16, 8, 2, P.HAIR_D);
}

/* --------------------------------------------------------- profile (right) */

function drawLegsProfile(s, P, legPhase) {
  const swing = Math.round(legPhase * 3);
  const legs = [
    { x: 19 - swing, col: P.TRIM_S, shoe: P.SHOE, lift: Math.max(0, -legPhase) * 2 },
    { x: 23 + swing, col: P.TRIM, shoe: P.SHOE_H, lift: Math.max(0, legPhase) * 2 },
  ];
  for (const leg of legs) {
    const shoeTop = SHOE_TOP - Math.round(leg.lift);
    s.rect(leg.x, LEG_TOP, 5, shoeTop - LEG_TOP, leg.col);
    s.roundRect(leg.x, shoeTop, 7, GROUND_Y - shoeTop + 1, leg.shoe, 1);
    s.hline(leg.x, leg.x + 6, shoeTop, P.SHOE_H);
  }
}

function drawRobeProfile(s, P, flutter) {
  s.trapezoid(HEM_TOP, HEM_BOTTOM, 18, 30, 15 - flutter, 32 + flutter, P.ROBE);
  s.trapezoid(HEM_TOP, HEM_BOTTOM, 18, 20, 15 - flutter, 18 - flutter, P.ROBE_D);
  s.trapezoid(HEM_TOP, HEM_BOTTOM, 28, 30, 29 + flutter, 32 + flutter, P.ROBE_H);
  s.hline(15 - flutter, 32 + flutter, HEM_BOTTOM, P.TRIM);
  s.hline(16 - flutter, 31 + flutter, HEM_BOTTOM - 1, P.TRIM_S);
  s.roundRect(18, SHOULDER_Y, 12, HEM_TOP - SHOULDER_Y, P.ROBE, 2);
  s.vline(18, SHOULDER_Y + 1, HEM_TOP - 1, P.ROBE_D);
  s.vline(29, SHOULDER_Y + 1, HEM_TOP - 1, P.ROBE_H);
  s.line(26, SHOULDER_Y, 22, SHOULDER_Y + 8, P.TRIM, 2);
  s.rect(17, HEM_TOP - 3, 14, 3, P.BELT);
  s.hline(17, 30, HEM_TOP - 1, P.BELT_D);
  s.rect(19, HEM_TOP - 3, 3, 5, P.BELT_D);
  s.vline(19, HEM_TOP + 2, HEM_TOP + 8, P.TRIM_S);
}

function drawHeadProfile(s, P, sway) {
  const hy = HAIR_TOP;
  // ponytail trailing behind
  s.line(19, hy + 3, 13 - sway, hy + 14, P.HAIR_D, 3);
  s.line(19, hy + 3, 14 - sway, hy + 12, P.HAIR, 2);
  s.line(19, hy + 3, 15 - sway, hy + 9, P.HAIR_H, 1);
  s.roundRect(19, hy - 2, 8, 4, P.HAIR_D, 1);
  // skull + face
  s.roundRect(18, hy, 13, 10, P.HAIR, 2);
  s.hline(21, 28, hy + 1, P.HAIR_H);
  s.roundRect(21, hy + 5, 10, 12, P.SKIN, 2);
  s.hline(22, 30, hy + 5, P.HAIR_D);
  s.hline(22, 30, hy + 6, P.HAIR);
  s.hline(29, 30, hy + 7, P.HAIR);
  s.rect(18, hy + 5, 3, 10, P.HAIR);
  s.vline(31, hy + 8, hy + 12, P.SKIN);
  s.set(31, hy + 10, P.SKIN_H); // nose
  s.rect(27, hy + 9, 2, 2, P.EYE);
  s.set(27, hy + 9, P.QI_C);
  s.hline(26, 28, hy + 8, P.HAIR_D);
  s.rect(23, hy + 10, 2, 2, P.SKIN_S);
  s.set(30, hy + 13, P.SKIN_S);
  s.rect(22, hy + 16, 6, 2, P.SKIN_S);
}

/* ---------------------------------------------------------------- the sword */

function drawSwordAt(s, P, px, py, dx, dy, length, glow) {
  const tipX = px + dx * length;
  const tipY = py + dy * length;
  const buttX = px - dx * 5;
  const buttY = py - dy * 5;
  if (glow) {
    s.line(buttX, buttY, tipX, tipY, P.QI_D, 4);
    s.line(px, py, tipX, tipY, P.QI_M, 2);
  }
  s.line(buttX, buttY, tipX, tipY, P.WOOD_D, 3);
  s.line(px + dx * 2, py + dy * 2, tipX, tipY, P.WOOD, 2);
  s.line(px + dx * 3, py + dy * 3, tipX - dx, tipY - dy, P.WOOD_H, 1);
  // guard + grip
  s.line(px - dy * 2, py + dx * 2, px + dy * 2, py - dx * 2, P.BELT, 1);
  s.line(buttX, buttY, px - dx, py - dy, P.HAIR_D, 2);
  if (glow) s.set(Math.round(tipX), Math.round(tipY), P.QI_C);
}

function drawSheathedSword(s, P, dir) {
  if (dir === 'up') {
    s.line(30, 34, 37, 48, P.WOOD_D, 3);
    s.line(30, 34, 36, 46, P.WOOD, 2);
    s.line(29, 33, 31, 37, P.HAIR_D, 2);
    return;
  }
  if (dir === 'down') {
    s.line(33, 38, 39, 50, P.WOOD_D, 3);
    s.line(33, 38, 38, 48, P.WOOD, 2);
    s.line(32, 36, 34, 40, P.HAIR_D, 2);
    s.set(33, 37, P.BELT);
    return;
  }
  // profile: hangs along the hip, hilt forward
  s.line(30, 40, 16, 48, P.WOOD_D, 3);
  s.line(29, 40, 17, 47, P.WOOD, 2);
  s.line(31, 39, 33, 40, P.HAIR_D, 2);
  s.set(31, 40, P.BELT);
}

/* ------------------------------------------------------------ fallen poses */

function drawFallen(s, P, stage) {
  s.ellipse(24, GROUND_Y + 1, 13, 3, [SHADOW[0], SHADOW[1], SHADOW[2], 60]);
  if (stage < 0.5) {
    // on the knees, head bowed
    const hy = 30 + Math.round(stage * 16);
    const lean = Math.round(stage * 12);
    s.trapezoid(hy + 8, GROUND_Y - 1, 17, 31, 13, 35, P.ROBE);
    s.hline(13, 35, GROUND_Y - 1, P.TRIM);
    s.roundRect(18, hy, 12, 10, P.ROBE, 2);
    s.rect(16, hy + 2, 16, 2, P.BELT);
    s.roundRect(17 + lean, hy - 11, 14, 13, P.HAIR, 2);
    s.roundRect(19 + lean, hy - 5, 10, 7, P.SKIN, 2);
    s.hline(20 + lean, 28 + lean, hy - 5, P.HAIR_D);
    s.hline(21 + lean, 22 + lean, hy - 2, P.EYE);
    s.hline(26 + lean, 27 + lean, hy - 2, P.EYE);
    s.line(14, hy + 4, 12, hy + 12, P.ROBE_D, 3);
    s.line(34, hy + 4, 36, hy + 12, P.ROBE_D, 3);
    s.line(36, hy + 8, 42, hy + 16, P.WOOD_D, 3);
    return;
  }
  // flat on the ground: head to the left, robe spread to the right
  const y = 50 + Math.round((stage - 0.5) * 8);
  s.trapezoid(y, GROUND_Y, 22, 40, 20, 38, P.ROBE);
  s.hline(36, 40, y, P.TRIM);
  s.hline(34, 38, GROUND_Y, P.TRIM_S);
  s.rect(22, y, 4, GROUND_Y - y + 1, P.BELT);
  s.roundRect(12, y - 1, 11, GROUND_Y - y + 2, P.SKIN, 2);
  s.roundRect(10, y - 2, 8, GROUND_Y - y + 3, P.HAIR, 2);
  s.line(10, y + 1, 4, y + 4, P.HAIR_D, 3);
  s.hline(17, 20, y + 2, P.EYE);
  s.set(19, y + 4, P.SKIN_S);
  s.line(26, y - 2, 32, y - 4, P.ROBE_D, 3); // limp arm
  s.line(38, y + 2, 44, y + 5, P.WOOD_D, 3); // dropped sword
  s.line(38, y + 2, 43, y + 4, P.WOOD, 2);
}

/* --------------------------------------------------------------------- FX */

function drawFx(fx, P, dir, spec, squash = 1) {
  const [fdx, fdy] = DIR_VEC[dir];
  const cx = 24 + fdx * (spec.dist ?? 0);
  const cy = 36 + fdy * (spec.dist ?? 0) * squash;
  const baseAngle = Math.atan2(fdy, fdx);
  if (spec.orb) {
    const r = spec.orb;
    fx.ellipse(cx, cy, r + 1, r + 1, P.QI_D);
    fx.ellipse(cx, cy, r, r, P.QI_M);
    fx.ellipse(cx, cy, Math.max(1, r - 2), Math.max(1, r - 2), P.QI_C);
    for (let i = 0; i < 4; i++) {
      const a = baseAngle + i * 1.6;
      fx.set(
        Math.round(cx + Math.cos(a) * (r + 3)),
        Math.round(cy + Math.sin(a) * (r + 3)),
        P.QI_M,
      );
    }
  }
  if (spec.crescent) {
    const r = spec.crescent;
    const ry = Math.max(2, Math.round(r * squash));
    fx.arc(cx, cy, r, baseAngle - 1.15, baseAngle + 1.15, P.QI_D, 3, ry);
    fx.arc(cx, cy, r, baseAngle - 1.0, baseAngle + 1.0, P.QI_M, 2, ry);
    fx.arc(cx, cy, r - 1, baseAngle - 0.7, baseAngle + 0.7, P.QI_C, 1, ry - 1);
  }
  if (spec.slash) {
    // qi-tinted swoosh: white alone disappears against the white robe hem
    const r = spec.slash.r;
    const ry = Math.max(3, Math.round(r * squash));
    const ox = 24 + fdx * 4;
    const oy = 38 + fdy * 4 * squash;
    const { a0, a1 } = spec.slash;
    fx.arc(ox, oy, r, baseAngle + a0, baseAngle + a1, P.QI_D, 3, ry);
    fx.arc(ox, oy, r, baseAngle + a0 + 0.1, baseAngle + a1 - 0.1, P.QI_M, 2, ry);
    fx.arc(ox, oy, r - 1, baseAngle + a0 + 0.2, baseAngle + a1 - 0.2, P.TRIM, 1, ry - 1);
  }
  if (spec.motes) {
    for (let i = 0; i < spec.motes; i++) {
      const a = baseAngle + (i / spec.motes) * Math.PI * 2;
      const d = 9 + (i % 3) * 4;
      fx.set(
        Math.round(24 + Math.cos(a) * d),
        Math.round(34 + Math.sin(a) * d * 0.7),
        i % 2 ? P.QI_M : P.QI_C,
      );
    }
  }
}

/* ------------------------------------------------------------ frame render */

/**
 * Render one 48x64 frame.
 * @param {{
 *  dir:'down'|'up'|'left'|'right', legPhase?:number, bob?:number, sway?:number,
 *  flutter?:number, flash?:number, alpha?:number, hurt?:number,
 *  sword?:{rel:number,len:number,glow?:boolean}|null, fx?:object|null,
 *  fallen?:number|null
 * }} pose
 */
export function renderFrame(pose) {
  const frame = new Surface(FRAME_W, FRAME_H);
  const P = palette(pose.flash ?? 0);
  const mirror = pose.dir === 'left';
  const dir = mirror ? 'right' : pose.dir;
  const ch = new Surface(FRAME_W, FRAME_H);
  const fx = new Surface(FRAME_W, FRAME_H);
  const alpha = pose.alpha ?? 1;

  if (pose.fallen != null) {
    drawFallen(ch, P, pose.fallen);
    ch.outline(P.OUT);
    frame.blit(ch);
    if (pose.fx) {
      drawFx(fx, P, 'down', pose.fx);
      frame.blit(fx);
    }
    if (alpha < 1) frame.scaleAlpha(alpha);
    return mirrorIf(frame, mirror);
  }

  const bob = pose.bob ?? 0;
  const legPhase = pose.legPhase ?? 0;
  const sway = pose.sway ?? 0;
  const flutter = pose.flutter ?? 0;
  const hurt = pose.hurt ?? 0;

  drawShadow(frame, dir === 'right' ? 10 : 11, alpha);

  const body = new Surface(FRAME_W, FRAME_H);
  const swordBehind = dir === 'up';
  const [fdx, fdy] = DIR_VEC[dir];

  // Frontal views foreshorten the blade so it reads diagonally instead of
  // spearing straight through the body.
  const frontal = dir === 'down' || dir === 'up';

  const drawActiveSword = () => {
    if (!pose.sword) return;
    const baseAngle = Math.atan2(fdy, fdx);
    const a = baseAngle + (pose.sword.rel * Math.PI) / 180;
    const px = 24 + fdx * 5 + (frontal ? 6 : 0);
    const py = frontal ? 37 + fdy * 2 : 38;
    // the lateral bias keeps a frontal blade off the character's own silhouette
    const dx = frontal ? Math.cos(a) * 1.1 + 0.85 : Math.cos(a);
    const dy = Math.sin(a) * (frontal ? 0.55 : 1);
    const mag = Math.hypot(dx, dy) || 1;
    const len = pose.sword.len * (frontal ? 0.8 : 1);
    drawSwordAt(body, P, px, py, dx / mag, dy / mag, len, pose.sword.glow);
    drawHand(body, P, Math.round(px) - 1, Math.round(py) - 1);
  };

  if (swordBehind) drawActiveSword();

  if (dir === 'right') {
    drawLegsProfile(body, P, legPhase);
    drawRobeProfile(body, P, flutter);
    if (!pose.sword) drawSheathedSword(body, P, 'right');
    const armX = pose.sword ? 24 : 22 + Math.round(legPhase * 2);
    drawSleeve(body, P, armX, SHOULDER_Y + 1, 12, false);
    if (!pose.sword) drawHand(body, P, armX, SHOULDER_Y + 13);
    drawHeadProfile(body, P, sway);
  } else if (dir === 'down') {
    drawLegsFrontal(body, P, legPhase);
    drawRobeFrontal(body, P, flutter);
    if (!pose.sword) drawSheathedSword(body, P, 'down');
    drawSleeve(body, P, 13, SHOULDER_Y + 1, 12 + (legPhase > 0 ? 1 : 0), false);
    drawHand(body, P, 13, SHOULDER_Y + 13 + (legPhase > 0 ? 1 : 0));
    if (!pose.sword) {
      drawSleeve(body, P, 31, SHOULDER_Y + 1, 12 + (legPhase < 0 ? 1 : 0), true);
      drawHand(body, P, 32, SHOULDER_Y + 13 + (legPhase < 0 ? 1 : 0));
    } else {
      drawSleeve(body, P, 29, SHOULDER_Y + 2, 8, true);
    }
    drawHeadFrontal(body, P, sway);
  } else {
    drawLegsFrontal(body, P, legPhase);
    drawRobeFrontal(body, P, flutter);
    if (!pose.sword) drawSheathedSword(body, P, 'up');
    drawSleeve(body, P, 13, SHOULDER_Y + 1, 12, false);
    drawHand(body, P, 13, SHOULDER_Y + 13);
    if (!pose.sword) {
      drawSleeve(body, P, 31, SHOULDER_Y + 1, 12, true);
      drawHand(body, P, 32, SHOULDER_Y + 13);
    }
    drawHeadBack(body, P, sway);
  }

  if (!swordBehind) drawActiveSword();

  // breathing / recoil is a whole-body pixel offset so the baseline stays put
  ch.blit(body, hurt ? Math.round(-fdx * hurt) : 0, bob - (hurt ? 1 : 0));
  ch.outline(P.OUT);
  frame.blit(ch);

  if (pose.fx) {
    drawFx(fx, P, dir, pose.fx, frontal ? 0.72 : 1);
    frame.blit(fx);
  }
  if (alpha < 1) frame.scaleAlpha(alpha);
  return mirrorIf(frame, mirror);
}

function mirrorIf(surface, mirror) {
  if (!mirror) return surface;
  const out = new Surface(surface.width, surface.height);
  for (let y = 0; y < surface.height; y++)
    for (let x = 0; x < surface.width; x++)
      out.set(surface.width - 1 - x, y, surface.get(x, y));
  return out;
}
