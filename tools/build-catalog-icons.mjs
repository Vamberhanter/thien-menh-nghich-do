// Draws the item icons that no asset pack in this project supplies.
//
//   node tools/build-catalog-icons.mjs [--force]
//
// `package.json` has called this file for a while and it was never written, so
// every gem, cultivation material, non-weapon equip and sword in the catalogue
// resolved to a 404. That is not only a blank square in the bag: `itemArt.ts`
// turns each icon into a world texture for the pile an enemy drops, and it has
// no fallback, so a missing icon is loot the player cannot see on the ground.
//
// There is no source art to cut. The three staged packs hold crops, farm
// animals, tilesets and monsters — no gems, no pills, no blades — so these are
// drawn here instead, in the game's own palette rather than a pack's. Farm RPG
// dirt measures 238,157,81 against this map's #243c2c grass; anything cut from
// it reads as pasted on, which is the complaint `farmArt.ts` already records
// about that pack's path tile.
//
// Real art wins whenever it turns up: an icon that already exists on disk is
// left alone unless `--force` is passed. Stage a hand-drawn `blood-sword.png`
// and re-running this will not overwrite it.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Surface } from './pixel.mjs';
import { encodePNG } from './png.mjs';

const OUT = join('public', 'assets');
const FORCE = process.argv.includes('--force');

/** Every icon is drawn on this square. Drops are fitted to 64px, the bag to 40. */
const S = 32;

/* --------------------------------------------------------------- palette */

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

/**
 * One dark rim for everything.
 *
 * The bag draws on `#0a0e18` and the world draws on grass, so an icon has to
 * hold its shape against both. A near-black outline plus a bright interior
 * highlight is the cheapest thing that does — the same trick the character
 * sheets use.
 */
const RIM = hex('#12101c');

/** base / light / dark, in the order a shaded solid wants them. */
const shade = (base, light, dark) => ({ base: hex(base), light: hex(light), dark: hex(dark) });

/* ----------------------------------------------------------------- gems */

/**
 * Four stones, three grades each — see `GEM_CATALOG` in GemSystem.ts. Grade is
 * drawn as size and cut rather than as a badge: a bậc-1 stone is a small
 * cabochon, bậc-2 takes facets, bậc-3 gets a full brilliant and a sparkle. So
 * two gems can be ranked side by side without reading either label.
 */
const GEMS = {
  'hong-ngoc': shade('#c8304a', '#ff8a9a', '#6e1226'), // attack
  'lam-ngoc': shade('#2f6ec8', '#7fc0ff', '#132f6e'), // spirit
  'luc-ngoc': shade('#2f9e5a', '#7fe6a0', '#12482a'), // health
  'hoang-ngoc': shade('#c89a2a', '#ffe08a', '#6e4a10'), // defence
};

/**
 * A cut stone, not a bead.
 *
 * The first attempt was an octagon shaded top-to-bottom and it read as a
 * jelly: what makes a gem a gem is that the widest line is near the *top*
 * (the girdle) and everything below it converges to a point. So the shape is
 * built as two trapezoids meeting at that line, and the facets are drawn as
 * wedges off the table rather than as decoration on a disc.
 */
