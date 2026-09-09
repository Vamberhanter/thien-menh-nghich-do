import Phaser from 'phaser';
import type { PropArt } from '../../env/kit';
import type { ZoneDef } from '../../zones';
import type { TerrainContext, TerrainHandle, TerrainSource } from './TerrainSource';

/**
 * Terrain built from a real Phaser tilemap, for maps drawn on a grid.
 *
 * The second `TerrainSource`, and the reason that seam exists. The five
 * original zones lay a single repeating `TileSprite` and scatter props at free
 * pixel positions; Ngũ Hành Sơn is a grid of 64px ground tiles with an island
 * silhouette, a river and a path network, none of which a single repeating
 * texture can express. Nothing outside this folder changed to allow it.
 *
 * What it does *not* do is change the depth model. The map still sorts every
 * standing thing by its foot Y — a character walks behind a tree while above
 * it and in front of the same tree while below it, which one "AbovePlayer"
 * layer cannot do. The tilemap is the floor and the props are sprites, exactly
 * as the other source has it.
 */

/** Ground tile size, measured off the sheet — see `tools/build-nguhanhson.mjs`. */
export const NGUHANHSON_TILE = 64;

/** Nothing: the island's edge, where no ground is drawn and no one may walk. */
export const VOID_TILE = -1;

export interface TilemapProp {
  /** Atlas texture key, e.g. `nhs-tree`. */
  texture: string;
  frame: string;
  /** Where it stands, in world pixels. Depth is this Y. */
  x: number;
  y: number;
  /** Drawn size; omitted keeps the frame's own. */
  width?: number;
  height?: number;
  /**
   * Footprint that blocks movement, in world px, centred on `x` and rising
   * from `y`. Omitted means it is decoration and blocks nothing.
   *
   * Deliberately separate from the art: §9 of the brief asks for collision on
   * the trunk and not the canopy, and the only way to have that is for the box
   * to be stated rather than derived from the sprite.
   */
  solid?: { width: number; height: number };
  /**
   * Drawn over everything, whatever its Y.
   *
   * For the few things that are genuinely above the player's head — a canopy
   * the path runs under, the front edge of a roof. Everything else should sort
   * by foot Y instead, which is what makes the depth read correctly.
   */
  overhead?: boolean;
  /** Tint, for the far mountains that sit back in the haze. */
  tint?: number;
  alpha?: number;
  /**
   * Fixed depth instead of the foot Y.
   *
   * For the two kinds of prop that are not standing on the ground the
   * player walks on: a backdrop that belongs behind the island entirely
   * (`BACKDROP_DEPTH`) and a surface that is part of the floor, like the
   * face of a lake (`FLOOR_DEPTH`). Anything a character can walk past
   * must keep sorting by its foot Y or the depth reads wrong.
   */
  depth?: number;
  /**
   * Skip the scene lighting.
   *
   * Only for backdrop art. The far range is painted with its own light and
   * its own haze; running the zone ambient over it darkens it into the
   * island instead of behind it.
   */
  unlit?: boolean;
}

export interface TilemapLayout {
  /** Ground indices, row-major, `height` rows of `width`. `-1` is void. */
  ground: readonly number[];
  /** Second pass drawn over the ground — path edges, water, cobble. */
  overlay?: readonly number[];
  /** True where movement is blocked, row-major. Void is blocked regardless. */
  blocked: readonly boolean[];
  props: readonly TilemapProp[];
  /**
   * What shows where no ground is drawn.
   *
   * A floating island needs it. Without one the void reads as a hole in the
   * renderer rather than as sky, which is exactly how it looked the first time
   * this map ran: black corners around a green island.
   *
   * A pair is a vertical gradient, top colour first. One flat colour across
   * a 1920px drop is what made the void read as a slab of paint even after
   * it stopped being black.
   */
  sky?: number | readonly [number, number];
  /** Tiles wide and high; `ZoneDef.width` stays the pixel size. */
  cols: number;
  rows: number;
}

/**
 * One `layout.props` entry as it actually exists in the scene — the live
 * sprite (and its collision body, if it has one), not a copy of the data.
 * `MapEditor` reads and writes these directly so an edit to a prop the zone
 * already had and one placed in the same session go through identical code.
 */