function drawGem(s, c, tier) {
  const cx = 16;
  const half = [4, 6, 8][tier - 1]; // half-width at the girdle
  const top = 20 - [10, 14, 18][tier - 1];
  const girdle = top + Math.max(2, Math.round(half * 0.7));
  const point = girdle + Math.round(half * 1.7); // proportional, not pinned
  const table = Math.max(1, half - 2); // half-width of the flat top

  // Crown: table out to the girdle. Pavilion: girdle down to the point.
  s.trapezoid(top, girdle, cx - table, cx + table, cx - half, cx + half, c.light);
  s.trapezoid(girdle, point, cx - half, cx + half, cx, cx, c.base);

  // Pavilion facets — one lit wedge, the rest falling into shadow. Without
  // these the lower half is a flat triangle of colour.
  for (let y = girdle; y <= point; y++) {
    const t = (y - girdle) / (point - girdle);
    const w = Math.round(half * (1 - t));
    s.hline(cx + Math.round(w * 0.15), cx + w, y, c.dark);
    s.set(cx - Math.round(w * 0.55), y, c.light);
  }

  // Table on top, and the crown wedges that meet it.
  s.hline(cx - table, cx + table, top, [255, 255, 255]);
  s.line(cx - table, top, cx - half, girdle, c.base);
  s.line(cx + table, top, cx + half, girdle, c.dark);
  s.hline(cx - half, cx + half, girdle, c.light); // the girdle itself

  if (tier >= 2) {
    // A second row of crown facets, which is what separates a bậc-2 cut from
    // a plain cabochon at this size.
    s.set(cx - table - 1, top + 1, c.base);
    s.set(cx + table + 1, top + 1, c.dark);
    s.line(cx, top + 1, cx - half + 1, girdle - 1, c.base);
    s.line(cx, top + 1, cx + half - 1, girdle - 1, c.dark);
  }
  if (tier >= 3) {
    // Sparkle, off the stone so it does not eat a facet.
    const sx = cx + half + 2;
    const sy = top + 1;
    s.hline(sx - 2, sx + 2, sy, [255, 255, 255]);
    s.vline(sx, sy - 2, sy + 2, [255, 255, 255]);
  }
}

/* ------------------------------------------------------------ materials */

const BONE = shade('#d8d2be', '#f4f0e2', '#8a8472');
const JADE = shade('#3f9e72', '#8fe6b8', '#1c4c36');

function drawBone(s, c, graded) {
  const w = graded ? 7 : 5;
  const top = graded ? 5 : 8;
  const half = w >> 1;
  // Shaft with a knuckle at each end — the read that survives at 40px.
  s.roundRect(16 - half, top, w, 28 - top, c.dark, 1);
  s.roundRect(17 - half, top + 1, w - 2, 26 - top, c.base, 1);
  for (const [kx, ky] of [
    [13, top + 1],
    [19, top + 1],
    [13, 26],
    [19, 26],
  ])
    s.ellipse(kx, ky, 3, 3, c.base);
  s.ellipse(13, top, 2, 2, c.light);
  s.ellipse(19, 25, 2, 2, c.light);
  s.vline(15, top + 3, 24, c.light);
  if (graded) {
    // The qi it has started to hold — a cool cast down one edge, not a halo.
    const qi = hex('#8fd8ff');
    s.vline(19, top + 4, 23, qi);
    s.set(13, top + 4, qi);
    s.set(20, 25, qi);
  }
}

function drawPill(s, c) {
  // Dish first, pill sitting in it: a bare sphere reads as a gem.
  s.ellipse(16, 24, 10, 4, hex('#2e2a38'));
  s.ellipse(16, 23, 9, 3, hex('#4a4458'));
  s.ellipse(16, 17, 8, 8, c.dark);
  s.ellipse(16, 17, 7, 7, c.base);
  s.ellipse(14, 14, 3, 2.5, c.light);
  // A swirl, so it looks refined rather than found.
  s.arc(16, 18, 4, Math.PI * 1.1, Math.PI * 2.1, c.light, 1);
  s.set(13, 13, [255, 255, 255]);
}

/**
 * Cultivation drops. Each says what it is by silhouette alone, because the bag
 * shows them at 40px with a stack count over the corner: a vial is not a bone
 * is not a pill is not a shard, whatever the palette does.
 */
const MATERIALS = {
  // Yêu huyết — a stoppered vial of it. The fluid stops short of the neck, so
  // the empty glass above it reads as glass rather than as a solid red block.
  'yeu-huyet': (s) => {
    const glass = shade('#4a5a6e', '#8fa8c0', '#242c3a');
    const blood = shade('#a01828', '#e04a52', '#500a16');
    s.roundRect(11, 10, 10, 18, glass.dark, 2);
    s.roundRect(12, 11, 8, 16, glass.base, 2);
    s.rect(13, 18, 6, 8, blood.base);
    s.rect(13, 18, 6, 2, blood.light);
    s.rect(13, 24, 6, 2, blood.dark);
    s.rect(14, 6, 4, 5, glass.base); // neck
    s.rect(13, 4, 6, 3, hex('#6b4a28')); // cork
    s.rect(13, 4, 6, 1, hex('#8a6428'));
    s.vline(13, 12, 22, glass.light);
  },

  'linh-cot-ha': (s) => drawBone(s, BONE, false),
  'linh-cot-trung': (s) => drawBone(s, BONE, true),

  // Yêu đan — the beast's core. A dark orb with a ring of light inside it
  // rather than a bright ball: it is a demon's, and it should look like it.
  'yeu-dan': (s) => {
    const core = shade('#3a2a52', '#8a6ac8', '#1a1028');
    s.ellipse(16, 17, 9, 9, core.dark);
    s.ellipse(16, 17, 8, 8, core.base);
    s.arc(16, 17, 5.5, Math.PI * 0.15, Math.PI * 1.15, core.light, 1);
    s.ellipse(16, 17, 2.5, 2.5, hex('#c8a8ff'));
    s.set(16, 17, [255, 255, 255]);
    s.ellipse(12, 12, 2, 1.5, [255, 255, 255, 130]);
  },

  // Both pills are a sphere in a dish; the grade is the metal — jade for
  // Foundation, gold for Core Formation.
  'truc-co-dan': (s) => drawPill(s, JADE),
  'ket-dan-dan': (s) => drawPill(s, shade('#c89a2a', '#ffe08a', '#6e4a10')),

  // Huyết ma tinh — a cluster, three blades of it, deliberately not symmetric.
  'huyet-ma-tinh': (s) => {
    const c = shade('#b01c34', '#ff6a72', '#500a18');
    const spike = (x0, y0, x1, y1, w) => {
      s.line(x0, y0, x1, y1, c.base, w);
      s.line(x0, y0, x1, y1, c.light, Math.max(1, w - 2));
      s.line(x0, y0 + 1, x1, y1, c.dark, 1);
    };
    spike(16, 27, 16, 6, 6);
    spike(11, 28, 8, 14, 4);
    spike(21, 28, 24, 16, 4);
    s.rect(9, 26, 15, 3, c.dark); // the rock they grew out of
    s.set(16, 8, [255, 255, 255]);
    s.set(8, 16, [255, 255, 255]);
  },

  // Linh thạch — the currency stone. Deliberately the plainest thing here: it
  // is spent by the hundred and must not out-shout a gem in the same bag.
  'spirit-stone': (s) => {
    const c = shade('#5aa8c0', '#b8f0ff', '#1e4a5c');
    s.trapezoid(9, 26, 13, 19, 10, 22, c.base);
    s.trapezoid(9, 26, 13, 16, 10, 16, c.light);
    s.trapezoid(20, 26, 11, 21, 10, 22, c.dark);
    s.hline(11, 21, 20, c.light);
    s.set(15, 12, [255, 255, 255]);
  },
};

/* ------------------------------------------------------------ equipment */

/**
 * The three non-weapon equips. `Inventory.ts` used to say these fall back to
 * their initial for want of art; icon paths were added later and the art never
 * was, which left the note true and the code wrong. This closes it from the
 * art side.
 */