export interface EditableProp {
  readonly def: TilemapProp;
  readonly sprite: Phaser.GameObjects.Image;
  readonly body?: Phaser.Physics.Arcade.Sprite;
}

/** A map that carries a grid says so with these. */
export type TilemapZone = ZoneDef & { terrain: 'tilemap'; layout: TilemapLayout };

export function isTilemapZone(map: ZoneDef): map is TilemapZone {
  return (map as TilemapZone).terrain === 'tilemap';
}

/** Behind the ground, so the island's edge has something to float over. */
const SKY_DEPTH = -2000;
/** In front of the sky and behind the ground: the far range, cloud, horizon. */
export const BACKDROP_DEPTH = -1500;
/** Ground depth; props and characters sort above it by their own Y. */
const GROUND_DEPTH = -1000;
const OVERLAY_DEPTH = -990;
/** Part of the floor rather than standing on it — water, a painted circle. */
export const FLOOR_DEPTH = -980;
/** Above every foot Y a 2560x1920 map can produce, and below the HUD. */
const OVERHEAD_DEPTH = 8000;

export class TilemapTerrain implements TerrainSource {
  readonly id = 'tilemap';

  build(scene: Phaser.Scene, map: ZoneDef, context: TerrainContext): TerrainHandle {
    if (!isTilemapZone(map)) {
      throw new Error(`TilemapTerrain: zone "${map.id}" khong co layout`);
    }
    const { layout } = map;
    const made: Phaser.GameObjects.GameObject[] = [];
    const overhead: Phaser.GameObjects.GameObject[] = [];

    if (layout.sky !== undefined) {
      const [high, low] = typeof layout.sky === 'number' ? [layout.sky, layout.sky] : layout.sky;
      const sky = scene.add.graphics().setDepth(SKY_DEPTH);
      sky.fillGradientStyle(high, high, low, low, 1);
      sky.fillRect(0, 0, map.width, map.height);
      // Deliberately unlit: the ambient of a bright outdoor zone would darken
      // it, and sky is the one thing in the scene that is its own light.
      made.push(sky);
    }

    /*
     * Two tile layers over one map, not two maps.
     *
     * The ground layer is the biome and the overlay is what is laid on top of
     * it — a path across grass, a river bank against sand. Doing it with one
     * layer would need a tile for every pairing the map ever uses; doing it
     * with two needs only the pieces.
     */
    const tilemap = scene.make.tilemap({
      tileWidth: NGUHANHSON_TILE,
      tileHeight: NGUHANHSON_TILE,
      width: layout.cols,
      height: layout.rows,
    });
    const tileset = tilemap.addTilesetImage(
      'nhs-ground',
      'nhs-ground',
      NGUHANHSON_TILE,
      NGUHANHSON_TILE,
      0,
      0,
    );
    if (!tileset) throw new Error('TilemapTerrain: thieu tileset "nhs-ground"');

    const ground = tilemap.createBlankLayer('ground', tileset, 0, 0);
    const overlay = tilemap.createBlankLayer('overlay', tileset, 0, 0);
    if (!ground || !overlay) throw new Error('TilemapTerrain: khong tao duoc layer');
    ground.setDepth(GROUND_DEPTH);
    overlay.setDepth(OVERLAY_DEPTH);
    context.lighting.light(ground, overlay);
    made.push(ground, overlay);

    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const at = row * layout.cols + col;
        const base = layout.ground[at] ?? VOID_TILE;
        if (base >= 0) ground.putTileAt(base, col, row);
        const over = layout.overlay?.[at] ?? VOID_TILE;
        if (over >= 0) overlay.putTileAt(over, col, row);
      }
    }

    /*
     * Blocked tiles become static bodies rather than tilemap collision.
     *
     * `setCollisionByExclusion` would be shorter, but the player's body is
     * placed by hand every frame to sit under the feet (see `Wukong.syncBody`)
     * and the scene already runs one graze-forgiving process callback against
     * `solids` — see `WorldScene.grazesProp`. Feeding the same group keeps one
     * collision path for the whole game instead of two that behave differently
     * at a corner.
     */
    let bodies = 0;
    // Keyed "col,row" — `MapEditor` looks a cell up here when the ground brush
    // paints something walkable over what used to be water or the void, so it
    // can take the one body blocking that cell back out again.
    const blockedBodies = new Map<string, Phaser.Physics.Arcade.Sprite>();
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const at = row * layout.cols + col;
        const solid = layout.blocked[at] || (layout.ground[at] ?? VOID_TILE) < 0;
        if (!solid) continue;
        const block = addBlock(
          context.solids,
          col * NGUHANHSON_TILE + NGUHANHSON_TILE / 2,
          row * NGUHANHSON_TILE + NGUHANHSON_TILE / 2,
          NGUHANHSON_TILE,
          NGUHANHSON_TILE,
        );
        blockedBodies.set(`${col},${row}`, block);
        bodies++;
      }
    }

    // Every prop `layout.props` placed, live and handed back — `MapEditor`
    // selects, drags and deletes these directly rather than tracking its own
    // shadow copy, so there is exactly one sprite for each and moving one in
    // the editor is the same call the sketch above the file already makes.
    const editableProps: EditableProp[] = [];
    for (const prop of layout.props) {
      const sprite = scene.add
        .image(prop.x, prop.y, prop.texture, prop.frame)
        // Bottom-centre: the anchor is where the thing touches the ground, so
        // its depth is its own foot Y and it sorts against characters correctly.
        .setOrigin(0.5, 1)
        .setDepth(prop.depth ?? (prop.overhead ? OVERHEAD_DEPTH : prop.y));
      if (prop.width && prop.height) sprite.setDisplaySize(prop.width, prop.height);
      if (prop.tint !== undefined) sprite.setTint(prop.tint);
      if (prop.alpha !== undefined) sprite.setAlpha(prop.alpha);
      if (!prop.unlit) context.lighting.light(sprite);
      made.push(sprite);
      if (prop.overhead) overhead.push(sprite);
      let body: Phaser.Physics.Arcade.Sprite | undefined;
      if (prop.solid) {
        body = addBlock(context.solids, prop.x, prop.y - prop.solid.height / 2, prop.solid.width, prop.solid.height);
        bodies++;
      }
      editableProps.push({ def: prop, sprite, body });
    }

    if (import.meta.env.DEV) {
      console.info(
        `tilemap ${map.id}: ${layout.cols}x${layout.rows} tile, ` +
          `${layout.props.length} prop, ${bodies} o chan`,
      );
    }

    return {
      width: map.width,
      height: map.height,
      // A tilemap has no scattered clutter to hand back: what would have been
      // decals is drawn into the overlay layer.
      decals: [],
      overhead,
      tileLayers: { ground, overlay, cols: layout.cols, rows: layout.rows, tileSize: NGUHANHSON_TILE },
      editableProps,
      blockedBodies,
      addSolid: (art: PropArt, x: number, y: number) => addProp(scene, context, art, x, y),
      destroy: () => {
        for (const object of made) object.destroy();
        made.length = 0;
        overhead.length = 0;
        tilemap.destroy();
      },
    };
  }
}