const EQUIPMENT = {
  // Áo ngoại môn — worn, seen front on. Two earlier attempts read as a plank
  // over two posts and then as a plain cloak; what fixes it is angling the
  // sleeves down and away from the body, because the notch that leaves where
  // an armpit goes is the thing that says "garment" at 40px.
  'outer-robe': (s) => {
    const cloth = shade('#4e5a72', '#8a98b4', '#242c3c');
    s.trapezoid(9, 17, 12, 20, 11, 21, cloth.base); // torso
    s.trapezoid(17, 27, 11, 21, 8, 24, cloth.base); // skirt below the sash
    s.trapezoid(10, 19, 8, 12, 4, 8, cloth.base); // left sleeve, out and down
    s.trapezoid(10, 19, 20, 24, 24, 28, cloth.base); // right sleeve
    s.trapezoid(9, 26, 12, 15, 9, 15, cloth.light); // the lit half of the front
    s.trapezoid(10, 19, 8, 10, 4, 6, cloth.light); // and of the left sleeve
    s.vline(16, 13, 26, cloth.dark); // closure, all the way down
    s.line(16, 9, 12, 15, cloth.light); // collar V into the sash
    s.line(16, 9, 20, 15, cloth.dark);
    s.rect(9, 15, 15, 3, hex('#8a6428')); // sash
    s.rect(9, 15, 15, 1, hex('#c89a2a'));
    s.rect(15, 18, 3, 4, hex('#c89a2a')); // knot hanging off it
  },

  // Ngọc bội — a pierced jade disc hung on a cord. The cord is a closed loop
  // through the fitting; drawn as a bare arc it floated above the disc with
  // nothing holding it.
  'jade-pendant': (s) => {
    const cord = hex('#6b4a28');
    s.arc(16, 8, 5, Math.PI, Math.PI * 2, cord, 1); // over the top
    s.line(11, 8, 15, 12, cord); // down both sides into the fitting
    s.line(21, 8, 17, 12, cord);
    s.ellipse(16, 21, 8, 8, JADE.dark);
    s.ellipse(16, 21, 7, 7, JADE.base);
    s.arc(16, 21, 5.5, Math.PI * 0.9, Math.PI * 1.7, JADE.light, 1);
    s.arc(16, 21, 5.5, Math.PI * 0.1, Math.PI * 0.6, JADE.dark, 1);
    s.set(12, 17, [255, 255, 255]);
    s.rect(14, 11, 5, 3, hex('#c89a2a')); // the fitting it hangs by
    s.rect(14, 11, 5, 1, hex('#ffe08a'));
    s.ellipse(16, 21, 2.5, 2.5, [0, 0, 0, 0]); // punch the hole back out, last
  },

  // Pháp bảo sương — a paper talisman, and the frost is on the paper.
  'frost-talisman': (s) => {
    const paper = shade('#d8c8a0', '#f4ecd0', '#8a7a58');
    s.rect(10, 4, 12, 24, paper.dark);
    s.rect(11, 5, 10, 22, paper.base);
    s.vline(11, 5, 26, paper.light);
    const ink = hex('#8a2028');
    s.vline(16, 8, 22, ink); // sigil: one stroke down, three across
    s.hline(13, 19, 11, ink);
    s.hline(13, 19, 16, ink);
    s.hline(14, 18, 21, ink);
    const ice = hex('#a8e8ff');
    s.hline(11, 20, 27, ice); // frost creeping up from the bottom edge
    for (const x of [12, 15, 18, 20]) s.set(x, 26, ice);
    s.set(13, 25, [255, 255, 255]);
  },
};

/* -------------------------------------------------------------- weapons */

/**
 * Ten blades, in the order they are earned (see ITEM_CATALOG). Length and guard
 * grow with the tier so a rack of them reads as a progression, and the blade's
 * colour is the element in its name — someone who has seen Hàn Băng kiếm once
 * should recognise it in a drop pile without the tooltip.
 */
const SWORDS = [
  { id: 'iron-sword', tier: 0, blade: shade('#8a8e98', '#d0d4dc', '#4a4e58'), grip: '#5a3a20', fitting: '#6a6e78' },
  { id: 'bronze-sword', tier: 1, blade: shade('#a8823c', '#e8c880', '#5e4418'), grip: '#5a3a20', fitting: '#8a6428' },
  { id: 'jade-sword', tier: 2, blade: shade('#4a9e78', '#9ce8bc', '#1e4c38'), grip: '#3a4a3a', fitting: '#c89a2a' },
  { id: 'gale-sword', tier: 3, blade: shade('#7aa8b8', '#d8f4ff', '#38586a'), grip: '#3a4450', fitting: '#a8b8c0' },
  { id: 'frost-sword', tier: 4, blade: shade('#5a9ec8', '#c8f0ff', '#1e4a70'), grip: '#2a3a50', fitting: '#a8e8ff' },
  { id: 'thunder-sword', tier: 5, blade: shade('#8a7ac8', '#e0d8ff', '#3a2c6e'), grip: '#2c2840', fitting: '#ffe08a' },
  { id: 'venom-sword', tier: 6, blade: shade('#6e9e2a', '#c8e86a', '#2e4a10'), grip: '#2e3a20', fitting: '#9ece3a' },
  { id: 'flame-sword', tier: 7, blade: shade('#c86a28', '#ffc070', '#6e2e0a'), grip: '#4a2818', fitting: '#ffa030' },
  { id: 'blood-sword', tier: 8, blade: shade('#b02434', '#ff7078', '#520a18'), grip: '#3a1820', fitting: '#e04a52' },
  { id: 'demon-sword', tier: 9, blade: shade('#3a2c4e', '#a07ad0', '#160e24'), grip: '#241830', fitting: '#c8304a' },
];