/** One invisible blocking box, centred on (x, y). Returns it — `MapEditor` needs the reference to move or remove one. */
export function addBlock(
  solids: Phaser.Physics.Arcade.StaticGroup,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.Physics.Arcade.Sprite {
  const block = solids.create(x, y, undefined as unknown as string) as Phaser.Physics.Arcade.Sprite;
  block.setVisible(false);
  const body = block.body as Phaser.Physics.Arcade.StaticBody;
  body.setSize(width, height);
  body.position.set(x - width / 2, y - height / 2);
  body.updateCenter();
  return block;
}

/**
 * The training stones the scene places itself.
 *
 * A tilemap zone declares its scenery in the layout, but `WorldScene` still
 * asks for one kind of prop directly — a stone that takes damage — so the
 * handle has to answer. Same placement rule as the sprite source.
 */
function addProp(
  scene: Phaser.Scene,
  context: TerrainContext,
  art: PropArt,
  x: number,
  y: number,
): Phaser.Physics.Arcade.Sprite {
  const sprite = context.solids.create(x, y, art.texture) as Phaser.Physics.Arcade.Sprite;
  context.lighting.light(sprite);
  sprite.setOrigin(0.5, art.originY).setDepth(y);
  const box = art.box;
  if (box) {
    const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(box.width, box.height);
    body.position.set(x - box.width / 2, y + box.offsetY);
    body.updateCenter();
  }
  void scene;
  return sprite;
}