function drawSword(s, w) {
  const guardY = 20;
  const tipY = guardY - (13 + Math.round(w.tier * 0.7)); // 13 → 19px of blade
  const half = w.tier >= 6 ? 2 : 1; // late blades are broader

  // Blade: body, lit left bevel, dark right bevel, then the point.
  s.rect(16 - half, tipY + 2, half * 2 + 1, guardY - tipY - 2, w.blade.base);
  s.vline(16 - half, tipY + 2, guardY - 1, w.blade.light);
  s.vline(16 + half, tipY + 2, guardY - 1, w.blade.dark);
  s.line(16 - half, tipY + 2, 16, tipY, w.blade.base);
  s.line(16 + half, tipY + 2, 16, tipY, w.blade.base);
  s.set(16, tipY, w.blade.light);
  if (w.tier >= 2) s.vline(16, tipY + 3, guardY - 2, w.blade.light); // fuller

  // Guard, grip, pommel.
  const gw = 5 + Math.min(4, w.tier);
  s.rect(16 - (gw >> 1), guardY, gw, 2, hex(w.fitting));
  s.rect(16 - (gw >> 1), guardY, gw, 1, hex('#f0e8d0'));
  s.rect(15, guardY + 2, 3, 6, hex(w.grip));
  s.vline(15, guardY + 2, guardY + 7, hex(w.fitting));
  s.ellipse(16, guardY + 9, 2, 2, hex(w.fitting));

  // Only the top blades glow, and it is two pixels of it: at 32px a halo turns
  // every sword into the same bright smear.
  if (w.tier >= 7) {
    s.set(16 - half - 1, tipY + 4, [...w.blade.light, 150]);
    s.set(16 + half + 1, tipY + 7, [...w.blade.light, 150]);
  }
}

/* ------------------------------------------------------------- assemble */

const icons = [];

for (const [type, colour] of Object.entries(GEMS))
  for (const tier of [1, 2, 3])
    icons.push({
      path: join('items', 'gems', `${type}-${tier}.png`),
      draw: (s) => drawGem(s, colour, tier),
    });

for (const [id, draw] of Object.entries(MATERIALS)) {
  // Linh thạch is catalogued as a consumable, not a material — it restores
  // spirit — so it is filed where the loader looks for it.
  const dir = id === 'spirit-stone' ? 'consumables' : 'materials';
  icons.push({ path: join('items', dir, `${id}.png`), draw });
}

for (const [id, draw] of Object.entries(EQUIPMENT))
  icons.push({ path: join('items', 'equipment', `${id}.png`), draw });

for (const w of SWORDS)
  icons.push({ path: join('weapons', `${w.id}.png`), draw: (s) => drawSword(s, w) });

let wrote = 0;
let kept = 0;

for (const icon of icons) {
  const file = join(OUT, icon.path);
  if (!FORCE && existsSync(file)) {
    kept++;
    continue;
  }
  const surface = new Surface(S, S);
  icon.draw(surface);
  surface.outline(RIM);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePNG(surface));
  wrote++;
  console.log(`  ${icon.path}`);
}

console.log(`\n${wrote} icon da ve, ${kept} bo qua (da co art thuc)`);
if (kept && !FORCE) console.log('dung --force de ve de len');
